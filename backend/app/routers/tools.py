from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, delete
from typing import List, Optional, Dict, Any
import json, time, uuid

from app.core.database import get_db
from app.core.security import get_current_user, get_current_workspace
from app.models.user import User
from app.models.workspace import Workspace
from app.models.tool import Tool, agent_tools
from app.models.agent import Agent
from app.schemas.tool import ToolResponse, ToolCreate, ToolUpdate, AgentToolLink
from app.core.tools_registry import get_all_internal_tools
from app.agents.openrouter import openrouter
from app.core.config import settings

router = APIRouter()

# ─── Schema de parâmetros para cada ferramenta interna ────────────────────────
# Define os campos que o formulário manual vai mostrar
TOOL_PARAMS_SCHEMA: Dict[str, List[Dict[str, Any]]] = {
    "consultar_lead": [
        {"name": "id", "label": "ID do Lead", "type": "number", "required": False, "placeholder": "ex: 42"},
        {"name": "email", "label": "E-mail", "type": "email", "required": False, "placeholder": "ex: cliente@email.com"},
        {"name": "phone", "label": "Telefone", "type": "text", "required": False, "placeholder": "ex: 11999999999"},
    ],
    "criar_lead": [
        {"name": "name", "label": "Nome *", "type": "text", "required": True, "placeholder": "Nome completo"},
        {"name": "email", "label": "E-mail", "type": "email", "required": False, "placeholder": "ex: cliente@email.com"},
        {"name": "phone", "label": "Telefone", "type": "text", "required": False, "placeholder": "ex: 11999999999"},
        {"name": "source", "label": "Origem", "type": "select", "required": False, "options": ["website", "chat_ia", "whatsapp", "telefone", "indicacao", "portal_imovel", "redes_sociais", "outro"]},
        {"name": "status", "label": "Status", "type": "select", "required": False, "options": ["novo", "contatado", "qualificado", "proposta", "negociando", "fechado_ganho", "fechado_perdido"]},
        {"name": "notes", "label": "Observações", "type": "textarea", "required": False, "placeholder": "Notas sobre o lead..."},
        {"name": "desired_city", "label": "Cidade desejada", "type": "text", "required": False},
        {"name": "max_price", "label": "Orçamento máx. (R$)", "type": "number", "required": False},
    ],
    "editar_lead": [
        {"name": "id", "label": "ID do Lead *", "type": "number", "required": True},
        {"name": "name", "label": "Nome", "type": "text", "required": False},
        {"name": "email", "label": "E-mail", "type": "email", "required": False},
        {"name": "phone", "label": "Telefone", "type": "text", "required": False},
        {"name": "status", "label": "Status", "type": "select", "required": False, "options": ["novo", "contatado", "qualificado", "proposta", "negociando", "fechado_ganho", "fechado_perdido"]},
        {"name": "notes", "label": "Observações", "type": "textarea", "required": False},
    ],
    "deletar_lead": [
        {"name": "id", "label": "ID do Lead *", "type": "number", "required": True, "placeholder": "ex: 42"},
    ],
    "listar_leads": [
        {"name": "status", "label": "Status (filtro)", "type": "select", "required": False, "options": ["", "novo", "contatado", "qualificado", "proposta", "negociando", "fechado_ganho", "fechado_perdido"]},
        {"name": "source", "label": "Origem (filtro)", "type": "select", "required": False, "options": ["", "website", "chat_ia", "whatsapp", "telefone", "indicacao", "portal_imovel", "redes_sociais", "outro"]},
        {"name": "page", "label": "Página", "type": "number", "required": False, "placeholder": "1"},
        {"name": "page_size", "label": "Itens por página", "type": "number", "required": False, "placeholder": "10"},
    ],
    "mover_lead_funil": [
        {"name": "id", "label": "ID do Lead *", "type": "number", "required": True},
        {"name": "status", "label": "Novo Status *", "type": "select", "required": True, "options": ["novo", "contatado", "qualificado", "proposta", "negociando", "fechado_ganho", "fechado_perdido"]},
    ],
    "adicionar_obs_lead": [
        {"name": "id", "label": "ID do Lead *", "type": "number", "required": True},
        {"name": "observation", "label": "Observação *", "type": "textarea", "required": True, "placeholder": "Texto da observação..."},
    ],
    "consultar_sessao": [
        {"name": "session_id", "label": "Session ID *", "type": "text", "required": True, "placeholder": "uuid da sessão"},
    ],
    "listar_sessoes": [
        {"name": "agent_slug", "label": "Slug do Agente", "type": "text", "required": False},
        {"name": "status", "label": "Status", "type": "select", "required": False, "options": ["", "open", "closed", "pending"]},
        {"name": "limit", "label": "Limite", "type": "number", "required": False, "placeholder": "20"},
    ],
    "alterar_status_sessao": [
        {"name": "session_id", "label": "Session ID *", "type": "text", "required": True},
        {"name": "status", "label": "Novo Status *", "type": "select", "required": True, "options": ["open", "closed", "pending"]},
    ],
    "encerrar_sessao": [
        {"name": "session_id", "label": "Session ID *", "type": "text", "required": True},
    ],
    "transferir_sessao": [
        {"name": "session_id", "label": "Session ID *", "type": "text", "required": True},
        {"name": "target_agent_slug", "label": "Agente de Destino *", "type": "text", "required": True, "placeholder": "slug do agente"},
    ],
    "consultar_imovel": [
        {"name": "id", "label": "ID do Imóvel", "type": "number", "required": False},
        {"name": "code", "label": "Código de Referência", "type": "text", "required": False},
    ],
    "listar_imoveis": [
        {"name": "type", "label": "Tipo", "type": "select", "required": False, "options": ["", "apartamento", "casa", "comercial", "terreno", "rural", "kitnet_studio"]},
        {"name": "min_price", "label": "Preço mínimo (R$)", "type": "number", "required": False},
        {"name": "max_price", "label": "Preço máximo (R$)", "type": "number", "required": False},
        {"name": "city", "label": "Cidade", "type": "text", "required": False},
        {"name": "neighborhood", "label": "Bairro", "type": "text", "required": False},
        {"name": "bedrooms", "label": "Quartos (mín.)", "type": "number", "required": False},
        {"name": "page_size", "label": "Qtd resultados", "type": "number", "required": False, "placeholder": "10"},
    ],
    "consultar_disponibilidade": [
        {"name": "id", "label": "ID do Imóvel *", "type": "number", "required": True},
    ],
    "buscar_imoveis_perfil": [
        {"name": "budget", "label": "Orçamento (R$)", "type": "number", "required": False},
        {"name": "city", "label": "Cidade", "type": "text", "required": False},
        {"name": "type", "label": "Tipo", "type": "select", "required": False, "options": ["", "apartamento", "casa", "comercial", "terreno"]},
        {"name": "bedrooms", "label": "Quartos", "type": "number", "required": False},
        {"name": "min_area", "label": "Área mínima (m²)", "type": "number", "required": False},
    ],
    "vincular_imovel_lead": [
        {"name": "lead_id", "label": "ID do Lead *", "type": "number", "required": True},
        {"name": "property_ids", "label": "IDs dos Imóveis * (separados por vírgula)", "type": "text", "required": True, "placeholder": "ex: 1,2,3"},
    ],
}

