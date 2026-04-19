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
from app.models.tool import Tool
from app.core.tools_registry import get_all_internal_tools
from app.schemas.chat import PromptSchema, PromptUpdate, PromptTest, PromptAssistantRequest
from app.agents.openrouter import openrouter, OpenRouterError
from app.core.tools_registry import get_all_internal_tools, INTERNAL_TOOLS
from loguru import logger

router = APIRouter()

async def inspect_assistant_resource(db: AsyncSession, workspace_id: int, resource_type: str, slug: str):
    """Auxiliar para buscar detalhes completos de um agente ou ferramenta."""
    if resource_type == "agent":
        agent_res = await db.execute(
            select(Agent).where(Agent.slug == slug, Agent.workspace_id == workspace_id)
        )
        agent = agent_res.scalar_one_or_none()
        if not agent:
            return f"Erro: Agente '{slug}' não encontrado."
        
        p_res = await db.execute(
            select(Prompt).where(
                Prompt.agent_id == agent.id,
                Prompt.is_active == True,
                Prompt.workspace_id == workspace_id
            )
        )
        prompt = p_res.scalar_one_or_none()
        return {
            "name": agent.name,
            "slug": agent.slug,
            "description": agent.description,
            "system_prompt": prompt.system_prompt if prompt else "Sem prompt configurado."
        }
    
    elif resource_type == "tool":
        # Busca interna
        for cat in INTERNAL_TOOLS.values():
            for t in cat:
                if t["slug"] == slug:
                    return t
        
        # Busca externa
        ext_res = await db.execute(
            select(Tool).where(Tool.slug == slug, Tool.workspace_id == workspace_id)
        )
        tool = ext_res.scalar_one_or_none()
        if tool:
            return {
                "name": tool.name,
                "slug": tool.slug,
                "description": tool.description,
                "prompt": tool.prompt
            }
        return f"Erro: Ferramenta '{slug}' não encontrada."
    
    return "Erro: Tipo de recurso inválido."


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
        result = await openrouter.simple_complete(
            system_prompt=data.system_prompt,
            user_message=data.user_message,
            model=model,
            temperature=0.7,
            max_tokens=1000,
            api_key=current_user.openrouter_key
        )
        response = result["content"]
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
        result = await openrouter.simple_complete(
            system_prompt=repair_prompt,
            user_message="Corrija o JSON acima.",
            model=model,
            temperature=0,
            api_key=current_user.openrouter_key
        )
        response = result["content"]
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
            is_current = (req.mode == "edit" and agent.slug == req.agent_slug)
            tag_atual = ' [ESTE É O AGENTE QUE VOCÊ ESTÁ EDITANDO AGORA]' if is_current else ''
            ecosystem_content += f"\n- {agent.name} (slug: {agent.slug}){tag_atual}\n"
            ecosystem_content += f"  Papel: {agent.description}\n"
            
        ecosystem_content = f"\n[ECOSSISTEMA DE AGENTES DO WORKSPACE - VISÃO REDUZIDA]\n{ecosystem_content}\n[/ECOSSISTEMA DE AGENTES DO WORKSPACE - VISÃO REDUZIDA]\n"
    except Exception as e:
        logger.error(f"Erro ao carregar ecossistema: {e}")
    
    # 4. Carrega o catálogo de ferramentas (Skeleton)
    tools_content = ""
    try:
        internal_tools = get_all_internal_tools()
        for t in internal_tools:
            tools_content += f"- {t['name']} (slug: {t['slug']}) [INTERNA]: {t['description'][:100]}...\n"
            
        ext_tools_res = await db.execute(
            select(Tool).where(Tool.workspace_id == workspace.id, Tool.is_active == True)
        )
        external_tools = ext_tools_res.scalars().all()
        for t in external_tools:
            tools_content += f"- {t.name} (slug: {t.slug}) [EXTERNA]: {t.description[:100]}...\n"
            
        tools_content = f"\n[CATÁLOGO DE FERRAMENTAS DO SISTEMA - VISÃO REDUZIDA]\n{tools_content}\n[/CATÁLOGO DE FERRAMENTAS DO SISTEMA - VISÃO REDUZIDA]\n"
    except Exception as e:
        logger.error(f"Erro ao carregar catálogo de ferramentas: {e}")

    # 5. Monta o histórico (Hierarquia Profissional)
    messages = [{"role": "system", "content": system_prompt}]
    
    # Injeta a visão global do ecossistema como contexto inicial (USER)
    if ecosystem_content:
        messages.append({
            "role": "user",
            "content": f"[CONFIGURAÇÃO ORIENTADA A ECOSSISTEMA]\nVocê está operando dentro de uma arquitetura multi-agente complexa. Abaixo está a visão skeleton (reduzida) de todos os colegas especialistas disponíveis neste workspace. \n\n{ecosystem_content}\n\nORIENTAÇÃO: Use esta lista para garantir que suas sugestões mantenham a coerência sistêmica. Se precisar ver o prompt de algum agente, use a ferramenta 'inspect_system_resource'.\n[/CONFIGURAÇÃO ORIENTADA A ECOSSISTEMA]"
        })
        messages.append({
            "role": "assistant",
            "content": "Entendido. Analisei a estrutura do ecossistema e identifiquei os agentes disponíveis. Estou pronto para atuar de forma coordenada, respeitando as responsabilidades de cada especialista."
        })

    # Injeta o catálogo de ferramentas (USER)
    if tools_content:
        messages.append({
            "role": "user",
            "content": f"[CATÁLOGO DE FERRAMENTAS DO SISTEMA]\nAqui estão as automações (internas e externas) que podem ser integradas aos agentes. \n\n{tools_content}\n\nORIENTAÇÃO: Antes de sugerir o uso detalhado de uma ferramenta, use 'inspect_system_resource' para validar suas instruções.\n[/CATÁLOGO DE FERRAMENTAS DO SISTEMA]"
        })
        messages.append({
            "role": "assistant",
            "content": "Confirmado. Registrei o catálogo de ferramentas e as respectivas capacidades de automação. Usarei a inspeção profunda quando necessário."
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

        # Agregação de uso para múltiplos turnos
        total_usage = {
            "prompt_tokens": 0,
            "completion_tokens": 0,
            "total_tokens": 0,
            "total_cost": 0.0
        }

        trace_data = {
            "supervisor_selection": f"Prompt Assistant ({req.mode})",
            "supervisor": {
                "model": model, 
                "temperature": temp,
                "reason": f"Atuando em modo {req.mode} para {'edição' if req.mode=='edit' else 'criação'} de prompt."
            },
            "calls": []
        }

        response_format = None
        if any(m in model for m in ["gpt-4", "gpt-3.5", "claude-3"]):
            response_format = {"type": "json_object"}

        max_turns = 3
        current_turn = 0
        
        while current_turn < max_turns:
            current_turn += 1
            full_response = ""
            current_trace_call = {
                "agent": "AI Engineer",
                "messages": list(messages),
                "model": model,
                "turn": current_turn
            }

            async for chunk in openrouter.chat_completion_stream(
                messages=messages,
                model=model,
                temperature=temp,
                response_format=response_format,
                api_key=current_user.openrouter_key
            ):
                if isinstance(chunk, dict) and "usage" in chunk:
                    u = chunk["usage"]
                    current_trace_call["usage"] = u
                    # Somar uso global
                    total_usage["prompt_tokens"] += u.get("prompt_tokens", 0)
                    total_usage["completion_tokens"] += u.get("completion_tokens", 0)
                    total_usage["total_tokens"] += u.get("total_tokens", 0)
                    cost = u.get("total_cost", u.get("cost", 0.0))
                    total_usage["total_cost"] += float(cost)
                    continue
                    
                full_response += chunk
                # Envia token em tempo real para o frontend
                yield f'data: {json.dumps({"type": "token", "content": chunk})}\n\n'

            # Fim do stream desta rodada
            trace_data["calls"].append(current_trace_call)
            trace_data["total_usage"] = total_usage
            
            # Tenta decodificar para ver se é tool_call
            try:
                # Limpa markdown se houver
                clean_json = full_response.replace("```json", "").replace("```", "").strip()
                data = json.loads(clean_json)
                
                if data.get("type") == "tool_call":
                    tool_data = data.get("tool_call", {})
                    res_type = tool_data.get("resource_type")
                    res_slug = tool_data.get("resource_slug")
                    
                    if res_type and res_slug:
                        # Envia evento de status para UI
                        status_msg = f"Inspecionando {res_type} '{res_slug}'..."
                        yield f'data: {json.dumps({"type": "status", "content": status_msg})}\n\n'
                        
                        # Executa ferramenta
                        result = await inspect_assistant_resource(db, workspace.id, res_type, res_slug)
                        
                        # Atribui para o trace renderizar na UI
                        current_trace_call["tool_call"] = {
                            "name": "inspect_system_resource",
                            "arguments": tool_data
                        }
                        current_trace_call["tool_result"] = result
                        current_trace_call["raw_ai_output"] = full_response
                        current_trace_call["success"] = True

                        # Adiciona ao histórico do loop
                        messages.append({"role": "assistant", "content": full_response})
                        messages.append({"role": "user", "content": f"[RESULTADO DA INSPEÇÃO]\n{json.dumps(result, ensure_ascii=False, indent=2)}"})
                        
                        # Emite trace atualizado
                        yield f'data: {json.dumps({"type": "debug_trace", "trace": trace_data})}\n\n'
                        continue # Volta para o while
                
                # Garante que o frontend tenha a versão completa para o parse final
                yield f'data: {json.dumps({"type": "token", "content": ""})}\n\n'
                yield f'data: {json.dumps({"type": "debug_trace", "trace": trace_data})}\n\n'
                break # Sai do loop

            except Exception as e:
                # Se falhar o parse, provavelmente é uma resposta comum ou erro
                logger.warning(f"Falha no parse do loop do assistente: {e}")
                yield f'data: {json.dumps({"type": "token", "content": ""})}\n\n'
                yield f'data: {json.dumps({"type": "debug_trace", "trace": trace_data})}\n\n'
                break

        yield "event: close\ndata: [DONE]\n\n"

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )

