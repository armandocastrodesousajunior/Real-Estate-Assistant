from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from typing import List
import json
import os

from app.core.database import get_db
from app.core.security import get_current_user, get_current_workspace
from app.core.config import settings
from app.models.user import User
from app.models.workspace import Workspace
from app.models.agent import Agent
from app.models.prompt import Prompt
from app.schemas.chat import PromptSchema, PromptUpdate, PromptTest, PromptAssistantRequest
from app.agents.openrouter import openrouter, OpenRouterError
from loguru import logger

router = APIRouter()


@router.get(
    "/",
    response_model=List[PromptSchema],
    summary="Listar todos os prompts",
    description="Retorna o prompt ativo de cada agente.",
)
async def list_prompts(
    db: AsyncSession = Depends(get_db), 
    current_user: User = Depends(get_current_user),
    workspace: Workspace = Depends(get_current_workspace)
):
    result = await db.execute(
        select(Prompt).where(Prompt.is_active == True, Prompt.workspace_id == workspace.id).order_by(Prompt.agent_slug)
    )
    return [PromptSchema.model_validate(p) for p in result.scalars().all()]


@router.get(
    "/{agent_slug}",
    response_model=PromptSchema,
    summary="Prompt do agente",
    description="Retorna o prompt ativo do agente especificado.",
)
async def get_prompt(
    agent_slug: str, 
    db: AsyncSession = Depends(get_db), 
    workspace: Workspace = Depends(get_current_workspace)
):
    result = await db.execute(
        select(Prompt)
        .where(Prompt.agent_slug == agent_slug, Prompt.is_active == True, Prompt.workspace_id == workspace.id)
        .order_by(Prompt.version.desc())
    )
    prompt = result.scalar_one_or_none()
    if not prompt:
        raise HTTPException(status_code=404, detail="Prompt não encontrado neste workspace")
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
    current_user: User = Depends(get_current_user),
    workspace: Workspace = Depends(get_current_workspace)
):
    # Verifica se o agente existe no workspace
    agent_result = await db.execute(
        select(Agent).where(Agent.slug == agent_slug, Agent.workspace_id == workspace.id)
    )
    if not agent_result.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="Agente não encontrado")

    # Desativa a versão atual no workspace
    current_result = await db.execute(
        select(Prompt).where(
            Prompt.agent_slug == agent_slug, 
            Prompt.is_active == True,
            Prompt.workspace_id == workspace.id
        )
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
        workspace_id=workspace.id,
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
    agent_slug: str, 
    db: AsyncSession = Depends(get_db), 
    workspace: Workspace = Depends(get_current_workspace)
):
    result = await db.execute(
        select(Prompt)
        .where(Prompt.agent_slug == agent_slug, Prompt.workspace_id == workspace.id)
        .order_by(Prompt.version.desc())
    )
    return [PromptSchema.model_validate(p) for p in result.scalars().all()]


