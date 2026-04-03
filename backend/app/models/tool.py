from sqlalchemy import Column, Integer, String, Text, Boolean, DateTime, Table, ForeignKey
from sqlalchemy.orm import relationship
from datetime import datetime
from app.core.database import Base

# Tabela Associativa M-N entre Agentes e Ferramentas
agent_tools = Table(
    "agent_tools",
    Base.metadata,
    Column("id", Integer, primary_key=True),
    Column("agent_slug", String(50), ForeignKey("agents.slug", ondelete="CASCADE"), index=True),
    Column("tool_slug", String(50), index=True),
)

class Tool(Base):
    __tablename__ = "tools"

    id = Column(Integer, primary_key=True, index=True)
    slug = Column(String(50), unique=True, index=True)
    name = Column(String(100), nullable=False)
    description = Column(Text)
    prompt = Column(Text)
    type = Column(String(20), default="external") # internal/external
    is_active = Column(Boolean, default=True)
    
    # Meta
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
