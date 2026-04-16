import os
import uuid
import aiofiles
from typing import Optional, List
from fastapi import APIRouter, Depends, HTTPException, status, Query, UploadFile, File
from fastapi.responses import JSONResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, or_
from sqlalchemy.orm import selectinload

from app.core.database import get_db
from app.core.security import get_current_user, get_current_workspace
from app.core.config import settings
from app.models.user import User
from app.models.workspace import Workspace
from app.models.property import Property, PropertyType, PropertyStatus, PropertyPurpose
from app.schemas.property import (
    PropertyCreate, PropertyUpdate, PropertyResponse,
    PropertyListResponse, PropertySearchParams
)
from loguru import logger

router = APIRouter()


def generate_slug(title: str, property_id: int) -> str:
    slug = title.lower()
    for char in " àáâãäåèéêëìíîïòóôõöùúûü":
        slug = slug.replace(char, "-")
    slug = "".join(c for c in slug if c.isalnum() or c == "-")
    slug = slug.strip("-")
    return f"{slug}-{property_id}"


@router.get(
    "/",
    response_model=PropertyListResponse,
    summary="Listar imóveis",
    description="Retorna lista paginada de imóveis com filtros avançados.",
)
async def list_properties(
    q: Optional[str] = Query(None, description="Busca por texto no título, bairro ou cidade"),
    type: Optional[PropertyType] = Query(None, description="Tipo do imóvel"),
    purpose: Optional[PropertyPurpose] = Query(None, description="Finalidade"),
    status: Optional[PropertyStatus] = Query(None, description="Status"),
    city: Optional[str] = Query(None, description="Cidade"),
    neighborhood: Optional[str] = Query(None, description="Bairro"),
    min_price: Optional[float] = Query(None, description="Preço mínimo"),
    max_price: Optional[float] = Query(None, description="Preço máximo"),
    min_area: Optional[float] = Query(None, description="Área mínima em m²"),
    max_area: Optional[float] = Query(None, description="Área máxima em m²"),
    min_bedrooms: Optional[int] = Query(None, description="Mínimo de quartos"),
    featured: Optional[bool] = Query(None, description="Apenas destaques"),
    page: int = Query(1, ge=1, description="Página"),
    page_size: int = Query(12, ge=1, le=100, description="Itens por página"),
    db: AsyncSession = Depends(get_db),
    workspace: Workspace = Depends(get_current_workspace)
):
    query = select(Property).where(Property.workspace_id == workspace.id)

    if q:
        query = query.where(
            or_(
                Property.title.ilike(f"%{q}%"),
                Property.neighborhood.ilike(f"%{q}%"),
                Property.city.ilike(f"%{q}%"),
                Property.description.ilike(f"%{q}%"),
            )
        )
    if type:
        query = query.where(Property.type == type)
    if purpose:
        query = query.where(Property.purpose == purpose)
    if status:
        query = query.where(Property.status == status)
    if city:
        query = query.where(Property.city.ilike(f"%{city}%"))
    if neighborhood:
        query = query.where(Property.neighborhood.ilike(f"%{neighborhood}%"))
    if min_price is not None:
        query = query.where(Property.price >= min_price)
    if max_price is not None:
        query = query.where(Property.price <= max_price)
    if min_area is not None:
        query = query.where(Property.area >= min_area)
    if max_area is not None:
        query = query.where(Property.area <= max_area)
    if min_bedrooms is not None:
        query = query.where(Property.bedrooms >= min_bedrooms)
    if featured is not None:
        query = query.where(Property.featured == (1 if featured else 0))

    # Count total
    count_query = select(func.count()).select_from(query.subquery())
    total_result = await db.execute(count_query)
    total = total_result.scalar() or 0

    # Paginação
    offset = (page - 1) * page_size
    query = query.order_by(Property.featured.desc(), Property.created_at.desc())
    query = query.offset(offset).limit(page_size)

    result = await db.execute(query)
    properties = result.scalars().all()

    return PropertyListResponse(
        items=[PropertyResponse.model_validate(p) for p in properties],
        total=total,
        page=page,
        page_size=page_size,
        total_pages=(total + page_size - 1) // page_size,
    )


@router.post(
    "/",
    response_model=PropertyResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Criar imóvel",
    description="Cadastra um novo imóvel no sistema.",
)
async def create_property(
    data: PropertyCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    workspace: Workspace = Depends(get_current_workspace)
):
    prop = Property(**data.model_dump(), workspace_id=workspace.id)

    # Calcula preço por m²
    if prop.area and prop.area > 0:
        prop.price_per_sqm = round(prop.price / prop.area, 2)

    db.add(prop)
    await db.flush()  # Obtém o ID

    # Gera slug
    prop.slug = generate_slug(prop.title, prop.id)
    await db.commit()
    await db.refresh(prop)
    return PropertyResponse.model_validate(prop)


@router.get(
    "/{property_id}",
    response_model=PropertyResponse,
    summary="Detalhe do imóvel",
    description="Retorna os dados completos de um imóvel.",
)
async def get_property(
    property_id: int, 
    db: AsyncSession = Depends(get_db),
    workspace: Workspace = Depends(get_current_workspace)
):
    result = await db.execute(
        select(Property).where(Property.id == property_id, Property.workspace_id == workspace.id)
    )
    prop = result.scalar_one_or_none()
    if not prop:
        raise HTTPException(status_code=404, detail="Imóvel não encontrado ou acesso negado")
    # Incrementa views
    prop.views += 1
    await db.commit()
    return PropertyResponse.model_validate(prop)


