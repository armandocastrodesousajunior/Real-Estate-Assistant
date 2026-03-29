from typing import Optional, List, Dict, AsyncGenerator
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
import json
import re
import time

from app.agents.openrouter import openrouter
from app.models.agent import Agent
from app.models.prompt import Prompt
from loguru import logger
import os




async def get_agent_config(db: AsyncSession, slug: str) -> Optional[Agent]:
    result = await db.execute(select(Agent).where(Agent.slug == slug, Agent.is_active == True))
    return result.scalar_one_or_none()


async def get_agent_prompt(db: AsyncSession, slug: str) -> Optional[str]:
    result = await db.execute(
        select(Prompt).where(Prompt.agent_slug == slug, Prompt.is_active == True)
        .order_by(Prompt.version.desc())
    )
    prompt = result.scalar_one_or_none()
    return prompt.system_prompt if prompt else None


async def get_agents_directory(db: AsyncSession, exclude_slug: str) -> tuple[str, list[str]]:
    """Busca todos os agentes ativos exceto o atual e retorna o diretório Markdown e a lista de slugs"""
    result = await db.execute(
        select(Agent).where(
            Agent.is_active == True, 
            Agent.slug != "supervisor",
            Agent.slug != exclude_slug
        )
    )
    agents = result.scalars().all()
    
    directory = []
    slugs = []
    for agent in agents:
        desc = agent.description or "(Sem descrição detalhada)"
        slugs.append(agent.slug)
        # Formata o bloco do agente combinando slug + descrição do campo description
        agent_block = f"## Agente: {agent.slug}\n\n**Slug:** `{agent.slug}`\n\n{desc.strip()}"
        directory.append(agent_block)
            
    return "\n\n---\n\n".join(directory), slugs


def get_internal_prompt(filename: str) -> str:
    """Carrega um prompt interno do sistema a partir de um arquivo .md"""
    # Caminho absoluto para a pasta de prompts internos
    base_path = os.path.dirname(os.path.abspath(__file__))
    file_path = os.path.join(base_path, "prompts", "internal", filename)
    
    try:
        if os.path.exists(file_path):
            with open(file_path, "r", encoding="utf-8") as f:
                return f.read()
        logger.error(f"Internal prompt file not found: {file_path}")
        return ""
    except Exception as e:
        logger.error(f"Error loading internal prompt {filename}: {e}")
        return ""


async def route_to_agent(
    db: AsyncSession,
    user_message: str,
    history: List[Dict[str, str]],
) -> Dict:
    """O Supervisor analisa a mensagem e retorna o slug e dados de debug"""
    fallback = {"slug": "customer_service", "debug": {}}
    supervisor = await get_agent_config(db, "supervisor")
    if not supervisor:
        return fallback

    # Histórico resumido para o supervisor (só últimas 3 trocas)
    recent = history[-6:] if len(history) > 6 else history
    history_text = "\n".join(
        f"{m['role'].upper()}: {m['content'][:200]}" for m in recent
    )

    # Lógica do Supervisor: Carregada 100% do arquivo interno (não editável no banco)
    full_system = get_internal_prompt("supervisor_logic.md")
    
    # Injeta diretório dinâmico e JSON Schema de todos os agentes especialistas
    directory, slugs = await get_agents_directory(db, exclude_slug="supervisor")
    
    if "{{AGENTS_DIRECTORY}}" in full_system:
        full_system = full_system.replace("{{AGENTS_DIRECTORY}}", directory)
    
    if "{{RESPONSE_SCHEMA}}" in full_system:
        schema = {
            "$schema": "http://json-schema.org/draft-07/schema#",
            "title": "SupervisorResponse",
            "description": "Resposta do Supervisor do Real-Estate-Assistant com o agente selecionado para atender a mensagem do usuário.",
            "type": "object",
            "required": ["selected_agent", "reason"],
            "additionalProperties": False,
            "properties": {
                "selected_agent": {
                    "type": "string",
                    "description": "Slug único do agente especialista selecionado para responder a mensagem do usuário.",
                    "enum": slugs,
                    "examples": slugs[:3] if len(slugs) >= 3 else slugs
                },
                "reason": {
                    "type": "string",
                    "description": "Explicação técnica curta justificando a escolha do agente com base nas competências descritas no diretório.",
                    "minLength": 10,
                    "maxLength": 300
                }
            }
        }
        schema_json = json.dumps(schema, indent=2, ensure_ascii=False)
        full_system = full_system.replace("{{RESPONSE_SCHEMA}}", f"```json\n{schema_json}\n```")

    routing_message = f"""Histórico recente:
{history_text}

Nova mensagem do usuário: {user_message}

Qual agente deve responder?"""

    try:
        raw_output = await openrouter.simple_complete(
            system_prompt=full_system,
            user_message=routing_message,
            model=supervisor.model,
            temperature=0.1,
            max_tokens=300
        )
        
        # Limpar markdown se presente (```json ... ```)
        clean_json = re.sub(r'```json\s*|\s*```', '', raw_output).strip()
        
        try:
            data = json.loads(clean_json)
        except json.JSONDecodeError:
            # Fallback se o JSON falhar mas o slug estiver na string
            logger.warning(f"Falha ao decodificar JSON do Supervisor. Tentando extrair slug da string bruta.")
            data = {"selected_agent": "customer_service", "reason": "Erro no parse JSON"}
            for s in slugs:
                if s in clean_json.lower():
                    data["selected_agent"] = s
                    break

        slug = data.get("selected_agent", "customer_service").lower().strip()
        
        debug_info = {
            "supervisor": {
                "system_prompt": full_system,
                "input_sent": routing_message,
                "raw_output": raw_output,
                "parsed_data": data
            }
        }
        
        if slug in slugs:
            return {"slug": slug, "debug": debug_info}
            
        return {"slug": "customer_service", "debug": debug_info}
        
    except Exception as e:
        logger.warning(f"Supervisor routing failed: {e}. Defaulting to customer_service.")
        return fallback


