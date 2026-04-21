from sqlalchemy import Column, Integer, String, Float, Text, Boolean, JSON, ForeignKey, UniqueConstraint
from datetime import datetime
from sqlalchemy import DateTime
from app.core.database import Base
from sqlalchemy.orm import relationship


class Agent(Base):
    __tablename__ = "agents"
    __table_args__ = (
        UniqueConstraint('slug', 'workspace_id', name='uq_agent_slug_workspace'),
    )

    id = Column(Integer, primary_key=True, index=True)
    slug = Column(String(50), index=True)  # ex: "supervisor", "property_finder"
    name = Column(String(100), nullable=False)
    description = Column(Text)
    emoji = Column(String(10), default="🤖")
    color = Column(String(7), default="#F59E0B")         # hex color

    # Modelo OpenRouter
    model = Column(String(100), default="openai/gpt-4o-mini")
    temperature = Column(Float, default=0.7)
    max_tokens = Column(Integer, default=2048)
    top_p = Column(Float, default=1.0)
    frequency_penalty = Column(Float, default=0.0)
    presence_penalty = Column(Float, default=0.0)

    # Controle
    is_active = Column(Boolean, default=True)
    is_system = Column(Boolean, default=True)  # Agentes do sistema não podem ser deletados
    feedback_limit = Column(Integer, default=15) # Quantidade de exemplos RLHF no contexto

    # Estatísticas
    total_calls = Column(Integer, default=0)
    total_tokens_used = Column(Integer, default=0)
    avg_response_time_ms = Column(Float, default=0.0)

    # Meta
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # Multi-Tenancy
    workspace_id = Column(Integer, ForeignKey("workspaces.id", ondelete="CASCADE"), nullable=False, index=True)
    workspace = relationship("Workspace", back_populates="agents")
    prompts = relationship("Prompt", back_populates="agent", cascade="all, delete-orphan")