@router.put(
    "/{property_id}",
    response_model=PropertyResponse,
    summary="Atualizar imóvel",
    description="Atualiza os dados de um imóvel existente.",
)
async def update_property(
    property_id: int,
    data: PropertyUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    workspace: Workspace = Depends(get_current_workspace)
):
    result = await db.execute(
        select(Property).where(Property.id == property_id, Property.workspace_id == workspace.id)
    )
    prop = result.scalar_one_or_none()
    if not prop:
        raise HTTPException(status_code=404, detail="Imóvel não encontrado ou acesso negado")

    update_data = data.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(prop, field, value)

    # Recalcula preço por m²
    if prop.area and prop.area > 0:
        prop.price_per_sqm = round(prop.price / prop.area, 2)

    await db.commit()
    await db.refresh(prop)
    return PropertyResponse.model_validate(prop)


@router.delete(
    "/{property_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Remover imóvel",
    description="Remove um imóvel do sistema. As fotos também são excluídas.",
)
async def delete_property(
    property_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    workspace: Workspace = Depends(get_current_workspace)
):
    result = await db.execute(
        select(Property).where(Property.id == property_id, Property.workspace_id == workspace.id)
    )
    prop = result.scalar_one_or_none()
    if not prop:
        raise HTTPException(status_code=404, detail="Imóvel não encontrado ou acesso negado")

    # Remove fotos do disco
    for photo_path in (prop.photos or []):
        full_path = os.path.join(settings.UPLOAD_DIR, photo_path.lstrip("/uploads/"))
        if os.path.exists(full_path):
            os.remove(full_path)

    await db.delete(prop)
    await db.commit()


@router.post(
    "/{property_id}/photos",
    response_model=PropertyResponse,
    summary="Upload de fotos",
    description="Faz upload de fotos para o imóvel. Aceita múltiplos arquivos (JPG, PNG, WEBP). Máximo 10MB por arquivo.",
)
async def upload_photos(
    property_id: int,
    files: List[UploadFile] = File(..., description="Fotos do imóvel (JPG, PNG, WEBP)"),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    workspace: Workspace = Depends(get_current_workspace)
):
    result = await db.execute(
        select(Property).where(Property.id == property_id, Property.workspace_id == workspace.id)
    )
    prop = result.scalar_one_or_none()
    if not prop:
        raise HTTPException(status_code=404, detail="Imóvel não encontrado ou acesso negado")

    max_size = settings.MAX_UPLOAD_SIZE_MB * 1024 * 1024
    allowed_types = {"image/jpeg", "image/jpg", "image/png", "image/webp"}
    upload_dir = os.path.join(settings.UPLOAD_DIR, "properties", str(property_id))
    os.makedirs(upload_dir, exist_ok=True)

    new_photos = list(prop.photos or [])
    for file in files:
        if file.content_type not in allowed_types:
            raise HTTPException(status_code=400, detail=f"Tipo de arquivo não aceito: {file.content_type}")

        content = await file.read()
        if len(content) > max_size:
            raise HTTPException(status_code=400, detail=f"Arquivo muito grande: {file.filename}")

        ext = file.filename.rsplit(".", 1)[-1].lower()
        filename = f"{uuid.uuid4().hex}.{ext}"
        filepath = os.path.join(upload_dir, filename)

        async with aiofiles.open(filepath, "wb") as f:
            await f.write(content)

        photo_url = f"/uploads/properties/{property_id}/{filename}"
        new_photos.append(photo_url)

    prop.photos = new_photos
    if not prop.cover_photo and new_photos:
        prop.cover_photo = new_photos[0]

    await db.commit()
    await db.refresh(prop)
    return PropertyResponse.model_validate(prop)


@router.delete(
    "/{property_id}/photos/{photo_index}",
    response_model=PropertyResponse,
    summary="Remover foto",
    description="Remove uma foto específica do imóvel pelo índice (0 = primeira foto).",
)
async def delete_photo(
    property_id: int,
    photo_index: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    workspace: Workspace = Depends(get_current_workspace)
):
    result = await db.execute(
        select(Property).where(Property.id == property_id, Property.workspace_id == workspace.id)
    )
    prop = result.scalar_one_or_none()
    if not prop:
        raise HTTPException(status_code=404, detail="Imóvel não encontrado ou acesso negado")

    photos = list(prop.photos or [])
    if photo_index < 0 or photo_index >= len(photos):
        raise HTTPException(status_code=400, detail="Índice de foto inválido")

    photo_path = photos.pop(photo_index)
    # Remove do disco
    full_path = photo_path.replace("/uploads/", settings.UPLOAD_DIR + "/")
    if os.path.exists(full_path):
        os.remove(full_path)

    prop.photos = photos
    if prop.cover_photo == photo_path:
        prop.cover_photo = photos[0] if photos else None

    await db.commit()
    await db.refresh(prop)
    return PropertyResponse.model_validate(prop)