class AgentRedirectSignal(Exception):
    def __init__(self, target_slug: str, reason: str = "", raw_response: str = ""):
        self.target_slug = target_slug
        self.reason = reason
        self.raw_response = raw_response
        super().__init__(f"Agent requested redirect to {target_slug}. Reason: {reason}")

async def run_agent_stream(
    db: AsyncSession,
    agent_slug: str,
    user_message: str,
    history: List[Dict[str, str]],
    context: Optional[str] = None,
    trace_log: Optional[Dict] = None,
) -> AsyncGenerator[str, None]:
    """Executa o agente e retorna um generator de streaming"""
    agent = await get_agent_config(db, agent_slug)
    if not agent:
        yield "Agente não disponível no momento."
        return

    # Parte A: Prompt do Banco (Editável)
    system_prompt = await get_agent_prompt(db, agent_slug)
    if not system_prompt:
        yield "Configuração do agente incompleta."
        return

    # Parte B: Lógica Interna (Não Editável via UI - Carregada de Arquivo)
    internal_logic = get_internal_prompt("expert_logic.md")
    
    # Injeta catálogo dinâmico de agentes para o Handoff
    if "{{AGENTS_DIRECTORY}}" in internal_logic or "{{RESPONSE_SCHEMA}}" in internal_logic:
        directory, slugs = await get_agents_directory(db, agent_slug)
        
        if "{{AGENTS_DIRECTORY}}" in internal_logic:
            internal_logic = internal_logic.replace("{{AGENTS_DIRECTORY}}", directory)
            
        if "{{RESPONSE_SCHEMA}}" in internal_logic:
            schema = {
                "$schema": "http://json-schema.org/draft-07/schema#",
                "title": "AgentResponse",
                "description": "Resposta padronizada de um agente do Real-Estate-Assistant. Pode ser uma resposta direta ao usuário ou um redirecionamento para outro agente especialista.",
                "type": "object",
                "required": ["type"],
                "additionalProperties": False,
                "discriminator": {
                    "propertyName": "type"
                },
                "oneOf": [
                    {
                        "title": "ResponseOutput",
                        "description": "O agente responde diretamente ao usuário com conteúdo em Markdown.",
                        "required": ["type", "response"],
                        "additionalProperties": False,
                        "properties": {
                            "type": { "type": "string", "enum": ["response"] },
                            "response": {
                                "type": "object",
                                "required": ["output"],
                                "additionalProperties": False,
                                "properties": {
                                    "output": { "type": "string", "minLength": 1 }
                                }
                            },
                            "redirect": { "not": {} }
                        }
                    },
                    {
                        "title": "RedirectOutput",
                        "description": "O agente não possui competência para responder e redireciona para outro especialista.",
                        "required": ["type", "redirect"],
                        "additionalProperties": False,
                        "properties": {
                            "type": { "type": "string", "enum": ["redirect"] },
                            "redirect": {
                                "type": "object",
                                "required": ["slug", "reason"],
                                "additionalProperties": False,
                                "properties": {
                                    "slug": {
                                        "type": "string",
                                        "enum": slugs,
                                        "examples": slugs[:3] if slugs else ["customer_service"]
                                    },
                                    "reason": { "type": "string", "minLength": 10, "maxLength": 500 }
                                }
                            },
                            "response": { "not": {} }
                        }
                    }
                ]
            }
            schema_json = json.dumps(schema, indent=2, ensure_ascii=False)
            internal_logic = internal_logic.replace("{{RESPONSE_SCHEMA}}", f"```json\n{schema_json}\n```")

    # Montagem Final: Personalidade (DB) + Lógica (Código)
    full_system = f"{system_prompt}\n\n{internal_logic}"

    if context:
        full_system += f"\n\n## Contexto Adicional:\n{context}"

    messages = [{"role": "system", "content": full_system}]
    messages.extend(history[-10:])
    messages.append({"role": "user", "content": user_message})

    if trace_log is not None:
        trace_log["agent_slug"] = agent_slug
        trace_log["system_prompt"] = full_system
        trace_log["messages_sent"] = messages
        trace_log["raw_ai_output"] = ""
    
    start = time.time()
    try:
        buffer = ""
        is_redirect = False
        state = 0
        in_escape = False
        async for chunk in openrouter.chat_completion_stream(
            model=agent.model,
            messages=messages,
            temperature=agent.temperature,
            max_tokens=agent.max_tokens,
            top_p=agent.top_p,
            frequency_penalty=agent.frequency_penalty,
            presence_penalty=agent.presence_penalty,
        ):
            if state == -1:
                if trace_log is not None: trace_log["raw_ai_output"] += chunk
                continue  # Já leu o output inteiro, ignora o fechamento das chaves do JSON
                
            buffer += chunk
            if trace_log is not None: trace_log["raw_ai_output"] += chunk
            
            if state == 0:
                if re.search(r'"type"\s*:\s*"redirect"', buffer):
                    is_redirect = True
                    state = 3
                elif re.search(r'"type"\s*:\s*"response"', buffer):
                    is_redirect = False
                    state = 1
                elif len(buffer) > 400:
                    state = 1 # Fallback caso o JSON venha muito confuso ou lento
            
            if state == 1:
                match = re.search(r'"output"\s*:\s*"', buffer)
                if match:
                    idx = match.end()
                    buffer = buffer[idx:]
                    state = 2
            
            if state == 2:
                yield_str = ""
                i = 0
                while i < len(buffer):
                    char = buffer[i]
                    if in_escape:
                        if char == 'n': yield_str += '\n'
                        elif char == '"': yield_str += '"'
                        elif char == '\\': yield_str += '\\'
                        elif char == 'r': yield_str += '\r'
                        elif char == 't': yield_str += '\t'
                        else: yield_str += char
                        in_escape = False
                    elif char == '\\':
                        in_escape = True
                    elif char == '"':
                        # Fim da string "output"
                        state = -1
                        break
                    else:
                        yield_str += char
                    i += 1
                
                if yield_str:
                    yield yield_str
                
                # Reseta o buffer mas guarda a contrabarra se ela sobrou solta no final do chunk
                buffer = "\\" if in_escape else ""

            if state == 3:
                # Para redirecionamentos, apenas acumulamos o JSON até a Stream fechar.
                pass

        if is_redirect:
            try:
                # Tenta corrigir JSON inacabado
                cleaned_buffer = buffer.strip()
                match_slug = re.search(r'"slug"\s*:\s*"([^"]+)"', cleaned_buffer)
                match_reason = re.search(r'"reason"\s*:\s*"([^"]+)"', cleaned_buffer)
                
                if match_slug:
                    target_slug = match_slug.group(1).strip().lower()
                    reason = match_reason.group(1).strip() if match_reason else "Sem motivo detalhado"
                    raise AgentRedirectSignal(target_slug, reason, raw_response=buffer)
                else:
                    yield "\n\n⚠️ O Agente tentou redirecionar, mas não informou o Slug de destino."
            except AgentRedirectSignal:
                raise
            except Exception as e:
                logger.error(f"Failed to extract slug from JSON: {buffer} -> {e}")
                yield f"\n\n⚠️ Erro ao rotear agente (JSON). {str(e)}"

        # Atualiza estatísticas do agente
        elapsed_ms = (time.time() - start) * 1000
        agent.total_calls += 1
        agent.avg_response_time_ms = (
            (agent.avg_response_time_ms * (agent.total_calls - 1) + elapsed_ms)
            / agent.total_calls
        )
        await db.commit()

    except AgentRedirectSignal:
        # Repassa a exceção de roteamento de volta pro router interceptar e reiniciar
        raise
    except Exception as e:
        logger.error(f"Agent {agent_slug} error: {e}")
        yield f"\n\n⚠️ Erro ao processar resposta: {str(e)}"


