from pydantic import BaseModel, Field
from typing import List, Optional


class LoginRequest(BaseModel):
    email: str = Field(..., description="Email do usuário")
    password: str = Field(..., min_length=4, description="Senha")


class WorkspaceTiny(BaseModel):
    id: int
    name: str
    slug: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    expires_in: int
    user_name: str
    user_email: str
    is_superadmin: bool = False
    workspaces: List[WorkspaceTiny] = []


class UserInfo(BaseModel):
    email: str
    name: str