SANDBOX_SYSTEM_PROMPT = """Você é o **RealtyAI Tool Sandbox** — um assistente especializado em testar e demonstrar ferramentas de forma interativa.

## Sua missão
Simular a execução da ferramenta descrita abaixo, como se você fosse um agente que acabou de receber acesso a ela.

## Comportamento esperado
1. **Entenda o que a ferramenta faz** com base nas instruções abaixo.
2. **Execute simulações realistas**: quando o usuário pedir para testar, gere uma saída coerente com o que a ferramenta retornaria.
3. **Peça informações faltantes**: se a ferramenta precisar de parâmetros e o usuário não forneceu, pergunte antes de prosseguir.
4. **Mostre seu raciocínio**: explique o que você faria passo a passo.
5. **Seja honesto sobre limitações**: se for uma simulação e não uma execução real, deixe isso claro.

## Formato das suas respostas
- Use markdown para organizar a saída
- Para resultados simulados, use blocos de código JSON quando fizer sentido
- Para raciocínio, use seções claras com subtítulos
- Seja detalhado mas objetivo

---

## FERRAMENTA CONFIGURADA PARA SANDBOX:

{tool_context}

---

Aguarde o usuário interagir. Apresente-se brevemente e pergunte o que ele quer testar."""


@router.get("/", response_model=List[ToolResponse])
async def list_tools(
    db: AsyncSession = Depends(get_db),
    workspace: Workspace = Depends(get_current_workspace)
):
    internal_tools = get_all_internal_tools()
    result = await db.execute(select(Tool).where(Tool.workspace_id == workspace.id, Tool.type == "external"))
    external_tools = result.scalars().all()
    return internal_tools + [ToolResponse.model_validate(t) for t in external_tools]


