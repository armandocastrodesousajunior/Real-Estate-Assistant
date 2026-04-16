import asyncio
from sqlalchemy import create_engine, select, Table
from sqlalchemy.orm import sessionmaker, Session
from app.core.database import Base
from app.models.user import User
from app.models.workspace import Workspace
from app.models.agent import Agent
from app.models.prompt import Prompt, DEFAULT_PROMPTS
from app.core.security import get_password_hash
from app.core.config import settings
from loguru import logger

def seed_saas_sync():
    logger.info("🚀 Iniciando Seed SaaS (Síncrono)...")
    
    # Importar todos os modelos para registro no metadata
    import app.models.user
    import app.models.workspace
    import app.models.agent
    import app.models.property
    import app.models.lead
    import app.models.conversation
    import app.models.prompt
    import app.models.tool

    # URL Síncrona para SQLite
    sync_url = settings.DATABASE_URL.replace("sqlite+aiosqlite:///", "sqlite:///")
    engine = create_engine(sync_url)
    
    # 1. Cria tabelas
    Base.metadata.create_all(bind=engine)
    logger.info("✅ Tabelas criadas.")

    SessionLocal = sessionmaker(bind=engine)
    with SessionLocal() as db:
        # 1. Cria Super Admin
        admin_email = settings.ADMIN_EMAIL
        admin_pass = settings.ADMIN_PASSWORD
        
        # Verifica se já existe
        existing = db.execute(select(User).where(User.email == admin_email)).scalar_one_or_none()
        if existing:
            logger.warning(f"⚠️ Admin {admin_email} já existe. Pulando.")
            return

        admin = User(
            email=admin_email,
            full_name=settings.ADMIN_NAME,
            hashed_password=get_password_hash(admin_pass),
            is_superadmin=True,
            workspace_limit=10,
            openrouter_key=settings.OPENROUTER_API_KEY
        )
        db.add(admin)
        db.flush()
        logger.info(f"✅ Super Admin criado: {admin_email}")

        # 2. Cria Workspace Padrão
        workspace = Workspace(
            name="Imobiliária Principal",
            slug="imobiliaria-principal",
            owner_id=admin.id
        )
        db.add(workspace)
        db.flush()
        
        # Vincula admin ao workspace (Relationship many-to-many)
        workspace.members.append(admin)
        logger.info(f"✅ Workspace padrão criado: {workspace.name}")

        # 3. Seed Agentes
        agents_data = [
            {"slug": "property_finder", "name": "Buscador de Imóveis", "emoji": "🏠", "color": "#10B981", "desc": "Especialista em encontrar os melhores imóveis."},
            {"slug": "pricing_analyst", "name": "Avaliador de Preços", "emoji": "📊", "color": "#3B82F6", "desc": "Analista de precificação e ROI."},
            {"slug": "customer_service", "name": "Atendimento", "emoji": "👤", "color": "#F59E0B", "desc": "Suporte e qualificação de leads."},
            {"slug": "listing_writer", "name": "Redator", "emoji": "✍️", "color": "#8B5CF6", "desc": "Cria descrições de anúncios."},
            {"slug": "market_analyst", "name": "Analista de Mercado", "emoji": "🔍", "color": "#EC4899", "desc": "Tendências e valorização."},
        ]

        for a_data in agents_data:
            agent = Agent(
                slug=a_data["slug"],
                name=a_data["name"],
                emoji=a_data["emoji"],
                color=a_data["color"],
                description=a_data["desc"],
                workspace_id=workspace.id,
                is_system=True
            )
            db.add(agent)
            db.flush()
            
            if a_data["slug"] in DEFAULT_PROMPTS:
                prompt = Prompt(
                    agent_slug=a_data["slug"],
                    system_prompt=DEFAULT_PROMPTS[a_data["slug"]],
                    workspace_id=workspace.id,
                    is_active=True
                )
                db.add(prompt)
        
        db.commit()
        logger.info("✅ Agentes e Prompts semeados.")

    logger.info("✨ SaaS Seed finalizado com sucesso!")

if __name__ == "__main__":
    seed_saas_sync()
