from pydantic_settings import BaseSettings
from typing import Optional


class Settings(BaseSettings):
    # App
    APP_NAME: str = "Real-Estate-Assistant"
    APP_VERSION: str = "1.0.0"
    DEBUG: bool = True

    # Database
    DATABASE_URL: str = "sqlite+aiosqlite:///./database/database.db"

    # JWT
    JWT_SECRET_KEY: str = "rea-super-secret-key-change-in-production"
    JWT_ALGORITHM: str = "HS256"
    JWT_EXPIRE_MINUTES: int = 1440  # 24 horas

    # Admin (single-user)
    ADMIN_EMAIL: str = "admin@realestateassistant.com"
    ADMIN_PASSWORD: str = "rea2024"
    ADMIN_NAME: str = "Administrador"

    # OpenRouter
    OPENROUTER_BASE_URL: str = "https://openrouter.ai/api/v1"
    OPENROUTER_SITE_URL: str = "http://localhost:5173"
    OPENROUTER_SITE_NAME: str = "Real-Estate-Assistant"
    DEFAULT_EMBEDDING_MODEL: str = "openai/text-embedding-3-small"
    
    # --- RLHF & Feedback ---
    DEFAULT_FEEDBACK_LIMIT: int = 15

    # Internal Agents Defaults
    DEFAULT_SUPERVISOR_MODEL: str = "openai/gpt-4o-mini"
    DEFAULT_SUPERVISOR_TEMPERATURE: float = 0.1
    
    DEFAULT_PROMPT_ASSISTANT_MODEL: str = "google/gemini-2.0-flash-exp"
    DEFAULT_PROMPT_ASSISTANT_TEMPERATURE: float = 0.5
    
    DEFAULT_REPAIR_MODEL: str = "openai/gpt-4o-mini"
    DEFAULT_REPAIR_TEMPERATURE: float = 0.1

    # Agents
    MAX_AGENT_HOPS: int = 2

    # Uploads
    UPLOAD_DIR: str = "uploads"
    MAX_UPLOAD_SIZE_MB: int = 10

    class Config:
        env_file = ".env"
        case_sensitive = True
        extra = "ignore"


settings = Settings()
