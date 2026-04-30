import uuid
import json
from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from typing import Optional, List, AsyncGenerator

from app.core.database import get_db
from app.core.security import get_current_user, get_current_workspace
from app.core.config import settings
from app.models.user import User
from app.models.workspace import Workspace
from app.models.conversation import Conversation, Message, MessageRole
from app.models.agent import Agent
from app.schemas.chat import ChatRequest, ChatResponse, ConversationResponse, ConversationDetailResponse, MessageResponse
from app.agents.orchestrator import route_to_agent, run_agent_stream, get_agent_config, AgentRedirectSignal, AgentToolCallSignal

router = APIRouter()


async def get_or_create_conversation(db: AsyncSession, session_id: Optional[str], workspace_id: int, is_test: bool = False) -> Conversation:
    if session_id:
        result = await db.execute(
            select(Conversation).where(
                Conversation.session_id == session_id,
                Conversation.workspace_id == workspace_id
            )
        )
        conv = result.scalar_one_or_none()
        if conv:
            return conv

    # Nova conversa
    new_session_id = session_id or str(uuid.uuid4())
    conv = Conversation(session_id=new_session_id, is_test=is_test, workspace_id=workspace_id)
    db.add(conv)
    await db.flush()
    return conv


async def build_history(db: AsyncSession, conversation_id: int) -> List[dict]:
    result = await db.execute(
        select(Message)
        .where(Message.conversation_id == conversation_id)
        .order_by(Message.created_at.desc())
        .limit(20)  # Últimas 20 mensagens
    )
    messages = result.scalars().all()
    # Reordena para ordem cronológica (ASC) antes de enviar para o LLM
    messages = list(reversed(messages))
    return [{"role": m.role.value, "content": m.content} for m in messages]


