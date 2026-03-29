from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from typing import List, Optional

from app.core.database import get_db
from app.core.security import get_current_user
from app.models.agent import Agent
from app.models.prompt import Prompt
from app.schemas.agent import AgentResponse, AgentUpdate, AgentToggle, AgentModelUpdate
from app.agents.openrouter import openrouter
from loguru import logger

router = APIRouter()


@router.get(
    "/",
    response_model=List[AgentResponse],
    summary="Listar agentes",
    description="Retorna todos os agentes com suas configurações e estatísticas.",
)
async def list_agents(db: AsyncSession = Depends(get_db), _: dict = Depends(get_current_user)):
    result = await db.execute(select(Agent).order_by(Agent.id))
    return [AgentResponse.model_validate(a) for a in result.scalars().all()]


@router.get(
    "/{agent_slug}",
    response_model=AgentResponse,
    summary="Detalhes do agente",
    description="Retorna configuração completa e estatísticas de um agente específico.",
)
async def get_agent(agent_slug: str, db: AsyncSession = Depends(get_db), _: dict = Depends(get_current_user)):
    result = await db.execute(select(Agent).where(Agent.slug == agent_slug))
    agent = result.scalar_one_or_none()
    if not agent:
        raise HTTPException(status_code=404, detail="Agente não encontrado")
    return AgentResponse.model_validate(agent)


@router.put(
    "/{agent_slug}",
    response_model=AgentResponse,
    summary="Atualizar configuração do agente",
    description="Atualiza modelo, temperatura, max_tokens e outros parâmetros do agente.",
)
async def update_agent(
    agent_slug: str,
    data: AgentUpdate,
    db: AsyncSession = Depends(get_db),
    _: dict = Depends(get_current_user),
):
    result = await db.execute(select(Agent).where(Agent.slug == agent_slug))
    agent = result.scalar_one_or_none()
    if not agent:
        raise HTTPException(status_code=404, detail="Agente não encontrado")

    for field, value in data.model_dump(exclude_unset=True).items():
        setattr(agent, field, value)

    await db.commit()
    await db.refresh(agent)
    return AgentResponse.model_validate(agent)


@router.patch(
    "/{agent_slug}/toggle",
    response_model=AgentResponse,
    summary="Ativar/desativar agente",
    description="Liga ou desliga um agente. Agentes desativados não são chamados pelo orquestrador.",
)
async def toggle_agent(
    agent_slug: str,
    data: AgentToggle,
    db: AsyncSession = Depends(get_db),
    _: dict = Depends(get_current_user),
):
    result = await db.execute(select(Agent).where(Agent.slug == agent_slug))
    agent = result.scalar_one_or_none()
    if not agent:
        raise HTTPException(status_code=404, detail="Agente não encontrado")

    agent.is_active = data.is_active
    await db.commit()
    await db.refresh(agent)
    return AgentResponse.model_validate(agent)


@router.patch(
    "/{agent_slug}/model",
    response_model=AgentResponse,
    summary="Trocar modelo do agente",
    description="Altera o modelo LLM usado pelo agente (ex: openai/gpt-4o, anthropic/claude-3-sonnet).",
)
async def update_agent_model(
    agent_slug: str,
    data: AgentModelUpdate,
    db: AsyncSession = Depends(get_db),
    _: dict = Depends(get_current_user),
):
    result = await db.execute(select(Agent).where(Agent.slug == agent_slug))
    agent = result.scalar_one_or_none()
    if not agent:
        raise HTTPException(status_code=404, detail="Agente não encontrado")

    agent.model = data.model
    await db.commit()
    await db.refresh(agent)
    return AgentResponse.model_validate(agent)


@router.get(
    "/openrouter/models",
    summary="Modelos disponíveis no OpenRouter",
    description="Lista todos os modelos disponíveis via OpenRouter para uso nos agentes.",
)
async def get_openrouter_models(_: dict = Depends(get_current_user)):
    try:
        models = await openrouter.get_available_models()
        return {
            "models": [
                {
                    "id": m.get("id"),
                    "name": m.get("name"),
                    "context_length": m.get("context_length"),
                    "pricing": m.get("pricing"),
                }
                for m in models
            ]
        }
    except Exception as e:
        raise HTTPException(status_code=503, detail=f"Erro ao buscar modelos: {str(e)}")