@router.post("/", response_model=ToolResponse)
async def create_tool(
    tool_in: ToolCreate, 
    db: AsyncSession = Depends(get_db),
    workspace: Workspace = Depends(get_current_workspace)
):
    if any(t["slug"] == tool_in.slug for t in get_all_internal_tools()):
        raise HTTPException(status_code=400, detail="Slug reservada por ferramenta interna")
    result = await db.execute(
        select(Tool).where(Tool.slug == tool_in.slug, Tool.workspace_id == workspace.id)
    )
    if result.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="Slug ja existe neste workspace")
    new_tool = Tool(**tool_in.dict(), workspace_id=workspace.id)
    db.add(new_tool)
    await db.commit()
    await db.refresh(new_tool)
    return ToolResponse.model_validate(new_tool)


@router.get("/agent/{agent_slug}", response_model=List[str])
async def list_agent_tools(
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

    # Busca slugs das ferramentas vinculadas (podem ser internas ou externas)
    # Para ferramentas externas, precisamos buscar o slug na tabela tools pelo ID
    # Para ferramentas internas, como salvamos o tool_slug no DB (ou decidimos agora usar IDs tbm?)
    
    # IMPORTANTE: No modelo anterior, agent_tools tinha tool_slug.
    # No novo modelo, agent_tools tem tool_id (FK para tools.id).
    # MAS ferramentas internas não estão na tabela `tools` (são estáticas no código).
    
    # SOLUÇÃO: Vamos manter a lógica de que apenas ferramentas EXTERNAS/CUSTOM podem ser vinculadas via DB ID.
    # OU, melhor ainda: Todas as ferramentas disponíveis devem estar ou poder ser referenciadas.
    
    # Decisão: Ferramentas internas continuam sendo identificadas por slug, mas a tabela associativa
    # para ferramentas customizadas usará IDs.
    
    stmt = select(Tool.slug).join(
        agent_tools, Tool.id == agent_tools.c.tool_id
    ).where(
        agent_tools.c.agent_id == agent.id
    )
    result = await db.execute(stmt)
    return [row[0] for row in result.all()]


@router.post("/link")
async def link_unlink_tool(
    link: AgentToolLink, 
    db: AsyncSession = Depends(get_db),
    workspace: Workspace = Depends(get_current_workspace)
):
    # Valida se o agente pertence ao workspace
    agent_res = await db.execute(
        select(Agent).where(Agent.slug == link.agent_slug, Agent.workspace_id == workspace.id)
    )
    agent = agent_res.scalar_one_or_none()
    if not agent:
        raise HTTPException(status_code=403, detail="Agente não pertence a este workspace")

    # Busca a ferramenta pelo slug para pegar o ID
    tool_res = await db.execute(
        select(Tool).where(Tool.slug == link.tool_slug, Tool.workspace_id == workspace.id)
    )
    tool = tool_res.scalar_one_or_none()
    
    # Se não encontrar a ferramenta, verifica se é uma ferramenta interna nativa para auto-persistir
    if not tool:
        from app.core.tools_registry import get_tool_by_slug
        internal = get_tool_by_slug(link.tool_slug)
        if internal:
            tool = Tool(
                slug=internal["slug"],
                name=internal["name"],
                description=internal["description"],
                prompt=internal["prompt"],
                type="internal",
                workspace_id=workspace.id,
                is_active=True
            )
            db.add(tool)
            await db.commit()
            await db.refresh(tool)
        else:
            raise HTTPException(status_code=404, detail="Ferramenta não encontrada para vínculo por ID")

    if link.action == "link":
        q = select(agent_tools).where(
            agent_tools.c.agent_id == agent.id,
            agent_tools.c.tool_id == tool.id
        )
        res = await db.execute(q)
        if res.first():
            return {"status": "already linked"}
        ins = agent_tools.insert().values(agent_id=agent.id, tool_id=tool.id)
        await db.execute(ins)
    else:
        dele = delete(agent_tools).where(
            agent_tools.c.agent_id == agent.id,
            agent_tools.c.tool_id == tool.id
        )
        await db.execute(dele)
    await db.commit()
    return {"status": "success"}


@router.delete("/{slug}")
async def delete_tool(
    slug: str, 
    db: AsyncSession = Depends(get_db),
    workspace: Workspace = Depends(get_current_workspace)
):
    result = await db.execute(
        select(Tool).where(Tool.slug == slug, Tool.workspace_id == workspace.id)
    )
    tool = result.scalar_one_or_none()
    if not tool:
        raise HTTPException(status_code=404, detail="Ferramenta não encontrada ou acesso negado")
    await db.delete(tool)
    await db.commit()
    return {"status": "ok"}


# ─── SCHEMA endpoint: retorna os campos do formulário manual ──────────────────

@router.get("/{slug}/schema")
async def get_tool_schema(slug: str):
    """Retorna o schema de parâmetros para a ferramenta, usado para montar o formulário manual."""
    params = TOOL_PARAMS_SCHEMA.get(slug, [])
    return {
        "slug": slug,
        "has_schema": len(params) > 0,
        "params": params,
    }


# ─── EXECUTE endpoint: executa ferramenta interna com parâmetros reais ────────

from pydantic import BaseModel as PydanticBase

class ManualExecuteRequest(PydanticBase):
    params: Dict[str, Any] = {}


@router.post("/{slug}/execute")
async def execute_tool(
    slug: str, 
    req: ManualExecuteRequest, 
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    workspace: Workspace = Depends(get_current_workspace)
):
    """
    Executa uma ferramenta interna diretamente com parâmetros fornecidos manualmente.
    Mapeia o slug para o endpoint real do sistema e retorna o resultado.
    """
    import httpx
    from app.core.config import settings

    start = time.time()
    params = {k: v for k, v in req.params.items() if v is not None and v != ""}

    # Monta a requisição HTTP interna para o endpoint real do sistema
    base = "http://localhost:8000/api/v1"
    token = None  # execução interna — sem auth necessária para operações de leitura

    # Mapa: slug → (method, url_template, body_or_params)
    TOOL_ROUTES = {
        # LEADS
        "listar_leads":       ("GET",  f"{base}/leads/",     "params"),
        "consultar_lead":     ("GET",  f"{base}/leads/{{id}}", "path_or_query"),
        "criar_lead":         ("POST", f"{base}/leads/",     "body"),
        "editar_lead":        ("PUT",  f"{base}/leads/{{id}}", "body_with_id"),
        "deletar_lead":       ("DELETE", f"{base}/leads/{{id}}", "path"),
        "mover_lead_funil":   ("PUT",  f"{base}/leads/{{id}}", "body_with_id"),
        "adicionar_obs_lead": ("PUT",  f"{base}/leads/{{id}}", "body_with_id"),
        # PROPERTIES
        "listar_imoveis":          ("GET",  f"{base}/properties/", "params"),
        "consultar_imovel":        ("GET",  f"{base}/properties/{{id}}", "path_or_query"),
        "consultar_disponibilidade": ("GET", f"{base}/properties/{{id}}", "path"),
        "buscar_imoveis_perfil":   ("GET",  f"{base}/properties/", "params"),
        # SESSIONS / CONVERSATIONS
        "consultar_sessao":    ("GET",  f"{base}/chat/conversations/{{session_id}}", "path"),
        "listar_sessoes":      ("GET",  f"{base}/chat/conversations", "params"),
        "alterar_status_sessao": ("PATCH", f"{base}/chat/conversations/{{session_id}}", "body_with_path"),
        "encerrar_sessao":     ("DELETE", f"{base}/chat/conversations/{{session_id}}", "path"),
        "transferir_sessao":   ("PATCH", f"{base}/chat/conversations/{{session_id}}", "body_with_path"),
    }

    if slug not in TOOL_ROUTES:
        # Ferramenta externa: sem execução real possível
        elapsed = int((time.time() - start) * 1000)
        return {
            "success": False,
            "message": "Esta é uma ferramenta externa — não possui execução direta. Use o Sandbox IA para testar.",
            "elapsed_ms": elapsed,
            "params_sent": params,
            "result": None,
        }

    method, url_template, mode = TOOL_ROUTES[slug]

    try:
        # Resolve URL com path params
        url = url_template
        body = {}
        query_params = {}

        if "{id}" in url:
            if "id" in params:
                url = url.replace("{id}", str(params.pop("id")))
            else:
                return {"success": False, "message": "Parâmetro 'id' é obrigatório.", "result": None, "elapsed_ms": 0}

        if "{session_id}" in url:
            if "session_id" in params:
                url = url.replace("{session_id}", str(params.pop("session_id")))
            else:
                return {"success": False, "message": "Parâmetro 'session_id' é obrigatório.", "result": None, "elapsed_ms": 0}

        if mode in ("params", "path_or_query"):
            query_params = {k: v for k, v in params.items() if v}
        elif mode in ("body", "body_with_id", "body_with_path"):
            body = params

        # Busca um token de admin do sistema para auth, mas agora com o contexto do usuário real
        from app.core.security import create_access_token
        internal_token = create_access_token({"sub": current_user.email})
        headers = {
            "Authorization": f"Bearer {internal_token}", 
            "Content-Type": "application/json",
            "X-Workspace-Id": str(workspace.id)
        }

        async with httpx.AsyncClient(timeout=15.0) as client:
            if method == "GET":
                response = await client.get(url, params=query_params, headers=headers)
            elif method == "POST":
                response = await client.post(url, json=body, headers=headers)
            elif method == "PUT":
                response = await client.put(url, json=body, headers=headers)
            elif method == "PATCH":
                response = await client.patch(url, json=body, headers=headers)
            elif method == "DELETE":
                response = await client.delete(url, headers=headers)
            else:
                response = None

        elapsed = int((time.time() - start) * 1000)

        try:
            result_data = response.json()
        except Exception:
            result_data = response.text

        return {
            "success": response.status_code < 400,
            "status_code": response.status_code,
            "elapsed_ms": elapsed,
            "method": method,
            "url": url,
            "params_sent": {**query_params, **body},
            "result": result_data,
        }

    except Exception as e:
        elapsed = int((time.time() - start) * 1000)
        return {
            "success": False,
            "message": str(e),
            "elapsed_ms": elapsed,
            "result": None,
        }


# ─── SANDBOX ENDPOINT ────────────────────────────────────────────────────────

class SandboxRequest:
    pass

from pydantic import BaseModel

class SandboxChatRequest(BaseModel):
    message: str
    history: List[dict] = []


@router.post("/{slug}/sandbox")
async def tool_sandbox(
    slug: str, 
    req: SandboxChatRequest, 
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    workspace: Workspace = Depends(get_current_workspace)
):
    """
    Endpoint de Sandbox IA para teste de ferramentas.
    Retorna streaming SSE com tokens, logs e métricas.
    """
    # 1. Resolve a ferramenta (interna ou externa)
    tool_data = None
    for t in get_all_internal_tools():
        if t["slug"] == slug:
            tool_data = t
            break

    if not tool_data:
        result = await db.execute(select(Tool).where(Tool.slug == slug))
        db_tool = result.scalar_one_or_none()
        if not db_tool:
            raise HTTPException(status_code=404, detail=f"Ferramenta '{slug}' não encontrada.")
        tool_data = {
            "slug": db_tool.slug,
            "name": db_tool.name,
            "description": db_tool.description,
            "prompt": db_tool.prompt,
            "type": db_tool.type,
        }

    # 2. Constrói o system prompt com contexto da ferramenta
    tool_context = f"""**Nome:** {tool_data['name']}
**Slug:** `{tool_data['slug']}`
**Tipo:** {tool_data.get('type', 'external')}
**Descrição:** {tool_data.get('description', 'Sem descrição.')}

### Instruções de Uso (Prompt da Ferramenta):
```
{tool_data.get('prompt', 'Sem prompt definido.')}
```"""

    system_prompt = SANDBOX_SYSTEM_PROMPT.replace("{tool_context}", tool_context)

    # 3. Monta o histórico de mensagens
    messages = [{"role": "system", "content": system_prompt}]
    for h in req.history:
        if h.get("role") in ("user", "assistant"):
            messages.append({"role": h["role"], "content": h["content"]})
    messages.append({"role": "user", "content": req.message})

    # 4. Stream SSE
    async def event_stream():
        start_time = time.time()
        token_count = 0
        full_response = []

        try:
            # Emite metadados iniciais
            meta = {
                "type": "sandbox_meta",
                "tool_slug": tool_data["slug"],
                "tool_name": tool_data["name"],
                "model": workspace.supervisor_model or settings.DEFAULT_SUPERVISOR_MODEL,
                "injected_prompt_length": len(system_prompt),
                "history_turns": len(req.history),
                "system_prompt": system_prompt,
            }
            yield f"data: {json.dumps(meta)}\n\n"

            # Stream de tokens
            async for chunk in openrouter.chat_completion_stream(
                model=workspace.supervisor_model or settings.DEFAULT_SUPERVISOR_MODEL,
                messages=messages,
                temperature=0.4,
                max_tokens=2048,
                api_key=current_user.openrouter_key
            ):
                if isinstance(chunk, dict):
                    if "usage" in chunk:
                        token_count = chunk["usage"].get("total_tokens", token_count)
                    continue
                    
                full_response.append(chunk)
                yield f'data: {json.dumps({"type": "token", "content": chunk})}\n\n'

            elapsed_ms = int((time.time() - start_time) * 1000)
            response_text = "".join(full_response)

            # Evento final com métricas
            done_event = {
                "type": "sandbox_done",
                "elapsed_ms": elapsed_ms,
                "approx_tokens": token_count * 3,  # estimativa
                "response_length": len(response_text),
                "model": workspace.supervisor_model or settings.DEFAULT_SUPERVISOR_MODEL,
            }
            yield f"data: {json.dumps(done_event)}\n\n"

        except Exception as e:
            err = {"type": "sandbox_error", "message": str(e)}
            yield f"data: {json.dumps(err)}\n\n"

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )
