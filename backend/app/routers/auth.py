from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.schemas.auth import LoginRequest, TokenResponse
from app.core.security import verify_password, create_access_token, get_current_user
from app.core.database import get_db
from app.models.user import User
from app.models.workspace import Workspace

router = APIRouter()


@router.post(
    "/login",
    response_model=TokenResponse,
    summary="Login de Usuário",
    description="Autentica com email e senha. Retorna JWT token e lista de workspaces.",
)
async def login(credentials: LoginRequest, db: AsyncSession = Depends(get_db)):
    """
    Realiza login com as credenciais do banco de dados.
    """
    result = await db.execute(select(User).where(User.email == credentials.email))
    user = result.scalar_one_or_none()
    
    if not user or not verify_password(credentials.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Credenciais inválidas",
        )

    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Conta desativada",
        )

    token = create_access_token(
        data={"sub": user.email, "name": user.full_name or user.email}
    )
    
    # Busca workspaces vinculados
    ws_result = await db.execute(
        select(Workspace).where(Workspace.members.any(id=user.id))
    )
    workspaces = ws_result.scalars().all()
    
    return {
        "access_token": token,
        "token_type": "bearer",
        "expires_in": 1440 * 60,
        "user_name": user.full_name or user.email,
        "user_email": user.email,
        "is_superadmin": user.is_superadmin,
        "workspaces": [
            {"id": ws.id, "name": ws.name, "slug": ws.slug} for ws in workspaces
        ]
    }


@router.get(
    "/me",
    summary="Informações do usuário atual",
    description="Retorna os dados do usuário autenticado.",
)
async def me(current_user: User = Depends(get_current_user)):
    return {
        "id": current_user.id,
        "email": current_user.email,
        "full_name": current_user.full_name,
        "is_superadmin": current_user.is_superadmin,
        "openrouter_key_set": bool(current_user.openrouter_key)
    }
