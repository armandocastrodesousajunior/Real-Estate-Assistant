from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from typing import Optional

from app.core.database import get_db
from app.core.security import get_current_user
from app.models.lead import Lead, LeadStatus, LeadSource
from app.schemas.lead import LeadCreate, LeadUpdate, LeadResponse, LeadListResponse

router = APIRouter()


@router.get(
    "/",
    response_model=LeadListResponse,
    summary="Listar leads",
    description="Retorna lista paginada de leads com filtros por status, fonte e busca por nome.",
)
async def list_leads(
    q: Optional[str] = Query(None, description="Busca por nome, email ou telefone"),
    status: Optional[LeadStatus] = Query(None, description="Filtrar por status"),
    source: Optional[LeadSource] = Query(None, description="Filtrar por fonte"),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
    _: dict = Depends(get_current_user),
):
    query = select(Lead)
    if q:
        from sqlalchemy import or_
        query = query.where(
            or_(
                Lead.name.ilike(f"%{q}%"),
                Lead.email.ilike(f"%{q}%"),
                Lead.phone.ilike(f"%{q}%"),
            )
        )
    if status:
        query = query.where(Lead.status == status)
    if source:
        query = query.where(Lead.source == source)

    total_q = select(func.count()).select_from(query.subquery())
    total = (await db.execute(total_q)).scalar() or 0

    offset = (page - 1) * page_size
    result = await db.execute(query.order_by(Lead.created_at.desc()).offset(offset).limit(page_size))

    return LeadListResponse(
        items=[LeadResponse.model_validate(l) for l in result.scalars().all()],
        total=total,
        page=page,
        page_size=page_size,
    )


@router.post(
    "/",
    response_model=LeadResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Criar lead",
    description="Cadastra um novo lead no sistema.",
)
async def create_lead(
    data: LeadCreate,
    db: AsyncSession = Depends(get_db),
    _: dict = Depends(get_current_user),
):
    lead = Lead(**data.model_dump())
    db.add(lead)
    await db.commit()
    await db.refresh(lead)
    return LeadResponse.model_validate(lead)


@router.get(
    "/{lead_id}",
    response_model=LeadResponse,
    summary="Detalhe do lead",
)
async def get_lead(lead_id: int, db: AsyncSession = Depends(get_db), _: dict = Depends(get_current_user)):
    result = await db.execute(select(Lead).where(Lead.id == lead_id))
    lead = result.scalar_one_or_none()
    if not lead:
        raise HTTPException(status_code=404, detail="Lead não encontrado")
    return LeadResponse.model_validate(lead)


@router.put(
    "/{lead_id}",
    response_model=LeadResponse,
    summary="Atualizar lead",
    description="Atualiza dados e status do lead no funil de vendas.",
)
async def update_lead(
    lead_id: int,
    data: LeadUpdate,
    db: AsyncSession = Depends(get_db),
    _: dict = Depends(get_current_user),
):
    result = await db.execute(select(Lead).where(Lead.id == lead_id))
    lead = result.scalar_one_or_none()
    if not lead:
        raise HTTPException(status_code=404, detail="Lead não encontrado")

    for field, value in data.model_dump(exclude_unset=True).items():
        setattr(lead, field, value)

    await db.commit()
    await db.refresh(lead)
    return LeadResponse.model_validate(lead)


@router.delete(
    "/{lead_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Remover lead",
)
async def delete_lead(
    lead_id: int,
    db: AsyncSession = Depends(get_db),
    _: dict = Depends(get_current_user),
):
    result = await db.execute(select(Lead).where(Lead.id == lead_id))
    lead = result.scalar_one_or_none()
    if not lead:
        raise HTTPException(status_code=404, detail="Lead não encontrado")
    await db.delete(lead)
    await db.commit()