@router.post(
    "/",
    summary="Enviar mensagem (streaming)",
)
async def chat(
    request: ChatRequest, 
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    workspace: Workspace = Depends(get_current_workspace)
):
    conv = await get_or_create_conversation(db, request.session_id, workspace.id, request.is_test)
    history = await build_history(db, conv.id)

    # Salva mensagem do usuário
    user_msg = Message(
        conversation_id=conv.id,
        role=MessageRole.USER,
        content=request.message,
    )
    db.add(user_msg)
    conv.message_count += 1
    await db.flush()

    # Roteia para o agente correto ou usa o especificado (Direct Chat)
    if request.agent_slug:
        routing_result = {"slug": request.agent_slug, "debug": {"reason": "Chat Direto Playground"}}
    else:
        routing_result = await route_to_agent(db, request.message, history, workspace_id=workspace.id, api_key=current_user.openrouter_key, workspace=workspace)

    initial_agent_slug = routing_result["slug"]
    agent_slug = initial_agent_slug
    agent = await get_agent_config(db, agent_slug, workspace.id)

    if not agent:
        raise HTTPException(status_code=404, detail=f"Agente {agent_slug} não encontrado ou inativo")

    agent_name = agent.name
    agent_emoji = agent.emoji
    agent_color = agent.color

    # Trilha de roteamento inicial (Full Trace)
    trace_log = {
        "supervisor": routing_result.get("debug", {}),
        "supervisor_selection": initial_agent_slug,
        "calls": [],
        "final_agent": None,
    }

    async def event_stream() -> AsyncGenerator[str, None]:
        nonlocal agent_slug, agent_name, agent_emoji, agent_color, trace_log
        
        max_redirects = settings.MAX_AGENT_HOPS
        current_redirect = 0
        response_text = ""
        current_redirect_context = None
        trip_count = 0

        total_usage = {
            "prompt_tokens": 0,
            "completion_tokens": 0,
            "total_tokens": 0,
            "total_cost": 0.0
        }

        # Adiciona uso do supervisor se disponível
        sup_usage = trace_log.get("supervisor", {}).get("usage", {})
        if sup_usage:
            for k in ["prompt_tokens", "completion_tokens", "total_tokens"]:
                total_usage[k] += sup_usage.get(k, 0)
            # Suporta tanto total_cost quanto cost (OpenRouter envia cost às vezes)
            cost = sup_usage.get("total_cost", sup_usage.get("cost", 0.0))
            total_usage["total_cost"] += float(cost)

        while True:
            trip_count += 1
            print(f"\n{'='*20} TRIP #{trip_count} {'='*20}")
            print(f"[AGENT] Ativo: {agent_slug} ({agent_name})")
            # Evento inicial de seleção do agente
            yield f'data: {json.dumps({"type": "agent_selected", "agent_slug": agent_slug, "agent_name": agent_name, "agent_emoji": agent_emoji, "agent_color": agent_color, "session_id": conv.session_id})}\n\n'

            step_log = {}
            full_response = []
            try:
                # Inicia o stream no agente atual, passando o tracer e possível contexto de redirecionamento
                async for chunk in run_agent_stream(
                    db, agent_slug, request.message, history, 
                    context=current_redirect_context, 
                    trace_log=step_log,
                    workspace_id=workspace.id,
                    api_key=current_user.openrouter_key,
                    workspace=workspace
                ):
                    full_response.append(chunk)
                    yield f'data: {json.dumps({"type": "token", "content": chunk})}\n\n'
                
                # Se terminou sem erro de redirecionamento, salva o trace do step e sai
                step_log["success"] = True
                trace_log["calls"].append(step_log)
                response_text += "".join(full_response)
                break
                
            except AgentRedirectSignal as redirect:
                old_slug = agent_slug
                
                # Se já atingiu o limite de saltos permitidos, encerra sem chamar novo agente
                if current_redirect >= max_redirects:
                    error_msg = "\n\n⚠️ Limite de redirecionamentos atingido. Não foi possível completar sua solicitação."
                    yield f'data: {json.dumps({"type": "token", "content": error_msg})}\n\n'
                    response_text += error_msg
                    
                    step_log["success"] = False
                    step_log["error"] = "Max redirects reached"
                    trace_log["calls"].append(step_log)
                    break

                agent_slug = redirect.target_slug
                target_slug_reason = redirect.reason
                
                # Salva o log do passo que falhou/redirecionou
                step_log["success"] = False
                step_log["redirected_to"] = agent_slug
                step_log["redirect_reason"] = target_slug_reason
                if not step_log.get("raw_ai_output"):
                    step_log["raw_ai_output"] = redirect.raw_response
                
                trace_log["calls"].append(step_log)
                current_redirect += 1

                # Informa no log e recarrega as configs do novo agente
                print(f"[RE-ROUTE] Da: {old_slug} Para: {agent_slug} | Motivo: {target_slug_reason}")
                agent = await get_agent_config(db, agent_slug, workspace.id)
                agent_name = agent.name if agent else agent_slug
                agent_emoji = agent.emoji if agent else "🤖"
                agent_color = agent.color if agent else "#F59E0B"
                
                # Monta o contexto para o próximo agente (o alvo do redirecionamento)
                current_redirect_context = f"⚠️ [ATENÇÃO DO SISTEMA]\nVocê está recebendo este usuário após um roteamento/redirecionamento disparado pelo agente '{old_slug}'.\nO agente anterior informou a seguinte justificativa para te chamar: \"{target_slug_reason}\"\n\nAssuma o atendimento a partir daqui para sanar a dor apontada!"
                
            except AgentToolCallSignal as tool_req:
                # O Agente decidiu chamar uma Tool!
                step_log["success"] = True
                step_log["tool_call"] = {
                    "name": tool_req.tool_name,
                    "arguments": tool_req.arguments
                }
                step_log["raw_ai_output"] = tool_req.raw_response
                trace_log["calls"].append(step_log)
                print(f"[TOOL CALL] Tool: {tool_req.tool_name} | Args: {tool_req.arguments}")

                # Salva o texto que foi gerado até agora, se houver
                response_text += "".join(full_response)
                
                # Feedback visual na UI
                yield f'data: {json.dumps({"type": "tool_call", "tool_name": tool_req.tool_name})}\n\n'

                try:
                    import httpx
                    from app.core.security import create_access_token
                    internal_token = create_access_token({"sub": "admin@realestateassistant.com"})
                    
                    async with httpx.AsyncClient(timeout=15.0) as client:
                        t_res = await client.post(
                            f"http://localhost:8000/api/v1/tools/{tool_req.tool_name}/execute",
                            json={"params": tool_req.arguments},
                            headers={"Authorization": f"Bearer {internal_token}"}
                        )
                    res_data = t_res.json()
                    res_str = json.dumps(res_data.get("result", res_data), ensure_ascii=False)
                    step_log["tool_result"] = res_data.get("result", res_data)
                except Exception as e:
                    res_str = f"Erro interno ao executar a ferramenta: {str(e)}"
                    step_log["tool_result"] = {"error": str(e)}
                
                print(f"[TOOL RESULT] Status: {t_res.status_code if 't_res' in locals() else 'ERROR'} | Time: {int((time.time() - start_time)*1000) if 'start_time' in locals() else '??'}ms")
                print(f"{'-'*50}")
                
                # Alimenta o LLM de volta com a resposta real do backend
                current_redirect_context = f"⚠️ [ATENÇÃO DO SISTEMA]\nVocê acabou de solicitar a execução da ferramenta '{tool_req.tool_name}'.\n\n**DADOS RETORNADOS DA FERRAMENTA:**\n```json\n{res_str}\n```\n\nAnalise detalhadamente as informações e responda ao usuário (sem usar a mesma ferramenta repetidamente caso ela já tenha retornado os dados necessários)."
                
                # O loop continua imediatamente com o LLM recebendo este novo contexto e respondendo ao usuário

        # Agrega uso de todos os calls
        for call in trace_log.get("calls", []):
            usage = call.get("usage", {})
            if usage:
                for k in ["prompt_tokens", "completion_tokens", "total_tokens"]:
                    total_usage[k] += usage.get(k, 0)
                cost = usage.get("total_cost", usage.get("cost", 0.0))
                total_usage["total_cost"] += float(cost)

        trace_log["total_usage"] = total_usage
        trace_log["final_agent"] = agent_slug
        # Envia o log de trace no final da stream
        yield f'data: {json.dumps({"type": "debug_trace", "trace": trace_log})}\n\n'

        # Salva a resposta do ÚLTIMO agente que efetivamente respondeu
        assistant_msg = Message(
            conversation_id=conv.id,
            role=MessageRole.ASSISTANT,
            content=response_text,
            agent_slug=agent_slug,
            agent_name=agent_name,
            agent_emoji=agent_emoji,
            metadata_=trace_log
        )
        db.add(assistant_msg)
        conv.message_count += 1
        conv.last_agent_slug = agent_slug

        if conv.is_test:
            from app.agents.openrouter import openrouter
            recent_context = "\\n".join([f"{h['role'].upper()}: {h['content'][:100]}" for h in history[-3:]])
            title_prompt = f"Histórico recente:\\n{recent_context}\\n\\nNova mensagem: '{request.message}'\\n\\nGere um título direto e curto (até 5 palavras) resumindo o ASSUNTO ATUAL desta conversa. Retorne APENAS o novo título (sem aspas, sem pontuação). Atualize-o baseado no progresso."
            
            try:
                result = await openrouter.simple_complete(
                    system_prompt="Você é um assistente cirúrgico focado em dar títulos curtíssimos e minimalistas para conversas.",
                    user_message=title_prompt,
                    model=workspace.supervisor_model or settings.DEFAULT_SUPERVISOR_MODEL,
                    temperature=0.3,
                    max_tokens=20,
                    api_key=current_user.openrouter_key
                )
                bot_title = result["content"]
                conv.title = bot_title.strip().strip('"').strip("'")
            except Exception:
                if conv.message_count <= 2:
                    conv.title = request.message[:60] + ("..." if len(request.message) > 60 else "")
        else:
            # Real users: keep original slice logic for first message only
            if conv.message_count <= 2:
                conv.title = request.message[:60] + ("..." if len(request.message) > 60 else "")

        await db.commit()

        yield f'data: {json.dumps({"type": "done", "session_id": conv.session_id})}\n\n'

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
        },
    )


