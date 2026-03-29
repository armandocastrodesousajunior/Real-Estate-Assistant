from fastapi import APIRouter, Depends, HTTPException, status
from app.schemas.auth import LoginRequest, TokenResponse
from app.core.security import verify_password, create_access_token, get_current_user, get_password_hash
from app.core.config import settings

router = APIRouter()

# Hash calculado lazy (evita erro de bcrypt na inicialização do módulo)
_admin_hash: str | None = None

def get_admin_hash() -> str:
    global _admin_hash
    if _admin_hash is None:
        _admin_hash = get_password_hash(settings.ADMIN_PASSWORD)
    return _admin_hash


@router.post(
    "/login",
    response_model=TokenResponse,
    summary="Login do Administrador",
    description="Autentica com email e senha. Retorna JWT token válido por 24 horas.",
)
async def login(credentials: LoginRequest):
    """
    Realiza login com as credenciais do administrador configuradas no `.env`.

    - Email padrão: `admin@realestateassistant.com`
    - Senha padrão: `rea2024`

    Configure `ADMIN_EMAIL` e `ADMIN_PASSWORD` no arquivo `.env` para mudar.
    """
    if credentials.email != settings.ADMIN_EMAIL:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Credenciais inválidas",
        )
    if not verify_password(credentials.password, get_admin_hash()):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Credenciais inválidas",
        )

    token = create_access_token(
        data={"sub": settings.ADMIN_EMAIL, "name": settings.ADMIN_NAME}
    )
    return TokenResponse(
        access_token=token,
        expires_in=settings.JWT_EXPIRE_MINUTES * 60,
        user_name=settings.ADMIN_NAME,
        user_email=settings.ADMIN_EMAIL,
    )


@router.get(
    "/me",
    summary="Informações do usuário atual",
    description="Retorna os dados do usuário autenticado.",
)
async def me(current_user: dict = Depends(get_current_user)):
    return current_user
