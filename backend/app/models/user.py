from sqlalchemy import Column, Integer, String, Boolean, Text, DateTime
from datetime import datetime
from app.core.database import Base
from sqlalchemy.orm import relationship

class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    email = Column(String(255), unique=True, index=True, nullable=False)
    full_name = Column(String(255), nullable=True)
    hashed_password = Column(String(255), nullable=False)
    
    # SaaS Config
    is_superadmin = Column(Boolean, default=False)
    workspace_limit = Column(Integer, default=2)
    openrouter_key = Column(String(255), nullable=True) # User-specific API key
    
    is_active = Column(Boolean, default=True)
    
    # Meta
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # Relationships
    owned_workspaces = relationship("Workspace", back_populates="owner", cascade="all, delete-orphan")
    workspaces = relationship("Workspace", secondary="workspace_members", back_populates="members")
