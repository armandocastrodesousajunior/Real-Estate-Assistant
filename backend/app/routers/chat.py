import uuid
import json
from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from typing import Optional, List, AsyncGenerator

from app.core.database import get_db
from app.core.security import get_current_user
from app.core.config import settings
from app.models.conversation import Conversation, Message, MessageRole
from app.models.agent import Agent
from app.schemas.chat import ChatRequest, ChatResponse, ConversationResponse, ConversationDetailResponse, MessageResponse
from app.agents.orchestrator import route_to_agent, run_agent_stream, get_agent_config, AgentRedirectSignal

router = APIRouter()


async def get_or_create_conversation(db: AsyncSession, session_id: Optional[str]) -> Conversation:
    if session_id:
        result = await db.execute(
            select(Conversation).where(Conversation.session_id == session_id)
        )
        conv = result.scalar_one_or_none()
        if conv:
            return conv

    # Nova conversa
    new_session_id = session_id or str(uuid.uuid4())
    conv = Conversation(session_id=new_session_id)
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
    description="""
Envia uma mensagem para o sistema multi-agentes e recebe a resposta via **Server-Sent Events (SSE)**.

### Como funciona:
1. O **Supervisor** analisa a mensagem e roteia ao agente mais adequado
2. O agente especializado gera a resposta com streaming em tempo real
3. Eventos SSE são emitidos com `data:` prefix

### Formato dos eventos SSE:
```
data: {"type": "agent_selected", "agent_slug": "property_finder", "agent_name": "Buscador de Imóveis", "agent_emoji": "🏠"}
data: {"type": "token", "content": "Olá "}
data: {"type": "token", "content": "como posso ajudar?"}
data: {"type": "done", "session_id": "uuid", "tokens": 42}
```
""",
)
async def chat(request: ChatRequest, db: AsyncSession = Depends(get_db)):
    conv = await get_or_create_conversation(db, request.session_id)
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
        routing_result = await route_to_agent(db, request.message, history)

    initial_agent_slug = routing_result["slug"]
    agent_slug = initial_agent_slug
    agent = await get_agent_config(db, agent_slug)

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

        while True:
            # Evento inicial de seleção do agente
            yield f'data: {json.dumps({"type": "agent_selected", "agent_slug": agent_slug, "agent_name": agent_name, "agent_emoji": agent_emoji, "agent_color": agent_color, "session_id": conv.session_id})}\n\n'

            step_log = {}
            full_response = []
            try:
                # Inicia o stream no agente atual, passando o tracer
                async for chunk in run_agent_stream(db, agent_slug, request.message, history, trace_log=step_log):
                    full_response.append(chunk)
                    yield f'data: {json.dumps({"type": "token", "content": chunk})}\n\n'
                
                # Se terminou sem erro de redirecionamento, salva o trace do step e sai
                step_log["success"] = True
                trace_log["calls"].append(step_log)
                response_text = "".join(full_response)
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
                print(f"[RE-ROUTE] Agente {old_slug} recusou e roteou para: {agent_slug}")
                agent = await get_agent_config(db, agent_slug)
                agent_name = agent.name if agent else agent_slug
                agent_emoji = agent.emoji if agent else "🤖"
                agent_color = agent.color if agent else "#F59E0B"
                # O laço recomeça enviando um novo agent_selected e iterando!

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

        # Atualiza título da conversa se for a primeira mensagem
        if conv.message_count <= 2:
            title = request.message[:60] + ("..." if len(request.message) > 60 else "")
            conv.title = title

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
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
    _: dict = Depends(get_current_user),
):
    offset = (page - 1) * page_size
    result = await db.execute(
        select(Conversation)
        .order_by(Conversation.updated_at.desc())
        .offset(offset)
        .limit(page_size)
    )
    return [ConversationResponse.model_validate(c) for c in result.scalars().all()]


@router.get(
    "/conversations/{session_id}",
    response_model=ConversationDetailResponse,
    summary="Histórico da conversa",
    description="Retorna todos os dados e mensagens de uma conversa específica.",
)
async def get_conversation(session_id: str, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(Conversation).where(Conversation.session_id == session_id)
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
    _: dict = Depends(get_current_user),
):
    result = await db.execute(
        select(Conversation).where(Conversation.session_id == session_id)
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
