from pydantic import BaseModel, Field, validator
from typing import Optional, List
from datetime import datetime
from app.models.property import PropertyType, PropertyStatus, PropertyPurpose


class PropertyBase(BaseModel):
    title: str = Field(..., min_length=3, max_length=200, description="Título do imóvel")
    type: PropertyType = Field(..., description="Tipo do imóvel")
    purpose: PropertyPurpose = Field(PropertyPurpose.SALE, description="Finalidade")
    status: PropertyStatus = Field(PropertyStatus.AVAILABLE, description="Status")

    # Endereço
    address: Optional[str] = Field(None, description="Endereço completo")
    neighborhood: Optional[str] = Field(None, description="Bairro")
    city: Optional[str] = Field(None, description="Cidade")
    state: Optional[str] = Field(None, max_length=2, description="UF (ex: SP)")
    zip_code: Optional[str] = Field(None, description="CEP")
    latitude: Optional[float] = None
    longitude: Optional[float] = None

    # Características
    area: Optional[float] = Field(None, gt=0, description="Área total em m²")
    built_area: Optional[float] = Field(None, description="Área construída em m²")
    bedrooms: int = Field(0, ge=0, description="Número de quartos")
    bathrooms: int = Field(0, ge=0, description="Número de banheiros")
    suites: int = Field(0, ge=0, description="Número de suítes")
    parking_spaces: int = Field(0, ge=0, description="Vagas de garagem")
    floor: Optional[int] = Field(None, description="Andar (apartamentos)")
    total_floors: Optional[int] = Field(None, description="Total de andares")

    # Valores
    price: float = Field(..., gt=0, description="Preço de venda/aluguel em R$")
    rent_price: Optional[float] = Field(None, gt=0, description="Valor do aluguel mensal")
    condominium_fee: float = Field(0, ge=0, description="Taxa de condomínio mensal")
    iptu: float = Field(0, ge=0, description="IPTU anual em R$")

    # Conteúdo
    description: Optional[str] = Field(None, description="Descrição detalhada")
    highlights: Optional[str] = Field(None, description="Destaques rápidos")
    tags: List[str] = Field(default_factory=list, description="Tags (ex: piscina, reformado)")
    amenities: List[str] = Field(default_factory=list, description="Amenidades do condomínio")

    # Mídia
    video_url: Optional[str] = None
    virtual_tour_url: Optional[str] = None
    featured: bool = Field(False, description="Imóvel em destaque")


class PropertyCreate(PropertyBase):
    pass


class PropertyUpdate(BaseModel):
    title: Optional[str] = None
    type: Optional[PropertyType] = None
    purpose: Optional[PropertyPurpose] = None
    status: Optional[PropertyStatus] = None
    address: Optional[str] = None
    neighborhood: Optional[str] = None
    city: Optional[str] = None
    state: Optional[str] = None
    zip_code: Optional[str] = None
    area: Optional[float] = None
    built_area: Optional[float] = None
    bedrooms: Optional[int] = None
    bathrooms: Optional[int] = None
    suites: Optional[int] = None
    parking_spaces: Optional[int] = None
    price: Optional[float] = None
    rent_price: Optional[float] = None
    condominium_fee: Optional[float] = None
    iptu: Optional[float] = None
    description: Optional[str] = None
    highlights: Optional[str] = None
    tags: Optional[List[str]] = None
    amenities: Optional[List[str]] = None
    status: Optional[PropertyStatus] = None
    featured: Optional[bool] = None


class PropertyResponse(PropertyBase):
    id: int
    slug: Optional[str] = None
    photos: List[str] = []
    cover_photo: Optional[str] = None
    price_per_sqm: Optional[float] = None
    views: int = 0
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class PropertyListResponse(BaseModel):
    items: List[PropertyResponse]
    total: int
    page: int
    page_size: int
    total_pages: int


class PropertySearchParams(BaseModel):
    q: Optional[str] = None
    type: Optional[PropertyType] = None
    purpose: Optional[PropertyPurpose] = None
    status: Optional[PropertyStatus] = None
    city: Optional[str] = None
    neighborhood: Optional[str] = None
    min_price: Optional[float] = None
    max_price: Optional[float] = None
    min_area: Optional[float] = None
    max_area: Optional[float] = None
    min_bedrooms: Optional[int] = None
    featured: Optional[bool] = None
    page: int = Field(1, ge=1)
    page_size: int = Field(12, ge=1, le=100)
