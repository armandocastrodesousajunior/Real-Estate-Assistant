from sqlalchemy import Column, Integer, String, Float, ForeignKey, DateTime, Table, UniqueConstraint
from sqlalchemy.orm import relationship
from datetime import datetime
from app.core.database import Base

# Association table for Workspace Members
workspace_members = Table(
    "workspace_members",
    Base.metadata,
    Column("user_id", Integer, ForeignKey("users.id", ondelete="CASCADE"), primary_key=True),
    Column("workspace_id", Integer, ForeignKey("workspaces.id", ondelete="CASCADE"), primary_key=True),
)

class Workspace(Base):
    __tablename__ = "workspaces"
    __table_args__ = (
        UniqueConstraint('slug', 'owner_id', name='uq_workspace_slug_owner'),
    )

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(100), nullable=False)
    slug = Column(String(100), index=True)
    api_token = Column(String(64), unique=True, index=True, nullable=True)
    
    # Ownership
    owner_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    
    # Meta
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    # Internal AI Configuration (Overrides .env defaults)
    embedding_model = Column(String(100), nullable=True)
    supervisor_model = Column(String(100), nullable=True)
    supervisor_temperature = Column(Float, nullable=True)
    
    prompt_assistant_model = Column(String(100), nullable=True)
    prompt_assistant_temperature = Column(Float, nullable=True)
    
    repair_model = Column(String(100), nullable=True)
    repair_temperature = Column(Float, nullable=True)

    # Relationships
    owner = relationship("User", back_populates="owned_workspaces")
    members = relationship("User", secondary=workspace_members, back_populates="workspaces")

    # SaaS Resources (Cascaded)
    agents = relationship("Agent", back_populates="workspace", cascade="all, delete-orphan")
    properties = relationship("Property", back_populates="workspace", cascade="all, delete-orphan")
    leads = relationship("Lead", back_populates="workspace", cascade="all, delete-orphan")
    conversations = relationship("Conversation", back_populates="workspace", cascade="all, delete-orphan")
    prompts = relationship("Prompt", back_populates="workspace", cascade="all, delete-orphan")
