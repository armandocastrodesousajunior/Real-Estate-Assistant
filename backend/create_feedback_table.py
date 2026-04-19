"""Script para criar a tabela message_feedbacks no banco de dados."""
import asyncio
from app.core.database import engine, Base
from app.models.feedback import MessageFeedback  # noqa: F401 - registra no metadata


async def create_tables():
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    print("✅ Tabela 'message_feedbacks' criada com sucesso!")


if __name__ == "__main__":
    asyncio.run(create_tables())
