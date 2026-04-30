from sqlalchemy import Column, Integer, String, Text, DateTime, ForeignKey, Enum as SAEnum
from sqlalchemy.orm import relationship
from datetime import datetime
import enum
from app.core.database import Base


class LeadStatus(str, enum.Enum):
    NEW = "new"
    CONTACTED = "contacted"
    QUALIFIED = "qualified"
    PROPOSAL = "proposal"
    NEGOTIATING = "negotiating"
    CLOSED = "closed"
    LOST = "lost"


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
    full_name = Column(String(200), nullable=False, index=True)
    phone = Column(String(50), nullable=True)
    email = Column(String(200), nullable=True, index=True)
    
    country = Column(String(100), nullable=True)
    state = Column(String(100), nullable=True)
    city = Column(String(150), nullable=True)
    document = Column(String(50), nullable=True)

    status = Column(SAEnum(LeadStatus), default=LeadStatus.NEW)
    source = Column(SAEnum(LeadSource), default=LeadSource.CHAT_AI)

    notes = Column(Text, nullable=True)

    # Referência à conversa (só o ID — sem relationship para evitar dependência circular)
    conversation_id = Column(Integer, nullable=True)

    # Meta
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # Multi-Tenancy
    workspace_id = Column(Integer, ForeignKey("workspaces.id", ondelete="CASCADE"), nullable=False, index=True)
    workspace = relationship("Workspace", back_populates="leads")
