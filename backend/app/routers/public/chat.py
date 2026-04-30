import uuid
import json
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Security
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.core.database import get_db
from app.core.security import get_workspace_by_api_token
from app.core.config import settings
from app.models.user import User
from app.models.workspace import Workspace
from app.models.conversation import Conversation, Message, MessageRole
from app.models.lead import Lead, LeadStatus, LeadSource
from app.agents.orchestrator import route_to_agent, run_agent_stream, get_agent_config, AgentRedirectSignal, AgentToolCallSignal
from app.routers.private.chat import build_history

router = APIRouter()

# Schemas específicos para a API Pública
class PublicChatRequest(BaseModel):
    message: str = Field(..., min_length=1, max_length=4000, description="Mensagem do usuário")
    session_id: Optional[str] = Field(None, description="ID da sessão. Deixe em branco para iniciar uma nova conversa.")

class PublicChatResponse(BaseModel):
    session_id: str
    response: str
    agent_name: str
    agent_emoji: str


async def get_or_create_public_conversation(db: AsyncSession, session_id: Optional[str], workspace_id: int) -> Conversation:
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

    # Nova conversa (sempre is_test = False na API Pública)
    new_session_id = session_id or str(uuid.uuid4())
    conv = Conversation(session_id=new_session_id, is_test=False, workspace_id=workspace_id)
    db.add(conv)
    await db.flush() # Flush para obter o conv.id

    # Cria o Lead vinculado a esta nova conversa
    new_lead = Lead(
        name="Lead Anônimo (API)",
        status=LeadStatus.NEW,
        source=LeadSource.CHAT_AI,
        conversation_id=conv.id,
        workspace_id=workspace_id
    )
    db.add(new_lead)
    await db.flush()

    return conv


