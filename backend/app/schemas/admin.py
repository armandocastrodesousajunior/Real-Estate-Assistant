from pydantic import BaseModel, EmailStr, Field
from typing import Optional
from datetime import datetime

class AdminUserBase(BaseModel):
    email: EmailStr
    full_name: Optional[str] = None
    is_active: bool = True
    is_superadmin: bool = False
    workspace_limit: int = 2

class AdminUserCreate(AdminUserBase):
    password: str = Field(..., min_length=4)

class AdminUserUpdate(BaseModel):
    email: Optional[EmailStr] = None
    full_name: Optional[str] = None
    password: Optional[str] = None
    is_active: Optional[bool] = None
    is_superadmin: Optional[bool] = None
    workspace_limit: Optional[int] = None

class AdminUserResponse(AdminUserBase):
    id: int
    created_at: datetime
    workspace_count: int

    class Config:
        from_attributes = True

class GlobalStats(BaseModel):
    total_users: int
    total_workspaces: int
    current_user_id: int
