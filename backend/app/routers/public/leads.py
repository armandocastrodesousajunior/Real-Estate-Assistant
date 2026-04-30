from fastapi import APIRouter, Depends, HTTPException, Security, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.core.database import get_db
from app.core.security import get_workspace_by_api_token
from app.models.workspace import Workspace
from app.models.lead import Lead
from app.schemas.lead import LeadCreate, LeadUpdate, LeadResponse, LeadListResponse
from fastapi import Query

router = APIRouter()


@router.get(
    "/",
    response_model=LeadListResponse,
    summary="Listar Leads",
    description="Retorna uma lista paginada de todos os leads associados ao workspace.",
)
async def list_leads(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
    workspace: Workspace = Security(get_workspace_by_api_token)
):
    from sqlalchemy import func
    query = select(Lead).where(Lead.workspace_id == workspace.id)
    
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
    summary="Criar Lead",
    description="Cria um novo lead no funil de vendas. Pode ser opcionalmente associado a uma sessão de conversa informando o `conversation_id`.",
)
async def create_lead(
    data: LeadCreate,
    db: AsyncSession = Depends(get_db),
    workspace: Workspace = Security(get_workspace_by_api_token)
):
    lead_data = data.model_dump()
    lead_data["workspace_id"] = workspace.id
    
    lead = Lead(**lead_data)
    db.add(lead)
    await db.commit()
    await db.refresh(lead)
    
    return LeadResponse.model_validate(lead)


@router.get(
    "/{lead_id}",
    response_model=LeadResponse,
    summary="Consultar Lead",
    description="Retorna os detalhes de um lead específico pelo seu ID.",
)
async def get_lead(
    lead_id: int,
    db: AsyncSession = Depends(get_db),
    workspace: Workspace = Security(get_workspace_by_api_token)
):
    result = await db.execute(
        select(Lead).where(Lead.id == lead_id, Lead.workspace_id == workspace.id)
    )
    lead = result.scalar_one_or_none()
    if not lead:
        raise HTTPException(status_code=404, detail="Lead não encontrado.")
    return LeadResponse.model_validate(lead)


@router.put(
    "/{lead_id}",
    response_model=LeadResponse,
    summary="Atualizar Lead",
    description="Atualiza parcialmente ou integralmente os dados de um lead existente.",
)
async def update_lead(
    lead_id: int,
    data: LeadUpdate,
    db: AsyncSession = Depends(get_db),
    workspace: Workspace = Security(get_workspace_by_api_token)
):
    result = await db.execute(
        select(Lead).where(Lead.id == lead_id, Lead.workspace_id == workspace.id)
    )
    lead = result.scalar_one_or_none()
    if not lead:
        raise HTTPException(status_code=404, detail="Lead não encontrado.")
    
    for field, value in data.model_dump(exclude_unset=True).items():
        setattr(lead, field, value)
        
    await db.commit()
    await db.refresh(lead)
    return LeadResponse.model_validate(lead)
