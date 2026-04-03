from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, delete
from typing import List, Optional
from app.core.database import get_db
from app.models.tool import Tool, agent_tools
from app.schemas.tool import ToolResponse, ToolCreate, ToolUpdate, AgentToolLink
from app.core.tools_registry import get_all_internal_tools

router = APIRouter()

@router.get("/", response_model=List[ToolResponse])
async def list_tools(db: AsyncSession = Depends(get_db)):
    # 1. Internal tools from registry
    internal_tools = get_all_internal_tools()
    
    # 2. External tools from database
    result = await db.execute(select(Tool))
    external_tools = result.scalars().all()
    
    # Combined results
    return internal_tools + [ToolResponse.model_validate(t) for t in external_tools]

@router.post("/", response_model=ToolResponse)
async def create_tool(tool_in: ToolCreate, db: AsyncSession = Depends(get_db)):
    # Check if slug already exists in internal tools
    if any(t["slug"] == tool_in.slug for t in get_all_internal_tools()):
        raise HTTPException(status_code=400, detail="Slug reservada por ferramenta interna")
    
    # Check if exists in DB
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
        # Check if already linked
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
        # Unlink
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
