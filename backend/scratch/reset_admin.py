import asyncio
import sys
import os

# Adiciona o diretório atual ao path
sys.path.append(os.getcwd())

from app.core.database import AsyncSessionLocal, engine, Base
from app.models.user import User
from app.models.workspace import Workspace
from app.core.security import get_password_hash
from app.core.config import settings
from sqlalchemy import select, create_engine

async def main():
    print("Iniciando Seed de Teste...")
    
    # Motor síncrono para garantir tabelas
    # sync_url = settings.DATABASE_URL.replace("sqlite+aiosqlite:///", "sqlite:///")
    # sync_engine = create_engine(sync_url)
    # Base.metadata.create_all(bind=sync_engine)
    
    async with AsyncSessionLocal() as db:
        # Verifica se admin existe
        res = await db.execute(select(User).where(User.email == "admin@realestateassistant.com"))
        admin = res.scalar_one_or_none()
        
        if admin:
            print("Admin ja existe. Atualizando senha para 'rea2024'...")
            admin.hashed_password = get_password_hash("rea2024")
            admin.is_superadmin = True
            admin.workspace_limit = 10
        else:
            print("Criando admin@realestateassistant.com...")
            admin = User(
                email="admin@realestateassistant.com",
                full_name="Administrador",
                hashed_password=get_password_hash("rea2024"),
                is_superadmin=True,
                workspace_limit=10
            )
            db.add(admin)
        
        await db.commit()
        print("OK: Admin configurado com sucesso!")

if __name__ == "__main__":
    asyncio.run(main())
