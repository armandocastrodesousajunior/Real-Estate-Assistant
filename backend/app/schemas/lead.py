from pydantic import BaseModel, Field
from typing import Optional, List
from datetime import datetime
from app.models.lead import LeadStatus, LeadSource


class LeadBase(BaseModel):
    full_name: str = Field(..., min_length=2, description="Nome completo do lead")
    phone: Optional[str] = Field(None, description="Telefone/WhatsApp")
    email: Optional[str] = Field(None, description="Email")
    country: Optional[str] = Field(None, description="País")
    state: Optional[str] = Field(None, description="Estado (UF)")
    city: Optional[str] = Field(None, description="Cidade")
    document: Optional[str] = Field(None, description="CPF ou CNPJ")
    
    status: LeadStatus = Field(LeadStatus.NEW, description="Status no funil")
    source: LeadSource = Field(LeadSource.CHAT_AI, description="Origem do lead")
    notes: Optional[str] = Field(None, description="Observações")


class LeadCreate(LeadBase):
    conversation_id: Optional[int] = None
    workspace_id: Optional[int] = None # Para criação interna/pública


class LeadUpdate(BaseModel):
    full_name: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[str] = None
    country: Optional[str] = None
    state: Optional[str] = None
    city: Optional[str] = None
    document: Optional[str] = None
    status: Optional[LeadStatus] = None
    source: Optional[LeadSource] = None
    notes: Optional[str] = None
    conversation_id: Optional[int] = None


class LeadResponse(LeadBase):
    id: int
    conversation_id: Optional[int] = None
    workspace_id: int
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class LeadListResponse(BaseModel):
    items: List[LeadResponse]
    total: int
    page: int
    page_size: int
