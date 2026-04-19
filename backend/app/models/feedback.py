from sqlalchemy import Column, Integer, String, Text, DateTime, Boolean, ForeignKey
from datetime import datetime
from app.core.database import Base


class MessageFeedback(Base):
    __tablename__ = "message_feedbacks"

    id = Column(Integer, primary_key=True, index=True)

    # Multi-Tenancy
    workspace_id = Column(Integer, ForeignKey("workspaces.id", ondelete="CASCADE"), nullable=False, index=True)

    # Contexto do Agente
    agent_slug   = Column(String(50), nullable=False, index=True)

    # O par de preferência (o que foi dito e o que foi respondido)
    user_message = Column(Text, nullable=False)
    ai_response  = Column(Text, nullable=False)

    # Avaliação do usuário
    rating       = Column(String(10), nullable=False)   # "positive" | "negative"
    correction   = Column(Text, nullable=True)          # Apenas nos negativos: como deveria ter respondido

    # Metadados de rastreamento
    model_used   = Column(String(100), nullable=True)
    session_id   = Column(String(100), nullable=True)

    # Status de processamento no ciclo de treinamento
    is_processed = Column(Boolean, default=False, nullable=False)

    created_at   = Column(DateTime, default=datetime.utcnow)
