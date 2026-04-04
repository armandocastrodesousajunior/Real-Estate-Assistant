from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, delete
from typing import List, Optional
import json, time, uuid

from app.core.database import get_db
from app.models.tool import Tool, agent_tools
from app.schemas.tool import ToolResponse, ToolCreate, ToolUpdate, AgentToolLink
from app.core.tools_registry import get_all_internal_tools
from app.agents.openrouter import openrouter
from app.core.config import settings

router = APIRouter()

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
async def list_tools(db: AsyncSession = Depends(get_db)):
    internal_tools = get_all_internal_tools()
    result = await db.execute(select(Tool))
    external_tools = result.scalars().all()
    return internal_tools + [ToolResponse.model_validate(t) for t in external_tools]


@router.post("/", response_model=ToolResponse)
async def create_tool(tool_in: ToolCreate, db: AsyncSession = Depends(get_db)):
    if any(t["slug"] == tool_in.slug for t in get_all_internal_tools()):
        raise HTTPException(status_code=400, detail="Slug reservada por ferramenta interna")
    result = await db.execute(select(Tool).where(Tool.slug == tool_in.slug))
    if result.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="Slug ja existe")
    new_tool = Tool(**tool_in.dict())
    db.add(new_tool)
    await db.commit()
    await db.refresh(new_tool)
    return ToolResponse.model_validate(new_tool)


@router.get("/agent/{agent_slug}", response_model=List[str])
async def list_agent_tools(agent_slug: str, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(agent_tools.c.tool_slug).where(agent_tools.c.agent_slug == agent_slug))
    return [row[0] for row in result.all()]


@router.post("/link")
async def link_unlink_tool(link: AgentToolLink, db: AsyncSession = Depends(get_db)):
    if link.action == "link":
        q = select(agent_tools).where(
            agent_tools.c.agent_slug == link.agent_slug,
            agent_tools.c.tool_slug == link.tool_slug
        )
        res = await db.execute(q)
        if res.first():
            return {"status": "already linked"}
        ins = agent_tools.insert().values(agent_slug=link.agent_slug, tool_slug=link.tool_slug)
        await db.execute(ins)
    else:
        dele = delete(agent_tools).where(
            agent_tools.c.agent_slug == link.agent_slug,
            agent_tools.c.tool_slug == link.tool_slug
        )
        await db.execute(dele)
    await db.commit()
    return {"status": "success"}


@router.delete("/{slug}")
async def delete_tool(slug: str, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Tool).where(Tool.slug == slug))
    tool = result.scalar_one_or_none()
    if not tool:
        raise HTTPException(status_code=404, detail="Ferramenta não encontrada ou interna")
    await db.delete(tool)
    await db.commit()
    return {"status": "ok"}


# ─── SANDBOX ENDPOINT ────────────────────────────────────────────────────────

class SandboxRequest:
    pass

from pydantic import BaseModel

class SandboxChatRequest(BaseModel):
    message: str
    history: List[dict] = []


@router.post("/{slug}/sandbox")
async def tool_sandbox(slug: str, req: SandboxChatRequest, db: AsyncSession = Depends(get_db)):
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
                "model": settings.SUPERVISOR_MODEL,
                "injected_prompt_length": len(system_prompt),
                "history_turns": len(req.history),
                "system_prompt": system_prompt,
            }
            yield f"data: {json.dumps(meta)}\n\n"

            # Stream de tokens
            async for chunk in openrouter.chat_completion_stream(
                model=settings.SUPERVISOR_MODEL,
                messages=messages,
                temperature=0.4,
                max_tokens=2048,
            ):
                full_response.append(chunk)
                token_count += 1
                yield f'data: {json.dumps({"type": "token", "content": chunk})}\n\n'

            elapsed_ms = int((time.time() - start_time) * 1000)
            response_text = "".join(full_response)

            # Evento final com métricas
            done_event = {
                "type": "sandbox_done",
                "elapsed_ms": elapsed_ms,
                "approx_tokens": token_count * 3,  # estimativa
                "response_length": len(response_text),
                "model": settings.SUPERVISOR_MODEL,
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
