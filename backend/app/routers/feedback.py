from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from typing import Optional
from pydantic import BaseModel
import json

from app.core.database import get_db
from app.core.security import get_current_user, get_current_workspace
from app.models.user import User
from app.models.workspace import Workspace
from app.models.feedback import MessageFeedback
from app.models.agent import Agent
from app.models.prompt import Prompt
from app.agents.openrouter import openrouter
from app.core.config import settings
from loguru import logger

router = APIRouter()


# ── Schemas ──────────────────────────────────────────────────────────────────

class FeedbackCreate(BaseModel):
    agent_slug:   str
    user_message: str
    ai_response:  str
    rating:       str          # "positive" | "negative"
    correction:   Optional[str] = None
    model_used:   Optional[str] = None
    session_id:   Optional[str] = None


# ── Endpoints ─────────────────────────────────────────────────────────────────

@router.post("", summary="Registrar feedback de mensagem")
async def submit_feedback(
    data: FeedbackCreate,
    db: AsyncSession = Depends(get_db),
    workspace: Workspace = Depends(get_current_workspace),
    current_user: User = Depends(get_current_user),
):
    if data.rating not in ("positive", "negative"):
        raise HTTPException(status_code=422, detail="rating deve ser 'positive' ou 'negative'")

    # Gerar a string de contexto para o RAG Vetorial
    knowledge_text = f"User: {data.user_message}\nAI: {data.ai_response}"
    if data.correction:
        knowledge_text += f"\nCorrection: {data.correction}"
    
    vector = await openrouter.get_embeddings(knowledge_text, api_key=current_user.openrouter_key)
    embedding_str = json.dumps(vector) if vector else None

    fb = MessageFeedback(
        workspace_id=workspace.id,
        agent_slug=data.agent_slug,
        user_message=data.user_message,
        ai_response=data.ai_response,
        rating=data.rating,
        correction=data.correction,
        model_used=data.model_used,
        session_id=data.session_id,
        embedding=embedding_str
    )
    db.add(fb)
    await db.commit()
    await db.refresh(fb)
    return {"id": fb.id, "rating": fb.rating, "message": "Feedback registrado com sucesso."}


@router.get("/session/{session_id}", summary="Listar feedbacks de uma sessão específica")
async def list_feedbacks_by_session(
    session_id: str,
    db: AsyncSession = Depends(get_db),
    workspace: Workspace = Depends(get_current_workspace),
):
    """Retorna todos os feedbacks de uma conversa específica para restaurar o estado visual no frontend."""
    result = await db.execute(
        select(MessageFeedback).where(
            MessageFeedback.workspace_id == workspace.id,
            MessageFeedback.session_id == session_id,
        ).order_by(MessageFeedback.created_at.asc())
    )
    items = result.scalars().all()
    return [
        {
            "id": fb.id,
            "agent_slug": fb.agent_slug,
            "ai_response": fb.ai_response,
            "rating": fb.rating,
        }
        for fb in items
    ]


@router.get("/{agent_slug}", summary="Listar feedbacks de um agente")
async def list_feedbacks(
    agent_slug: str,
    rating: Optional[str] = None,
    page: int = 1,
    page_size: int = 20,
    db: AsyncSession = Depends(get_db),
    workspace: Workspace = Depends(get_current_workspace),
):
    query = select(MessageFeedback).where(
        MessageFeedback.workspace_id == workspace.id,
        MessageFeedback.agent_slug == agent_slug,
    )
    if rating:
        query = query.where(MessageFeedback.rating == rating)

    count_res = await db.execute(select(func.count()).select_from(query.subquery()))
    total = count_res.scalar()

    query = query.order_by(MessageFeedback.created_at.desc()).offset((page - 1) * page_size).limit(page_size)
    result = await db.execute(query)
    items = result.scalars().all()

    return {
        "total": total,
        "page": page,
        "page_size": page_size,
        "items": [
            {
                "id": fb.id,
                "agent_slug": fb.agent_slug,
                "user_message": fb.user_message,
                "ai_response": fb.ai_response,
                "rating": fb.rating,
                "correction": fb.correction,
                "model_used": fb.model_used,
                "session_id": fb.session_id,
                "is_processed": fb.is_processed,
                "created_at": fb.created_at.isoformat(),
            }
            for fb in items
        ],
    }


@router.delete("/{feedback_id}", summary="Remover um feedback")
async def delete_feedback(
    feedback_id: int,
    db: AsyncSession = Depends(get_db),
    workspace: Workspace = Depends(get_current_workspace),
):
    result = await db.execute(
        select(MessageFeedback).where(
            MessageFeedback.id == feedback_id,
            MessageFeedback.workspace_id == workspace.id,
        )
    )
    fb = result.scalar_one_or_none()
    if not fb:
        raise HTTPException(status_code=404, detail="Feedback não encontrado")
    await db.delete(fb)
    await db.commit()
    return {"message": "Feedback removido."}


@router.post("/{agent_slug}/train", summary="Treinar agente com feedbacks negativos")
async def train_agent_with_feedbacks(
    agent_slug: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    workspace: Workspace = Depends(get_current_workspace),
):
    # 1. Busca feedbacks negativos não processados
    fb_result = await db.execute(
        select(MessageFeedback).where(
            MessageFeedback.workspace_id == workspace.id,
            MessageFeedback.agent_slug == agent_slug,
            MessageFeedback.rating == "negative",
            MessageFeedback.is_processed == False,
        ).order_by(MessageFeedback.created_at.desc()).limit(30)
    )
    negative_feedbacks = fb_result.scalars().all()

    if not negative_feedbacks:
        raise HTTPException(status_code=422, detail="Nenhum feedback negativo pendente para este agente.")

    # 2. Busca o System Prompt atual do agente
    agent_res = await db.execute(
        select(Agent).where(Agent.slug == agent_slug, Agent.workspace_id == workspace.id)
    )
    agent = agent_res.scalar_one_or_none()
    if not agent:
        raise HTTPException(status_code=404, detail="Agente não encontrado.")

    prompt_res = await db.execute(
        select(Prompt).where(
            Prompt.agent_id == agent.id,
            Prompt.is_active == True,
            Prompt.workspace_id == workspace.id,
        ).order_by(Prompt.version.desc())
    )
    current_prompt = prompt_res.scalar_one_or_none()
    if not current_prompt:
        raise HTTPException(status_code=404, detail="Nenhum prompt ativo encontrado para este agente.")

    # 3. Monta o contexto de treinamento
    feedback_text = ""
    for i, fb in enumerate(negative_feedbacks, 1):
        feedback_text += f"\n--- Situação {i} ---\n"
        feedback_text += f"Pergunta do usuário: {fb.user_message}\n"
        feedback_text += f"Resposta do agente (RUIM): {fb.ai_response}\n"
        if fb.correction:
            feedback_text += f"Como deveria ter respondido: {fb.correction}\n"

    training_prompt = f"""Você é um Engenheiro de Prompts especialista em melhoria iterativa de agentes de IA.

Você receberá:
1. O System Prompt atual de um agente
2. Situações específicas onde o agente teve performance RUIM, com a descrição de como deveria ter agido

Sua tarefa é analisar os padrões de erro e propor um System Prompt melhorado que corrija esses problemas de forma cirúrgica, sem perder o que já funciona bem.

=== SYSTEM PROMPT ATUAL DO AGENTE "{agent.name}" ===
{current_prompt.system_prompt}
=== FIM DO SYSTEM PROMPT ===

=== SITUAÇÕES DE PERFORMANCE RUIM ({len(negative_feedbacks)} casos) ===
{feedback_text}
=== FIM DAS SITUAÇÕES ===

Retorne APENAS um JSON válido com este formato exato:
{{
  "improved_prompt": "O System Prompt completo e melhorado",
  "changes_summary": "Descrição clara das mudanças feitas e por quê cada uma corrige os problemas identificados",
  "feedbacks_addressed": {len(negative_feedbacks)}
}}

REGRAS:
- O improved_prompt deve ser o prompt COMPLETO, não apenas as diferenças
- As mudanças devem ser cirúrgicas: corrija os problemas sem alterar o que funciona
- A changes_summary deve ser em português, clara e didática
- Retorne APENAS o JSON, sem texto adicional"""

    try:
        model = workspace.prompt_assistant_model or settings.DEFAULT_PROMPT_ASSISTANT_MODEL or "openai/gpt-4o-mini"
        result = await openrouter.simple_complete(
            system_prompt=training_prompt,
            user_message="Analise os feedbacks e melhore o System Prompt do agente.",
            model=model,
            temperature=0.3,
            api_key=current_user.openrouter_key,
        )
        raw = result["content"].replace("```json", "").replace("```", "").strip()
        parsed = json.loads(raw)
    except Exception as e:
        logger.error(f"Erro na engine de treinamento: {e}")
        raise HTTPException(status_code=500, detail=f"Erro ao processar o treinamento: {str(e)}")

    return {
        "agent_slug": agent_slug,
        "agent_name": agent.name,
        "current_prompt": current_prompt.system_prompt,
        "improved_prompt": parsed.get("improved_prompt"),
        "changes_summary": parsed.get("changes_summary"),
        "feedbacks_addressed": parsed.get("feedbacks_addressed", len(negative_feedbacks)),
        "feedback_ids": [fb.id for fb in negative_feedbacks],
    }


@router.post("/{agent_slug}/mark-processed", summary="Marcar feedbacks como processados")
async def mark_feedbacks_processed(
    agent_slug: str,
    data: dict,  # { "feedback_ids": [1, 2, 3] }
    db: AsyncSession = Depends(get_db),
    workspace: Workspace = Depends(get_current_workspace),
):
    ids = data.get("feedback_ids", [])
    if not ids:
        return {"message": "Nenhum ID fornecido."}

    result = await db.execute(
        select(MessageFeedback).where(
            MessageFeedback.id.in_(ids),
            MessageFeedback.workspace_id == workspace.id,
        )
    )
    feedbacks = result.scalars().all()
    for fb in feedbacks:
        fb.is_processed = True
    await db.commit()
    return {"message": f"{len(feedbacks)} feedbacks marcados como processados."}