@router.get(
    "/conversations",
    response_model=List[ConversationResponse],
    summary="Listar conversas",
    description="Retorna histórico de todas as conversas, ordenadas pela mais recente.",
)
async def list_conversations(
    is_test: Optional[bool] = Query(None, description="Filtrar por is_test"),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    workspace: Workspace = Depends(get_current_workspace)
):
    offset = (page - 1) * page_size
    query = select(Conversation).where(Conversation.workspace_id == workspace.id)
    
    if is_test is not None:
        query = query.where(Conversation.is_test == is_test)
        
    query = query.order_by(Conversation.updated_at.desc()).offset(offset).limit(page_size)
    
    result = await db.execute(query)
    return [ConversationResponse.model_validate(c) for c in result.scalars().all()]


@router.get(
    "/conversations/{session_id}",
    response_model=ConversationDetailResponse,
    summary="Histórico da conversa",
    description="Retorna todos os dados e mensagens de uma conversa específica.",
)
async def get_conversation(
    session_id: str, 
    db: AsyncSession = Depends(get_db),
    workspace: Workspace = Depends(get_current_workspace)
):
    result = await db.execute(
        select(Conversation).where(
            Conversation.session_id == session_id,
            Conversation.workspace_id == workspace.id
        )
    )
    conv = result.scalar_one_or_none()
    if not conv:
        raise HTTPException(status_code=404, detail="Conversa não encontrada")

    msg_result = await db.execute(
        select(Message)
        .where(Message.conversation_id == conv.id)
        .order_by(Message.created_at)
    )
    messages = msg_result.scalars().all()

    conv_data = ConversationDetailResponse(
        id=conv.id,
        session_id=conv.session_id,
        title=conv.title,
        last_agent_slug=conv.last_agent_slug,
        message_count=conv.message_count,
        total_tokens=conv.total_tokens,
        created_at=conv.created_at,
        updated_at=conv.updated_at,
        messages=[MessageResponse.model_validate(m) for m in messages],
    )
    return conv_data


@router.delete(
    "/conversations/{session_id}",
    status_code=204,
    summary="Deletar conversa",
    description="Remove uma conversa e todas as suas mensagens do sistema.",
)
async def delete_conversation(
    session_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    workspace: Workspace = Depends(get_current_workspace)
):
    result = await db.execute(
        select(Conversation).where(
            Conversation.session_id == session_id,
            Conversation.workspace_id == workspace.id
        )
    )
    conv = result.scalar_one_or_none()
    if not conv:
        raise HTTPException(status_code=404, detail="Conversa não encontrada")

    # Deleta mensagens
    msg_result = await db.execute(
        select(Message).where(Message.conversation_id == conv.id)
    )
    for msg in msg_result.scalars().all():
        await db.delete(msg)

    await db.delete(conv)
    await db.commit()
