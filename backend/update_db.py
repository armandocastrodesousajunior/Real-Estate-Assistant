import asyncio
from app.core.database import AsyncSessionLocal
from app.models.prompt import Prompt, DEFAULT_PROMPTS
from sqlalchemy import select

async def update_prompts():
    async with AsyncSessionLocal() as db:
        for slug, text in DEFAULT_PROMPTS.items():
            result = await db.execute(select(Prompt).where(Prompt.agent_slug == slug))
            prompt = result.scalar_one_or_none()
            if prompt:
                prompt.system_prompt = text
            else:
                db.add(Prompt(agent_slug=slug, system_prompt=text, version=1, is_active=True))
        await db.commit()
    print('Prompts atualizados no banco de dados com sucesso!')

if __name__ == "__main__":
    asyncio.run(update_prompts())
