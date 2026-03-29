from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from typing import List

from app.core.database import get_db
from app.core.security import get_current_user
from app.models.agent import Agent
from app.models.prompt import Prompt
from app.schemas.chat import PromptSchema, PromptUpdate, PromptTest
from app.agents.openrouter import openrouter

router = APIRouter()


@router.get(
    "/",
    response_model=List[PromptSchema],
    summary="Listar todos os prompts",
    description="Retorna o prompt ativo de cada agente.",
)
async def list_prompts(db: AsyncSession = Depends(get_db), _: dict = Depends(get_current_user)):
    result = await db.execute(
        select(Prompt).where(Prompt.is_active == True).order_by(Prompt.agent_slug)
    )
    return [PromptSchema.model_validate(p) for p in result.scalars().all()]


@router.get(
    "/{agent_slug}",
    response_model=PromptSchema,
    summary="Prompt do agente",
    description="Retorna o prompt ativo do agente especificado.",
)
async def get_prompt(agent_slug: str, db: AsyncSession = Depends(get_db), _: dict = Depends(get_current_user)):
    result = await db.execute(
        select(Prompt)
        .where(Prompt.agent_slug == agent_slug, Prompt.is_active == True)
        .order_by(Prompt.version.desc())
    )
    prompt = result.scalar_one_or_none()
    if not prompt:
        raise HTTPException(status_code=404, detail="Prompt não encontrado")
    return PromptSchema.model_validate(prompt)


@router.put(
    "/{agent_slug}",
    response_model=PromptSchema,
    summary="Atualizar prompt do agente",
    description="Salva uma nova versão do prompt. A versão anterior é mantida no histórico.",
)
async def update_prompt(
    agent_slug: str,
    data: PromptUpdate,
    db: AsyncSession = Depends(get_db),
    _: dict = Depends(get_current_user),
):
    # Verifica se o agente existe
    agent_result = await db.execute(select(Agent).where(Agent.slug == agent_slug))
    if not agent_result.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="Agente não encontrado")

    # Desativa a versão atual
    current_result = await db.execute(
        select(Prompt).where(Prompt.agent_slug == agent_slug, Prompt.is_active == True)
    )
    current = current_result.scalar_one_or_none()
    current_version = 1
    if current:
        current.is_active = False
        current_version = current.version + 1

    # Cria nova versão ativa
    new_prompt = Prompt(
        agent_slug=agent_slug,
        version=current_version,
        is_active=True,
        system_prompt=data.system_prompt,
        user_prompt_template=data.user_prompt_template,
        notes=data.notes,
    )
    db.add(new_prompt)
    await db.commit()
    await db.refresh(new_prompt)
    return PromptSchema.model_validate(new_prompt)


@router.get(
    "/{agent_slug}/history",
    response_model=List[PromptSchema],
    summary="Histórico de versões do prompt",
    description="Retorna todas as versões anteriores do prompt do agente.",
)
async def get_prompt_history(
    agent_slug: str, db: AsyncSession = Depends(get_db), _: dict = Depends(get_current_user)
):
    result = await db.execute(
        select(Prompt)
        .where(Prompt.agent_slug == agent_slug)
        .order_by(Prompt.version.desc())
    )
    return [PromptSchema.model_validate(p) for p in result.scalars().all()]


@router.post(
    "/{agent_slug}/test",
    summary="Testar prompt",
    description="Executa o prompt fornecido com uma mensagem de teste. Não salva nada no banco.",
)
async def test_prompt(
    agent_slug: str,
    data: PromptTest,
    db: AsyncSession = Depends(get_db),
    _: dict = Depends(get_current_user),
):
    # Busca modelo do agente, ou usa padrão
    agent_result = await db.execute(select(Agent).where(Agent.slug == agent_slug))
    agent = agent_result.scalar_one_or_none()
    model = data.model or (agent.model if agent else "openai/gpt-4o-mini")

    try:
        response = await openrouter.simple_complete(
            system_prompt=data.system_prompt,
            user_message=data.user_message,
            model=model,
            temperature=0.7,
            max_tokens=1000,
        )
        return {
            "success": True,
            "response": response,
            "model_used": model,
            "agent_slug": agent_slug,
        }
    except Exception as e:
        return {
            "success": False,
            "error": str(e),
            "model_used": model,
            "agent_slug": agent_slug,
        }