@router.post(
    "/{agent_slug}/test",
    summary="Testar prompt",
)
async def test_prompt(
    agent_slug: str,
    data: PromptTest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    workspace: Workspace = Depends(get_current_workspace)
):
    # Busca modelo do agente no workspace, ou usa padrão
    agent_result = await db.execute(
        select(Agent).where(Agent.slug == agent_slug, Agent.workspace_id == workspace.id)
    )
    agent = agent_result.scalar_one_or_none()
    model = data.model or (agent.model if agent else "openai/gpt-4o-mini")

    try:
        response = await openrouter.simple_complete(
            system_prompt=data.system_prompt,
            user_message=data.user_message,
            model=model,
            temperature=0.7,
            max_tokens=1000,
            api_key=current_user.openrouter_key
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

@router.post(
    "/assistant/chat",
    summary="Chat Assistant para Prompts",
    description="Interface SSE para conversar com o Especialista em Prompts.",
)
async def prompt_assistant_chat(
    req: PromptAssistantRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    workspace: Workspace = Depends(get_current_workspace)
):
    # 1. Carrega o prompt base do especialista
    base_path = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    logic_path = os.path.join(base_path, "agents", "prompts", "internal", "prompt_builder_logic.md")
    
    try:
        with open(logic_path, "r", encoding="utf-8") as f:
            system_prompt = f.read()
    except Exception as e:
        logger.error(f"Erro ao carregar prompt_builder_logic.md: {e}")
        system_prompt = "Você é um especialista em Prompts para Agentes de IA."

    # 2. Carrega exemplos e injeta no prompt
    examples_content = ""
    examples_dir = os.path.join(base_path, "agents", "prompts", "examples")
    try:
        if os.path.exists(examples_dir):
            for filename in os.listdir(examples_dir):
                if filename.endswith(".md"):
                    with open(os.path.join(examples_dir, filename), "r", encoding="utf-8") as f:
                        content = f.read()
                        examples_content += f"\n--- EXEMPLO: {filename} ---\n{content}\n"
    except Exception as e:
        logger.error(f"Erro ao carregar exemplos de prompt: {e}")
    
    system_prompt = system_prompt.replace("{{EXAMPLES_CONTENT}}", examples_content)

    # 3. Monta o histórico
    messages = [{"role": "system", "content": system_prompt}]
    
    # Injeta o contexto da conversa se o usuário selecionou uma mensagem para debug
    if req.chat_context and "history" in req.chat_context:
        focused_idx = req.chat_context.get("focusedIndex", -1)
        chat_logs = ""
        for i, m in enumerate(req.chat_context.get("history", [])):
            role = str(m.get("role", "unknown")).upper()
            content = str(m.get("content", ""))
            meta = m.get("metadata")
            is_focused = (i == focused_idx)
            
            chat_logs += f"\n{'='*40}\n"
            if is_focused:
                chat_logs += f">>> MENSAGEM MENCIONADA PELO USUÁRIO (FOCO) <<<\n"
            chat_logs += f"De: {role}\nConteúdo: {content}\n"
            if meta:
                meta_str = json.dumps(meta, ensure_ascii=False, indent=2)
                # Limita tamanho dos logs p/ n estourar context
                if len(meta_str) > 3000:
                    meta_str = meta_str[:3000] + "\n... [TRUNCADO]"
                chat_logs += f"Rastreamento da IA (Logs/Metadata): {meta_str}\n"
        
        messages.append({
            "role": "user",
            "content": f"[CONTEXTO DA CONVERSA - ANÁLISE]\nO usuário deseja avaliar a seguinte conversa que teve com o agente no Playground. Leia as interações abaixo para entender o contexto, as metodologias do agente e os rastreamentos associados. Dê total foco técnico na mensagem marcada e aguarde instruções do usuário:\n\n{chat_logs}\n\n[/CONTEXTO DA CONVERSA - ANÁLISE]"
        })
        messages.append({
            "role": "assistant",
            "content": "Entendido. Li todo o histórico da conversa, analisei a mensagem em foco e os logs de processamento. Vou processar o que foi solicitado sobre essa interação e sobre o prompt atual de forma colaborativa com o usuário."
        })
    
    # Injeta o prompt atual para edição cirúrgica
    if req.current_prompt and len(req.current_prompt) > 10:
        messages.append({
            "role": "user",
            "content": f"[PROMPT ATUAL]\n{req.current_prompt}\n[/PROMPT ATUAL]\n\nO prompt acima é o texto que precisa ser editado. Aguardo sua instrução de edição."
        })
        messages.append({
            "role": "assistant",
            "content": "Entendido. Tenho o prompt atual carregado. Diga-me o que quer alterar e retornarei apenas as operações de edição necessárias em formato JSON."
        })

    for h in req.history:
        messages.append({"role": h.role, "content": h.content})
        
    messages.append({"role": "user", "content": req.message})

    # 4. Stream
    async def event_stream():
        try:
            async for chunk in openrouter.chat_completion_stream(
                model=settings.SUPERVISOR_MODEL,
                messages=messages,
                temperature=0.5,
                max_tokens=2048,
                api_key=current_user.openrouter_key
            ):
                yield f'data: {json.dumps({"type": "token", "content": chunk})}\n\n'
                
            yield f'data: {json.dumps({"type": "done"})}\n\n'
        except OpenRouterError as e:
            logger.error(f"OpenRouter Error in prompt assistant: {e}")
            yield f'data: {json.dumps({"type": "error", "message": f"Erro na IA: {str(e)}"})}\n\n'
        except Exception as e:
            logger.error(f"Error in prompt assistant loop: {e}")
            yield f'data: {json.dumps({"type": "error", "message": "Erro ao gerar resposta"})}\n\n'

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )

