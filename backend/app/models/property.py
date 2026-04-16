from sqlalchemy import Column, Integer, String, Float, Text, DateTime, JSON, Enum as SAEnum, ForeignKey
from sqlalchemy.orm import relationship
from datetime import datetime
import enum
from app.core.database import Base


class PropertyType(str, enum.Enum):
    APARTMENT = "apartamento"
    HOUSE = "casa"
    COMMERCIAL = "comercial"
    LAND = "terreno"
    RURAL = "rural"
    STUDIO = "kitnet_studio"


class PropertyStatus(str, enum.Enum):
    AVAILABLE = "disponivel"
    RESERVED = "reservado"
    SOLD = "vendido"
    RENTED = "alugado"
    INACTIVE = "inativo"


class PropertyPurpose(str, enum.Enum):
    SALE = "venda"
    RENT = "aluguel"
    BOTH = "venda_aluguel"


class Property(Base):
    __tablename__ = "properties"

    id = Column(Integer, primary_key=True, index=True)
    title = Column(String(200), nullable=False, index=True)
    type = Column(SAEnum(PropertyType), nullable=False)
    purpose = Column(SAEnum(PropertyPurpose), default=PropertyPurpose.SALE)
    status = Column(SAEnum(PropertyStatus), default=PropertyStatus.AVAILABLE)

    # Endereço
    address = Column(String(300))
    neighborhood = Column(String(100), index=True)
    city = Column(String(100), index=True)
    state = Column(String(2))
    zip_code = Column(String(10))
    latitude = Column(Float, nullable=True)
    longitude = Column(Float, nullable=True)

    # Características
    area = Column(Float)           # m² total
    built_area = Column(Float, nullable=True)  # m² construído
    bedrooms = Column(Integer, default=0)
    bathrooms = Column(Integer, default=0)
    suites = Column(Integer, default=0)
    parking_spaces = Column(Integer, default=0)
    floor = Column(Integer, nullable=True)
    total_floors = Column(Integer, nullable=True)

    # Valores
    price = Column(Float, nullable=False, index=True)
    rent_price = Column(Float, nullable=True)
    condominium_fee = Column(Float, default=0)
    iptu = Column(Float, default=0)
    price_per_sqm = Column(Float, nullable=True)  # Calculado

    # Conteúdo
    description = Column(Text)
    highlights = Column(Text, nullable=True)  # Destaques rápidos
    tags = Column(JSON, default=list)          # ["piscina", "churrasqueira", ...]
    amenities = Column(JSON, default=list)     # Amenidades do condomínio

    # Mídia
    photos = Column(JSON, default=list)        # Lista de paths/urls
    cover_photo = Column(String(500), nullable=True)
    video_url = Column(String(500), nullable=True)
    virtual_tour_url = Column(String(500), nullable=True)

    # SEO / Busca
    slug = Column(String(250), unique=True, index=True, nullable=True)
    featured = Column(Integer, default=0)      # Imóvel em destaque

    # Meta
    views = Column(Integer, default=0)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # Relacionamentos
    leads = relationship("Lead", back_populates="property", lazy="select")
    
    # Multi-Tenancy
    workspace_id = Column(Integer, ForeignKey("workspaces.id", ondelete="CASCADE"), nullable=False, index=True)
    workspace = relationship("Workspace", back_populates="properties")