@router.post(
    "/",
    response_model=PublicChatResponse,
    summary="Enviar Mensagem",
    description="""
Envia uma mensagem de texto para ser processada pela inteligência artificial. 
O sistema processará a mensagem (incluindo chamadas de ferramentas e roteamento entre agentes) e retornará a resposta final em formato JSON.
Se nenhum `session_id` for fornecido, uma nova sessão será criada automaticamente, juntamente com um novo Lead no sistema.
""",
)
async def chat_public(
    request: PublicChatRequest, 
    db: AsyncSession = Depends(get_db),
    workspace: Workspace = Security(get_workspace_by_api_token)
):
    # Busca a chave do dono do workspace para usar na IA
    result = await db.execute(select(User).where(User.id == workspace.owner_id))
    owner = result.scalar_one_or_none()
    api_key = owner.openrouter_key if owner else None

    # Obtém ou cria a conversa e o lead
    conv = await get_or_create_public_conversation(db, request.session_id, workspace.id)
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

    # Roteamento Automático (sempre via Supervisor na API Pública)
    routing_result = await route_to_agent(db, request.message, history, workspace_id=workspace.id, api_key=api_key, workspace=workspace)

    initial_agent_slug = routing_result["slug"]
    agent_slug = initial_agent_slug
    agent = await get_agent_config(db, agent_slug, workspace.id)

    if not agent:
        raise HTTPException(status_code=404, detail=f"Agente {agent_slug} não encontrado ou inativo no workspace.")

    agent_name = agent.name
    agent_emoji = agent.emoji

    trace_log = {
        "supervisor": routing_result.get("debug", {}),
        "supervisor_selection": initial_agent_slug,
        "calls": [],
        "final_agent": None,
    }

    max_redirects = settings.MAX_AGENT_HOPS
    current_redirect = 0
    response_text = ""
    current_redirect_context = None

    total_usage = {"prompt_tokens": 0, "completion_tokens": 0, "total_tokens": 0, "total_cost": 0.0}

    # Supervisor usage
    sup_usage = trace_log.get("supervisor", {}).get("usage", {})
    if sup_usage:
        for k in ["prompt_tokens", "completion_tokens", "total_tokens"]:
            total_usage[k] += sup_usage.get(k, 0)
        total_usage["total_cost"] += float(sup_usage.get("total_cost", sup_usage.get("cost", 0.0)))

    while True:
        step_log = {}
        full_response = []
        try:
            # Consome o gerador assíncrono para obter todos os chunks do OpenRouter
            async for chunk in run_agent_stream(
                db, agent_slug, request.message, history, 
                context=current_redirect_context, 
                trace_log=step_log,
                workspace_id=workspace.id,
                api_key=api_key,
                workspace=workspace
            ):
                full_response.append(chunk)
            
            step_log["success"] = True
            trace_log["calls"].append(step_log)
            response_text += "".join(full_response)
            break # Fim do processamento (resposta final obtida)
            
        except AgentRedirectSignal as redirect:
            old_slug = agent_slug
            if current_redirect >= max_redirects:
                error_msg = "\n\n⚠️ Limite de redirecionamentos atingido."
                response_text += error_msg
                step_log["success"] = False
                trace_log["calls"].append(step_log)
                break

            agent_slug = redirect.target_slug
            target_slug_reason = redirect.reason
            step_log["success"] = False
            step_log["redirected_to"] = agent_slug
            if not step_log.get("raw_ai_output"): 
                step_log["raw_ai_output"] = redirect.raw_response
            trace_log["calls"].append(step_log)
            current_redirect += 1

            ag = await get_agent_config(db, agent_slug, workspace.id)
            agent_name = ag.name if ag else agent_slug
            agent_emoji = ag.emoji if ag else "🤖"
            current_redirect_context = f"⚠️ [SISTEMA] Redirecionado de '{old_slug}' pelo motivo: \"{target_slug_reason}\""
            
        except AgentToolCallSignal as tool_req:
            step_log["success"] = True
            step_log["tool_call"] = {"name": tool_req.tool_name, "arguments": tool_req.arguments}
            step_log["raw_ai_output"] = tool_req.raw_response
            trace_log["calls"].append(step_log)
            response_text += "".join(full_response)

            try:
                import httpx
                from app.core.security import create_access_token
                # Um token interno falso apenas para bypass nas ferramentas que precisam, ou o próprio get_workspace
                internal_token = create_access_token({"sub": "admin@realestateassistant.com"})
                async with httpx.AsyncClient(timeout=15.0) as client:
                    t_res = await client.post(
                        f"http://localhost:8000/api/v1/tools/{tool_req.tool_name}/execute",
                        json={"params": tool_req.arguments},
                        headers={"Authorization": f"Bearer {internal_token}"}
                    )
                res_data = t_res.json()
                res_str = json.dumps(res_data.get("result", res_data), ensure_ascii=False)
            except Exception as e:
                res_str = f"Erro: {str(e)}"
            
            current_redirect_context = f"DADOS DA FERRAMENTA '{tool_req.tool_name}':\n```json\n{res_str}\n```"

    # Aggregating tokens
    for call in trace_log.get("calls", []):
        u = call.get("usage", {})
        if u:
            for k in ["prompt_tokens", "completion_tokens", "total_tokens"]:
                total_usage[k] += u.get(k, 0)
            total_usage["total_cost"] += float(u.get("total_cost", u.get("cost", 0.0)))

    trace_log["total_usage"] = total_usage
    trace_log["final_agent"] = agent_slug

    # Salva a mensagem do assistente
    assistant_msg = Message(
        conversation_id=conv.id, role=MessageRole.ASSISTANT,
        content=response_text, agent_slug=agent_slug,
        agent_name=agent_name, agent_emoji=agent_emoji, metadata_=trace_log
    )
    db.add(assistant_msg)
    conv.message_count += 1
    conv.last_agent_slug = agent_slug

    if conv.message_count <= 2:
        conv.title = request.message[:60] + ("..." if len(request.message) > 60 else "")

    await db.commit()

    return PublicChatResponse(
        session_id=conv.session_id,
        response=response_text,
        agent_name=agent_name,
        agent_emoji=agent_emoji
    )
