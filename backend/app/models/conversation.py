from sqlalchemy import Column, Integer, String, Text, DateTime, JSON, Enum as SAEnum, ForeignKey, Boolean
from sqlalchemy.orm import relationship
from datetime import datetime
import enum
from app.core.database import Base


class MessageRole(str, enum.Enum):
    USER = "user"
    ASSISTANT = "assistant"
    SYSTEM = "system"


class Conversation(Base):
    __tablename__ = "conversations"

    id = Column(Integer, primary_key=True, index=True)
    title = Column(String(200), nullable=True)
    session_id = Column(String(100), unique=True, index=True)
    is_test = Column(Boolean, default=False, nullable=False, server_default="0")

    # Qual agente respondeu por último
    last_agent_slug = Column(String(50), nullable=True)

    # Estatísticas
    message_count = Column(Integer, default=0)
    total_tokens = Column(Integer, default=0)

    # Meta
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    messages = relationship(
        "Message",
        back_populates="conversation",
        order_by="Message.created_at",
        lazy="select",
    )


class Message(Base):
    __tablename__ = "messages"

    id = Column(Integer, primary_key=True, index=True)
    conversation_id = Column(Integer, ForeignKey("conversations.id"), index=True)
    role = Column(SAEnum(MessageRole), nullable=False)
    content = Column(Text, nullable=False)
    agent_slug = Column(String(50), nullable=True)    # Qual agente gerou
    agent_name = Column(String(100), nullable=True)
    agent_emoji = Column(String(10), nullable=True)
    tokens_used = Column(Integer, default=0)
    model_used = Column(String(100), nullable=True)
    metadata_ = Column("metadata", JSON, default=dict)  # Extra info

    created_at = Column(DateTime, default=datetime.utcnow)

    conversation = relationship("Conversation", back_populates="messages")
