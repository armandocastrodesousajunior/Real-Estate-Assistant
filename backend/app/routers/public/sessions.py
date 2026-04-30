from fastapi import APIRouter, Depends, HTTPException, Security, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from typing import Optional
from pydantic import BaseModel
import uuid

from app.core.database import get_db
from app.core.security import get_workspace_by_api_token
from app.models.workspace import Workspace
from app.models.conversation import Conversation
from app.schemas.chat import ConversationResponse

router = APIRouter()

class SessionCreate(BaseModel):
    session_id: Optional[str] = None
    title: Optional[str] = None

@router.get(
    "/",
    response_model=list[ConversationResponse],
    summary="Listar Sessões",
    description="Retorna a lista de sessões do workspace.",
)
async def list_sessions(
    db: AsyncSession = Depends(get_db),
    workspace: Workspace = Security(get_workspace_by_api_token)
):
    result = await db.execute(
        select(Conversation)
        .where(Conversation.workspace_id == workspace.id)
        .order_by(Conversation.created_at.desc())
    )
    return [ConversationResponse.model_validate(c) for c in result.scalars().all()]


@router.post(
    "/",
    response_model=ConversationResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Criar Sessão",
    description="Cria uma nova sessão de conversa. Se o session_id não for informado, um UUID será gerado automaticamente.",
)
async def create_session(
    data: SessionCreate,
    db: AsyncSession = Depends(get_db),
    workspace: Workspace = Security(get_workspace_by_api_token)
):
    session_id = data.session_id or str(uuid.uuid4())
    
    # Verifica se já existe
    result = await db.execute(
        select(Conversation).where(
            Conversation.session_id == session_id,
            Conversation.workspace_id == workspace.id
        )
    )
    if result.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="Session ID já existe neste workspace.")

    conv = Conversation(
        session_id=session_id,
        title=data.title,
        is_test=False,
        workspace_id=workspace.id
    )
    db.add(conv)
    await db.commit()
    await db.refresh(conv)
    
    return ConversationResponse.model_validate(conv)


@router.get(
    "/{session_id}",
    response_model=ConversationResponse,
    summary="Consultar Sessão",
    description="Retorna os dados básicos de uma sessão pelo seu session_id.",
)
async def get_session(
    session_id: str,
    db: AsyncSession = Depends(get_db),
    workspace: Workspace = Security(get_workspace_by_api_token)
):
    result = await db.execute(
        select(Conversation).where(
            Conversation.session_id == session_id,
            Conversation.workspace_id == workspace.id
        )
    )
    conv = result.scalar_one_or_none()
    if not conv:
        raise HTTPException(status_code=404, detail="Sessão não encontrada.")
    return ConversationResponse.model_validate(conv)


class SessionUpdate(BaseModel):
    title: str

@router.put(
    "/{session_id}",
    response_model=ConversationResponse,
    summary="Atualizar Sessão",
    description="Atualiza metadados (como título) de uma sessão existente.",
)
async def update_session(
    session_id: str,
    data: SessionUpdate,
    db: AsyncSession = Depends(get_db),
    workspace: Workspace = Security(get_workspace_by_api_token)
):
    result = await db.execute(
        select(Conversation).where(
            Conversation.session_id == session_id,
            Conversation.workspace_id == workspace.id
        )
    )
    conv = result.scalar_one_or_none()
    if not conv:
        raise HTTPException(status_code=404, detail="Sessão não encontrada.")
    
    conv.title = data.title
    await db.commit()
    await db.refresh(conv)
    return ConversationResponse.model_validate(conv)
