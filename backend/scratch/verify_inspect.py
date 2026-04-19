import asyncio
from sqlalchemy import select
from app.core.database import AsyncSessionLocal
from app.models.agent import Agent
from app.models.tool import Tool, agent_tools
from app.routers.prompts import inspect_assistant_resource

async def check():
    async with AsyncSessionLocal() as db:
        # Pega o primeiro agente do banco
        res = await db.execute(select(Agent).limit(1))
        agent = res.scalar_one_or_none()
        if not agent:
            print("Nenhum agente encontrado.")
            return
        
        print(f"Testando inspeção do agente: {agent.slug} (ID: {agent.id})")
        
        # Chama a função que modifiquei
        result = await inspect_assistant_resource(db, agent.workspace_id, "agent", agent.slug)
        import json
        print(json.dumps(result, indent=2))

if __name__ == "__main__":
    asyncio.run(check())
