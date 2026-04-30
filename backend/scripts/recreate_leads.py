import asyncio
import os
import sys

# Adiciona o diretório raiz ao PYTHONPATH
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.core.database import engine, Base
from app.models.lead import Lead

async def main():
    print("Dropping leads table...")
    async with engine.begin() as conn:
        await conn.run_sync(Lead.__table__.drop, checkfirst=True)
    
    print("Recreating leads table...")
    async with engine.begin() as conn:
        # Create all tables (it will only create the ones that don't exist)
        await conn.run_sync(Base.metadata.create_all)
        
    print("Done!")

if __name__ == "__main__":
    asyncio.run(main())
