from pydantic import BaseModel, Field


class LoginRequest(BaseModel):
    email: str = Field(..., description="Email do administrador")
    password: str = Field(..., min_length=4, description="Senha")


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    expires_in: int
    user_name: str
    user_email: str


class UserInfo(BaseModel):
    email: str
    name: str
