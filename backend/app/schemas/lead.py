from pydantic import BaseModel, Field
from typing import Optional, List
from datetime import datetime
from app.models.lead import LeadStatus, LeadSource


class LeadBase(BaseModel):
    name: str = Field(..., min_length=2, description="Nome do lead")
    email: Optional[str] = Field(None, description="Email")
    phone: Optional[str] = Field(None, description="Telefone/WhatsApp")
    status: LeadStatus = Field(LeadStatus.NEW, description="Status no funil")
    source: LeadSource = Field(LeadSource.CHAT_AI, description="Origem do lead")
    notes: Optional[str] = Field(None, description="Observações")
    desired_type: Optional[str] = Field(None, description="Tipo de imóvel desejado")
    desired_city: Optional[str] = Field(None, description="Cidade desejada")
    desired_neighborhood: Optional[str] = Field(None, description="Bairro desejado")
    min_price: Optional[int] = Field(None, ge=0, description="Orçamento mínimo")
    max_price: Optional[int] = Field(None, ge=0, description="Orçamento máximo")
    min_bedrooms: Optional[int] = Field(None, ge=0, description="Mínimo de quartos")
    property_id: Optional[int] = Field(None, description="Imóvel de interesse")


class LeadCreate(LeadBase):
    conversation_id: Optional[int] = None


class LeadUpdate(BaseModel):
    name: Optional[str] = None
    email: Optional[str] = None
    phone: Optional[str] = None
    status: Optional[LeadStatus] = None
    notes: Optional[str] = None
    desired_type: Optional[str] = None
    desired_city: Optional[str] = None
    desired_neighborhood: Optional[str] = None
    min_price: Optional[int] = None
    max_price: Optional[int] = None
    property_id: Optional[int] = None


class LeadResponse(LeadBase):
    id: int
    conversation_id: Optional[int] = None
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class LeadListResponse(BaseModel):
    items: List[LeadResponse]
    total: int
    page: int
    page_size: int
