import asyncio
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import create_engine
from app.core.database import AsyncSessionLocal, engine, Base
from app.models.user import User
from app.models.workspace import Workspace
from app.models.agent import Agent
from app.models.prompt import Prompt, DEFAULT_PROMPTS
from app.core.security import get_password_hash
from app.core.config import settings
from loguru import logger

async def seed_saas():
    logger.info("🚀 Iniciando Seed SaaS...")
    
    # Importar todos os modelos aqui garante que o Base.metadata esteja populado
    import app.models.user
    import app.models.workspace
    import app.models.agent
    import app.models.property
    import app.models.lead
    import app.models.conversation
    import app.models.prompt
    import app.models.tool

    # 1. Cria tabelas usando um Motor Síncrono (evita problemas de greenlet com SQLite)
    sync_url = settings.DATABASE_URL.replace("sqlite+aiosqlite:///", "sqlite:///")
    sync_engine = create_engine(sync_url)
    
    try:
        Base.metadata.create_all(bind=sync_engine)
        logger.info("✅ Tabelas criadas (via Sync Engine).")
    finally:
        sync_engine.dispose()

    async with AsyncSessionLocal() as db:
        # 1. Cria Super Admin
        admin_email = settings.ADMIN_EMAIL
        admin_pass = settings.ADMIN_PASSWORD
        
        admin = User(
            email=admin_email,
            full_name=settings.ADMIN_NAME,
            hashed_password=get_password_hash(admin_pass),
            is_superadmin=True,
            workspace_limit=10
        )
        db.add(admin)
        await db.flush()
        logger.info(f"✅ Super Admin criado: {admin_email}")

        # 2. Cria Workspace Padrão
        workspace = Workspace(
            name="Imobiliária Principal",
            slug="imobiliaria-principal",
            owner_id=admin.id
        )
        db.add(workspace)
        await db.flush()
        
        # Vincula admin ao workspace (via tabela associativa)
        from app.models.workspace import workspace_members
        await db.execute(
            workspace_members.insert().values(user_id=admin.id, workspace_id=workspace.id)
        )
        logger.info(f"✅ Workspace padrão criado e vinculado ao admin: {workspace.name}")
        await db.flush()

        # 3. Seed Agentes do Sistema no Workspace
        # Aqui podemos usar a lógica do seed_agents.py original mas adaptada para o workspace_id
        agents_data = [
            {"slug": "property_finder", "name": "Buscador de Imóveis", "emoji": "🏠", "color": "#10B981", "desc": "Especialista em encontrar os melhores imóveis para o perfil do cliente."},
            {"slug": "pricing_analyst", "name": "Avaliador de Preços", "emoji": "📊", "color": "#3B82F6", "desc": "Analista de mercado focado em precificação, ROI e custos imobiliários."},
            {"slug": "customer_service", "name": "Atendimento", "emoji": "👤", "color": "#F59E0B", "desc": "Suporte ao cliente, acolhimento e qualificação inicial de leads."},
            {"slug": "listing_writer", "name": "Redator", "emoji": "✍️", "color": "#8B5CF6", "desc": "Cria descrições persuasivas e anúncios otimizados para imóveis."},
            {"slug": "market_analyst", "name": "Analista de Mercado", "emoji": "🔍", "color": "#EC4899", "desc": "Especialista em tendências macroeconômicas e valorização regional."},
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
            await db.flush()
            
            # Adiciona o prompt default
            if a_data["slug"] in DEFAULT_PROMPTS:
                prompt = Prompt(
                    agent_id=agent.id,
                    system_prompt=DEFAULT_PROMPTS[a_data["slug"]],
                    workspace_id=workspace.id,
                    is_active=True
                )
                db.add(prompt)
        
        await db.commit()
        logger.info("✅ Agentes e Prompts semeados no workspace.")

    logger.info("✨ SaaS Seed finalizado com sucesso!")

if __name__ == "__main__":
    asyncio.run(seed_saas())
