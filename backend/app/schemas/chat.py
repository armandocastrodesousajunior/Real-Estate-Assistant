from pydantic import BaseModel, Field
from typing import Optional, List, Dict
from datetime import datetime
from app.models.conversation import MessageRole


class ChatMessage(BaseModel):
    role: MessageRole
    content: str


class ChatRequest(BaseModel):
    message: str = Field(..., min_length=1, max_length=4000, description="Mensagem do usuário")
    session_id: Optional[str] = Field(None, description="ID da sessão/conversa (omitir para nova conversa)")
    agent_slug: Optional[str] = Field(None, description="ID do agente para chat direto (omitir para Supervisor)")
    is_test: bool = Field(False, description="Marca se esta conversa foi criada no Playground como teste")
    stream: bool = Field(True, description="Usar streaming SSE")


class ChatResponse(BaseModel):
    session_id: str
    message: str
    agent_slug: str
    agent_name: str
    agent_emoji: str
    tokens_used: int
    model_used: str


class MessageResponse(BaseModel):
    id: int
    role: MessageRole
    content: str
    agent_slug: Optional[str] = None
    agent_name: Optional[str] = None
    agent_emoji: Optional[str] = None
    tokens_used: int = 0
    model_used: Optional[str] = None
    metadata_: Optional[dict] = None
    created_at: datetime

    class Config:
        from_attributes = True


class ConversationResponse(BaseModel):
    id: int
    session_id: str
    title: Optional[str] = None
    last_agent_slug: Optional[str] = None
    message_count: int
    total_tokens: int
    is_test: bool = False
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class ConversationDetailResponse(ConversationResponse):
    messages: List[MessageResponse] = []


class PromptSchema(BaseModel):
    id: int
    agent_slug: str
    version: int
    is_active: bool
    system_prompt: str
    user_prompt_template: Optional[str] = None
    notes: Optional[str] = None
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class PromptUpdate(BaseModel):
    system_prompt: str = Field(..., min_length=10, description="System prompt do agente")
    user_prompt_template: Optional[str] = None
    notes: Optional[str] = None


class PromptTest(BaseModel):
    system_prompt: str = Field(..., description="Prompt a ser testado")
    user_message: str = Field(..., min_length=1, description="Mensagem de teste")
    model: Optional[str] = Field(None, description="Modelo a usar (padrão: do agente)")

class PromptAssistantMessage(BaseModel):
    role: str
    content: str
                                 
class PromptAssistantRequest(BaseModel):
    message: str = Field(..., description="Mensagem do usuário")
    history: List[PromptAssistantMessage] = Field(default_factory=list, description="Histórico da conversa no assistente")
    current_prompt: Optional[str] = Field(None, description="Prompt atualmente editado no frontend, se houver")
    chat_context: Optional[Dict] = Field(None, description="Contexto do chat (histórico e logs) que gerou o bug selecionado.")
