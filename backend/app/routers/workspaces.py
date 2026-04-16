from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from typing import List
from pydantic import BaseModel

from app.core.database import get_db
from app.core.security import get_current_user
from app.models.user import User
from app.models.workspace import Workspace
from sqlalchemy.orm import selectinload

router = APIRouter()

class WorkspaceCreate(BaseModel):
    name: str

class WorkspaceResponse(BaseModel):
    id: int
    name: str
    slug: str
    owner_id: int

    class Config:
        from_attributes = True

@router.get("/", response_model=List[WorkspaceResponse])
async def list_user_workspaces(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Lista todos os workspaces aos quais o usuário pertence."""
    result = await db.execute(
        select(Workspace)
        .join(Workspace.members)
        .where(User.id == current_user.id)
    )
    return result.scalars().all()

@router.post("/", response_model=WorkspaceResponse, status_code=status.HTTP_201_CREATED)
async def create_workspace(
    data: WorkspaceCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Cria um novo workspace e vincula o usuário como dono e membro."""
    
    # Verifica limite de workspaces do usuário (carrega owned_workspaces se necessário)
    count_result = await db.execute(
        select(func.count(Workspace.id)).where(Workspace.owner_id == current_user.id)
    )
    owned_count = count_result.scalar()
    
    if owned_count >= current_user.workspace_limit:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"Limite de {current_user.workspace_limit} workspaces atingido."
        )

    # Gera slug simples
    slug = data.name.lower().replace(" ", "-")
    
    workspace = Workspace(
        name=data.name,
        slug=slug,
        owner_id=current_user.id
    )
    
    db.add(workspace)
    await db.flush()
    
    # Adiciona usuário como membro de forma segura via SQL (evita MissingGreenlet do lazy-load)
    from sqlalchemy import insert
    from app.models.workspace import workspace_members
    await db.execute(
        insert(workspace_members).values(
            user_id=current_user.id,
            workspace_id=workspace.id
        )
    )
    
    await db.commit()
    await db.refresh(workspace)
    
    return workspace

@router.get("/{workspace_id}", response_model=WorkspaceResponse)
async def get_workspace_detail(
    workspace_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Retorna detalhes de um workspace específico, se o usuário for membro."""
    result = await db.execute(
        select(Workspace).where(
            Workspace.id == workspace_id,
            Workspace.members.any(id=current_user.id)
        )
    )
    workspace = result.scalar_one_or_none()
    if not workspace:
        raise HTTPException(status_code=404, detail="Workspace não encontrado ou acesso negado")
    
    return workspace

class WorkspaceUpdate(BaseModel):
    name: str

@router.put("/{workspace_id}", response_model=WorkspaceResponse)
async def update_workspace(
    workspace_id: int,
    data: WorkspaceUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Renomeia um workspace (Apenas Dono)."""
    result = await db.execute(
        select(Workspace).where(Workspace.id == workspace_id, Workspace.owner_id == current_user.id)
    )
    workspace = result.scalar_one_or_none()
    if not workspace:
        raise HTTPException(status_code=403, detail="Apenas o dono pode editar o workspace")
    
    workspace.name = data.name
    workspace.slug = data.name.lower().replace(" ", "-") # Atualiza slug também
    
    await db.commit()
    await db.refresh(workspace)
    return workspace

# --- Member Management ---

class MemberAdd(BaseModel):
    email: str

@router.get("/{workspace_id}/members")
async def list_workspace_members(
    workspace_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Lista membros de um workspace (Deve ser membro)."""
    result = await db.execute(
        select(Workspace)
        .options(selectinload(Workspace.members))
        .where(Workspace.id == workspace_id, Workspace.members.any(id=current_user.id))
    )
    workspace = result.scalar_one_or_none()
    if not workspace:
        raise HTTPException(status_code=403, detail="Acesso negado")
    
    return [{
        "id": m.id,
        "email": m.email,
        "full_name": m.full_name,
        "is_owner": m.id == workspace.owner_id
    } for m in workspace.members]

@router.post("/{workspace_id}/members")
async def add_workspace_member(
    workspace_id: int,
    data: MemberAdd,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Adiciona um membro ao workspace por e-mail (Apenas Dono)."""
    # 1. Busca workspace
    result = await db.execute(
        select(Workspace)
        .options(selectinload(Workspace.members))
        .where(Workspace.id == workspace_id, Workspace.owner_id == current_user.id)
    )
    workspace = result.scalar_one_or_none()
    if not workspace:
        raise HTTPException(status_code=403, detail="Apenas o dono pode convidar membros")
    
    # 2. Busca usuário por e-mail
    user_result = await db.execute(select(User).where(User.email == data.email))
    user_to_add = user_result.scalar_one_or_none()
    if not user_to_add:
        raise HTTPException(status_code=404, detail="Usuário não encontrado")
    
    # 3. Verifica se já é membro
    if user_to_add in workspace.members:
        raise HTTPException(status_code=400, detail="Usuário já é membro deste workspace")
    
    # 4. Adiciona
    workspace.members.append(user_to_add)
    await db.commit()
    
    return {"message": f"Usuário {data.email} adicionado com sucesso"}

@router.delete("/{workspace_id}/members/{user_id}")
async def remove_workspace_member(
    workspace_id: int,
    user_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Remove um membro do workspace (Apenas Dono, não pode remover a si mesmo)."""
    if user_id == current_user.id:
        raise HTTPException(status_code=400, detail="Você não pode se remover do próprio workspace")

    result = await db.execute(
        select(Workspace)
        .options(selectinload(Workspace.members))
        .where(Workspace.id == workspace_id, Workspace.owner_id == current_user.id)
    )
    workspace = result.scalar_one_or_none()
    if not workspace:
        raise HTTPException(status_code=403, detail="Apenas o dono pode remover membros")
    
    # Busca usuário na lista de membros
    user_to_remove = next((m for m in workspace.members if m.id == user_id), None)
    if not user_to_remove:
        raise HTTPException(status_code=404, detail="Usuário não é membro deste workspace")
    
    workspace.members.remove(user_to_remove)
    await db.commit()
    
    return {"message": "Membro removido com sucesso"}

@router.delete("/{workspace_id}")
async def delete_workspace(
    workspace_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Deleta um workspace e todos os seus dados em cascata (Apenas Dono)."""
    result = await db.execute(
        select(Workspace)
        .where(Workspace.id == workspace_id)
    )
    workspace = result.scalar_one_or_none()
    
    if not workspace:
        raise HTTPException(status_code=404, detail="Workspace não encontrado")
        
    if workspace.owner_id != current_user.id:
        raise HTTPException(status_code=403, detail="Apenas o dono pode deletar o workspace")
        
    # A exclusão no ORM já cuidará de acionar os cascades (dependendo da configuração do banco/ORM).
    await db.delete(workspace)
    await db.commit()
    
    return {"message": "Workspace removido com sucesso"}
