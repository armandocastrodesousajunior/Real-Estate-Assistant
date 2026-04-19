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
        select(Prompt).where(Prompt.is_active == True, Prompt.workspace_id == workspace.id).order_by(Prompt.agent_id)
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
    # Resolve agent_slug para agent_id
    agent_res = await db.execute(
        select(Agent).where(Agent.slug == agent_slug, Agent.workspace_id == workspace.id)
    )
    agent = agent_res.scalar_one_or_none()
    if not agent:
        raise HTTPException(status_code=404, detail="Agente não encontrado")

    result = await db.execute(
        select(Prompt)
        .where(Prompt.agent_id == agent.id, Prompt.is_active == True, Prompt.workspace_id == workspace.id)
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
    agent = agent_result.scalar_one_or_none()
    if not agent:
        raise HTTPException(status_code=404, detail="Agente não encontrado")

    # Desativa a versão atual no workspace para este AGENTE ESPECÍFICO (por ID)
    current_result = await db.execute(
        select(Prompt).where(
            Prompt.agent_id == agent.id, 
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
        agent_id=agent.id,
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
    # Resolve slug to ID
    agent_res = await db.execute(
        select(Agent).where(Agent.slug == agent_slug, Agent.workspace_id == workspace.id)
    )
    agent = agent_res.scalar_one_or_none()
    if not agent:
        raise HTTPException(status_code=404, detail="Agente não encontrado")

    result = await db.execute(
        select(Prompt)
        .where(Prompt.agent_id == agent.id, Prompt.workspace_id == workspace.id)
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
    "/assistant/repair",
    summary="Reparar JSON do Assistente",
    description="Agente interno para corrigir JSON malformado do Engenheiro de Prompts.",
)
async def repair_assistant_json(
    data: dict, # { "broken_json": "...", "error": "...", "mode": "edit" | "create" }
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    workspace: Workspace = Depends(get_current_workspace)
):
    model = (workspace.repair_model if workspace and workspace.repair_model else settings.DEFAULT_REPAIR_MODEL) or "openai/gpt-4o-mini"
    
    repair_prompt = f"""Você é um **Agente de Reparação de JSON**.
Sua única tarefa é receber um texto que deveria ser um JSON mas está malformado, e retornar APENAS o JSON corrigido e válido.

O JSON deve seguir este schema dependendo da intenção:
{{
  "action": "chat" | "patch" | "spec",
  "message": "Mensagem original ou resumo",
  "edits": [ ... ],
  "agent_spec": {{ ... }}
}}

TEXTO QUEBRADO:
{data.get('broken_json')}

ERRO DE PARSING:
{data.get('error')}

IMPORTANTE: Retorne APENAS o JSON. Não inclua conversas, explicações ou blocos de código markdown.
"""

    try:
        response = await openrouter.simple_complete(
            system_prompt=repair_prompt,
            user_message="Corrija o JSON acima.",
            model=model,
            temperature=0,
            api_key=current_user.openrouter_key
        )
        # Tira blocos markdown se a IA ignorar o comando
        clean = response.replace("```json", "").replace("```", "").strip()
        return json.loads(clean)
    except Exception as e:
        logger.error(f"Erro na reparação de JSON: {e}")
        raise HTTPException(status_code=422, detail="Não foi possível reparar o JSON")

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
    # 1. Carrega o prompt base do especialista baseado no modo
    base_path = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    logic_file = "agent_creator_logic.md" if req.mode == "create" else "prompt_editor_logic.md"
    logic_path = os.path.join(base_path, "agents", "prompts", "internal", logic_file)
    
    try:
        with open(logic_path, "r", encoding="utf-8") as f:
            system_prompt = f.read()
    except Exception as e:
        logger.error(f"Erro ao carregar {logic_file}: {e}")
        system_prompt = "Você é um especialista em Agentes de IA."

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
    
    # 3. Carrega o ecossistema de agentes do workspace para coerência multi-agente
    ecosystem_content = ""
    try:
        agents_res = await db.execute(
            select(Agent).where(Agent.workspace_id == workspace.id)
        )
        workspace_agents = agents_res.scalars().all()
        
        for agent in workspace_agents:
            # Busca o prompt ativo de cada agente
            p_res = await db.execute(
                select(Prompt).where(
                    Prompt.agent_id == agent.id,
                    Prompt.is_active == True,
                    Prompt.workspace_id == workspace.id
                )
            )
            active_p = p_res.scalar_one_or_none()
            
            is_current = (agent.slug == req.agent_slug)
            
            ecosystem_content += f"\n-- AGENTE: {agent.name} (slug: {agent.slug}) {'[ESTE É O AGENTE QUE VOCÊ ESTÁ EDITANDO AGORA]' if is_current else ''} --\n"
            ecosystem_content += f"Descrição: {agent.description}\n"
            if active_p:
                # Se for o agente sendo editado, usamos o prompt que veio do frontend (mais atual) ou o do banco
                p_text = req.current_prompt if (is_current and req.current_prompt) else active_p.system_prompt
                ecosystem_content += f"Prompt do Sistema:\n{p_text}\n"
            ecosystem_content += f"{'-'*30}\n"
    except Exception as e:
        logger.error(f"Erro ao carregar ecossistema de agentes: {e}")

    # 4. Monta o histórico
    messages = [{"role": "system", "content": system_prompt}]
    
    # Injeta a visão global do ecossistema como contexto inicial
    if ecosystem_content:
        messages.append({
            "role": "user",
            "content": f"[ECOSSISTEMA DE AGENTES DO WORKSPACE]\nVocê está operando dentro de uma estrutura multi-agente. Abaixo estão os detalhes de todos os agentes configurados neste workspace. Use estas informações para garantir que os prompts sejam coerentes entre si e que não haja sobreposição de funções:\n\n{ecosystem_content}\n\n[/ECOSSISTEMA DE AGENTES DO WORKSPACE]"
        })
        messages.append({
            "role": "assistant",
            "content": "Entendido. Analisei o ecossistema completo de agentes do workspace. Estou ciente de todas as personas, responsabilidades e prompts configurados. Vou garantir que minhas sugestões e edições mantenham a coerência sistêmica e evitem sobreposições."
        })
    
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
                # Envia metadados completos conforme solicitado pelo usuário
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
        # Preferência por configurações do workspace
        model = workspace.prompt_assistant_model if (workspace and workspace.prompt_assistant_model) else settings.DEFAULT_PROMPT_ASSISTANT_MODEL
        temp = workspace.prompt_assistant_temperature if (workspace and workspace.prompt_assistant_temperature is not None) else settings.DEFAULT_PROMPT_ASSISTANT_TEMPERATURE

        full_response = ""
        try:
            # Emit debug trace event with the context
            trace_data = {
                "supervisor_selection": f"Prompt Assistant ({req.mode})",
                "supervisor": {
                    "model": model, 
                    "temperature": temp,
                    "reason": f"Atuando em modo {req.mode} para {'edição' if req.mode=='edit' else 'criação'} de prompt."
                },
                "calls": [
                    {
                        "agent": "AI Engineer",
                        "messages": messages,
                        "model": model
                    }
                ]
            }
            yield f'data: {json.dumps({"type": "debug_trace", "trace": trace_data})}\n\n'

            # Define response format if model supports it (OpenAI models and some others)
            response_format = None
            if any(m in model for m in ["gpt-4", "gpt-3.5", "claude-3"]):
                response_format = {"type": "json_object"}

            async for chunk in openrouter.chat_completion_stream(
                model=model,
                messages=messages,
                temperature=temp,
                max_tokens=2048,
                api_key=current_user.openrouter_key,
                response_format=response_format
            ):
                full_response += chunk
                yield f'data: {json.dumps({"type": "token", "content": chunk})}\n\n'
            
            # Update trace with final response
            trace_data["calls"][0]["raw_ai_output"] = full_response
            yield f'data: {json.dumps({"type": "debug_trace", "trace": trace_data})}\n\n'

            logger.info(f"Prompt Assistant [Mode: {req.mode}] Response: {full_response}")
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

