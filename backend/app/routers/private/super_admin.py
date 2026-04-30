from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, delete
from sqlalchemy.orm import selectinload
from typing import List, Dict, Any

from app.core.database import get_db
from app.core.security import get_superadmin, get_password_hash, User
from app.models.user import User as UserModel
from app.models.workspace import Workspace as WorkspaceModel
from app.schemas.admin import AdminUserCreate, AdminUserUpdate, GlobalStats

router = APIRouter()

@router.get("/stats", response_model=GlobalStats)
async def get_global_stats(
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(get_superadmin)
):
    """Retorna contagens globais para o dashboard de admin."""
    user_count_result = await db.execute(select(func.count(UserModel.id)))
    workspace_count_result = await db.execute(select(func.count(WorkspaceModel.id)))
    
    return {
        "total_users": user_count_result.scalar(),
        "total_workspaces": workspace_count_result.scalar(),
        "current_user_id": admin.id
    }

@router.get("/users", summary="Listar todos os usuários")
async def list_all_users(
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(get_superadmin)
):
    """Lista todos os usuários registrados na plataforma com contagem de workspaces."""
    result = await db.execute(
        select(UserModel)
        .options(selectinload(UserModel.workspaces))
        .order_by(UserModel.created_at.desc())
    )
    users = result.scalars().all()
    
    return [
        {
            "id": u.id,
            "email": u.email,
            "full_name": u.full_name,
            "is_active": u.is_active,
            "is_superadmin": u.is_superadmin,
            "workspace_limit": u.workspace_limit,
            "created_at": u.created_at,
            "workspace_count": len(u.workspaces)
        }
        for u in users
    ]

@router.post("/users", status_code=status.HTTP_201_CREATED)
async def create_user_admin(
    user_in: AdminUserCreate,
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(get_superadmin)
):
    """Cria um novo usuário via painel administrativo."""
    result = await db.execute(select(UserModel).where(UserModel.email == user_in.email))
    if result.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="Email já cadastrado")
        
    db_user = UserModel(
        email=user_in.email,
        full_name=user_in.full_name,
        hashed_password=get_password_hash(user_in.password),
        is_active=user_in.is_active,
        is_superadmin=user_in.is_superadmin,
        workspace_limit=user_in.workspace_limit
    )
    db.add(db_user)
    await db.commit()
    await db.refresh(db_user)
    return db_user

@router.put("/users/{user_id}")
async def update_user_admin(
    user_id: int,
    user_in: AdminUserUpdate,
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(get_superadmin)
):
    """Atualiza dados de um usuário via painel administrativo."""
    result = await db.execute(select(UserModel).where(UserModel.id == user_id))
    db_user = result.scalar_one_or_none()
    
    if not db_user:
        raise HTTPException(status_code=404, detail="Usuário não encontrado")
        
    update_data = user_in.model_dump(exclude_unset=True)
    
    if "password" in update_data:
        update_data["hashed_password"] = get_password_hash(update_data.pop("password"))
        
    for field, value in update_data.items():
        setattr(db_user, field, value)
        
    await db.commit()
    await db.refresh(db_user)
    return db_user

@router.delete("/users/{user_id}")
async def delete_user_admin(
    user_id: int,
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(get_superadmin)
):
    """Remove permanentemente um usuário."""
    if user_id == admin.id:
        raise HTTPException(status_code=400, detail="Não é possível remover a própria conta")
        
    await db.execute(delete(UserModel).where(UserModel.id == user_id))
    await db.commit()
    return {"status": "success"}

@router.get("/workspaces", summary="Listar todos os workspaces")
async def list_all_workspaces(
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(get_superadmin)
):
    """Lista todos os workspaces com info do dono e membros."""
    result = await db.execute(
        select(WorkspaceModel)
        .options(selectinload(WorkspaceModel.owner), selectinload(WorkspaceModel.members))
        .order_by(WorkspaceModel.created_at.desc())
    )
    workspaces = result.scalars().all()
    
    return [
        {
            "id": w.id,
            "name": w.name,
            "slug": w.slug,
            "owner_email": w.owner.email if w.owner else "N/A",
            "member_count": len(w.members),
            "created_at": w.created_at
        }
        for w in workspaces
    ]

@router.patch("/users/{user_id}/toggle-active", summary="Ativar/Desativar usuário")
async def toggle_user_active(
    user_id: int,
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(get_superadmin)
):
    """Ativa ou desativa a conta de um usuário (atalho)."""
    if user_id == admin.id:
        raise HTTPException(status_code=400, detail="Não é possível desativar a própria conta")
        
    result = await db.execute(select(UserModel).where(UserModel.id == user_id))
    user = result.scalar_one_or_none()
    
    if not user:
        raise HTTPException(status_code=404, detail="Usuário não encontrado")
        
    user.is_active = not user.is_active
    await db.commit()
    return {"status": "ok", "is_active": user.is_active}
