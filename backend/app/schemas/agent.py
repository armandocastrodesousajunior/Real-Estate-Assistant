from pydantic import BaseModel, Field
from typing import Optional
from datetime import datetime


class AgentResponse(BaseModel):
    id: int
    slug: str
    name: str
    description: Optional[str] = None
    emoji: str
    color: str
    model: str
    temperature: float
    max_tokens: int
    top_p: float
    frequency_penalty: float
    presence_penalty: float
    is_active: bool
    is_system: bool
    total_calls: int
    total_tokens_used: int
    avg_response_time_ms: float
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class AgentUpdate(BaseModel):
    model: Optional[str] = Field(None, description="Modelo OpenRouter (ex: openai/gpt-4o)")
    temperature: Optional[float] = Field(None, ge=0.0, le=2.0, description="Temperatura de geração (0=determinístico, 2=criativo)")
    max_tokens: Optional[int] = Field(None, ge=100, le=128000, description="Máximo de tokens na resposta")
    top_p: Optional[float] = Field(None, ge=0.0, le=1.0)
    frequency_penalty: Optional[float] = Field(None, ge=-2.0, le=2.0)
    presence_penalty: Optional[float] = Field(None, ge=-2.0, le=2.0)
    is_active: Optional[bool] = None
    description: Optional[str] = None


class AgentToggle(BaseModel):
    is_active: bool


class AgentModelUpdate(BaseModel):
    model: str = Field(..., description="Modelo OpenRouter (ex: openai/gpt-4o-mini)")


class OpenRouterModel(BaseModel):
    id: str
    name: str
    description: Optional[str] = None
    context_length: Optional[int] = None
    pricing: Optional[dict] = None