async def run_agent_complete(
    db: AsyncSession,
    agent_slug: str,
    user_message: str,
    history: List[Dict[str, str]],
    context: Optional[str] = None,
) -> Dict:
    """Executa o agente e retorna a resposta completa (sem streaming)"""
    agent = await get_agent_config(db, agent_slug)
    if not agent:
        return {"content": "Agente não disponível.", "tokens": 0, "model": ""}

    system_prompt = await get_agent_prompt(db, agent_slug)
    if not system_prompt:
        return {"content": "Configuração incompleta.", "tokens": 0, "model": ""}

    full_system = system_prompt
    if context:
        full_system += f"\n\n## Contexto:\n{context}"

    messages = [{"role": "system", "content": full_system}]
    messages.extend(history[-10:])
    messages.append({"role": "user", "content": user_message})

    try:
        result = await openrouter.chat_completion(
            model=agent.model,
            messages=messages,
            temperature=agent.temperature,
            max_tokens=agent.max_tokens,
        )
        content = result["choices"][0]["message"]["content"]
        tokens = result.get("usage", {}).get("total_tokens", 0)

        agent.total_calls += 1
        agent.total_tokens_used += tokens
        await db.commit()

        return {"content": content, "tokens": tokens, "model": agent.model}
    except Exception as e:
        logger.error(f"Agent {agent_slug} complete error: {e}")
        return {"content": f"Erro: {str(e)}", "tokens": 0, "model": agent.model}
