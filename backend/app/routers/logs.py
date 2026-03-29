from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, cast, String
from pydantic import BaseModel
from typing import List, Optional, Dict, Any
from datetime import datetime

from app.core.database import get_db
from app.core.security import get_current_user
from app.models.conversation import Message, MessageRole, Conversation

router = APIRouter()

class LogEntry(BaseModel):
    id: int
    session_id: str
    created_at: datetime
    agent_slug: Optional[str]
    metadata: Optional[Dict[str, Any]]
    
    class Config:
        from_attributes = True

@router.get(
    "/",
    response_model=List[LogEntry],
    summary="Listar logs do sistema multi-agentes",
    description="Retorna um histórico global de roteamento, focando nas decisões do supervisor e redirecionamentos.",
)
async def list_logs(
    limit: int = Query(50, ge=1, le=200),
    db: AsyncSession = Depends(get_db),
    _: dict = Depends(get_current_user),
):
    # Buscamos mensagens do tipo assistente que possuam metadata (que contém a chave supervisor_selection)
    # Fazemos um join com a tabela Conversation para puxarmos o session_id
    query = (
        select(Message, Conversation.session_id)
        .join(Conversation, Message.conversation_id == Conversation.id)
        .where(Message.role == MessageRole.ASSISTANT)
        .where(Message.metadata_ != None)
        .order_by(Message.created_at.desc())
        .limit(limit)
    )
    
    result = await db.execute(query)
    rows = result.all()
    
    logs = []
    for msg, session_id in rows:
        logs.append(LogEntry(
            id=msg.id,
            session_id=session_id,
            created_at=msg.created_at,
            agent_slug=msg.agent_slug,
            metadata=msg.metadata_
        ))
        
    return logs
