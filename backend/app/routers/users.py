from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from pydantic import BaseModel, EmailStr
from typing import Optional

from app.core.database import get_db
from app.core.security import get_current_user
from app.models.user import User

router = APIRouter()

class UserProfileResponse(BaseModel):
    id: int
    email: EmailStr
    full_name: str
    is_active: bool
    is_superadmin: bool
    openrouter_key: Optional[str] = None

    class Config:
        from_attributes = True

class UserProfileUpdate(BaseModel):
    full_name: Optional[str] = None
    openrouter_key: Optional[str] = None

@router.get("/me", response_model=UserProfileResponse)
async def get_my_profile(current_user: User = Depends(get_current_user)):
    """Retorna os dados do usuário logado."""
    return current_user

@router.put("/me", response_model=UserProfileResponse)
async def update_my_profile(
    data: UserProfileUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Atualiza dados do perfil, como nome e chave OpenRouter."""
    if data.full_name is not None:
        current_user.full_name = data.full_name
    
    if data.openrouter_key is not None:
        current_user.openrouter_key = data.openrouter_key
    
    await db.commit()
    await db.refresh(current_user)
    return current_user
