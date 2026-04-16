from sqlalchemy import Column, Integer, String, Text, DateTime, ForeignKey, Enum as SAEnum
from sqlalchemy.orm import relationship
from datetime import datetime
import enum
from app.core.database import Base


class LeadStatus(str, enum.Enum):
    NEW = "novo"
    CONTACTED = "contatado"
    QUALIFIED = "qualificado"
    PROPOSAL = "proposta"
    NEGOTIATING = "negociando"
    CLOSED_WON = "fechado_ganho"
    CLOSED_LOST = "fechado_perdido"


class LeadSource(str, enum.Enum):
    WEBSITE = "website"
    CHAT_AI = "chat_ia"
    WHATSAPP = "whatsapp"
    PHONE = "telefone"
    REFERRAL = "indicacao"
    PORTAL = "portal_imovel"
    SOCIAL = "redes_sociais"
    OTHER = "outro"


class Lead(Base):
    __tablename__ = "leads"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(200), nullable=False, index=True)
    email = Column(String(200), nullable=True, index=True)
    phone = Column(String(20), nullable=True)

    status = Column(SAEnum(LeadStatus), default=LeadStatus.NEW)
    source = Column(SAEnum(LeadSource), default=LeadSource.CHAT_AI)

    # Preferências de busca
    notes = Column(Text, nullable=True)
    desired_type = Column(String(50), nullable=True)   # tipo de imóvel desejado
    desired_city = Column(String(100), nullable=True)
    desired_neighborhood = Column(String(100), nullable=True)
    min_price = Column(Integer, nullable=True)
    max_price = Column(Integer, nullable=True)
    min_bedrooms = Column(Integer, nullable=True)

    # Relacionamento com imóvel de interesse
    property_id = Column(Integer, ForeignKey("properties.id"), nullable=True)
    property = relationship("Property", back_populates="leads")

    # Referência à conversa (só o ID — sem relationship para evitar dependência circular)
    conversation_id = Column(Integer, nullable=True)

    # Meta
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # Multi-Tenancy
    workspace_id = Column(Integer, ForeignKey("workspaces.id", ondelete="CASCADE"), nullable=False, index=True)
    workspace = relationship("Workspace", back_populates="leads")
