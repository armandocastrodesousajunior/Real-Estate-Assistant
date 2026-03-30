import asyncio
import os
import sys

# Garante que o diretório atual está no path
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from sqlalchemy import select
from app.core.database import AsyncSessionLocal
from app.models.agent import Agent
from app.models.prompt import Prompt, DEFAULT_PROMPTS

# Dados dos agentes especialistas (o Supervisor é INTENO e não vai pro banco)
AGENT_SEED_DATA = [
    {
        "slug": "property_finder",
        "name": "Buscador de Imóveis",
        "description": "Especializado em encontrar e apresentar imóveis que atendam às necessidades do cliente.",
        "emoji": "🏠",
        "color": "#3B82F6",
        "model": "openai/gpt-4o-mini",
        "temperature": 0.5,
        "max_tokens": 2048,
        "is_system": True
    },
    {
        "slug": "pricing_analyst",
        "name": "Avaliador de Preços",
        "description": "Analisa e avalia preços de imóveis, calcula métricas como preço/m² e rentabilidade.",
        "emoji": "📊",
        "color": "#10B981",
        "model": "openai/gpt-4o",
        "temperature": 0.2,
        "max_tokens": 2048,
        "is_system": True
    },
    {
        "slug": "customer_service",
        "name": "Atendimento ao Cliente",
        "description": "Agente de atendimento humano para qualificação de leads, agendamentos e suporte geral.",
        "emoji": "👤",
        "color": "#F59E0B",
        "model": "openai/gpt-4o-mini",
        "temperature": 0.7,
        "max_tokens": 1024,
        "is_system": True
    },
    {
        "slug": "listing_writer",
        "name": "Redator de Anúncios",
        "description": "Cria descrições irresistíveis e otimizadas para anúncios de imóveis.",
        "emoji": "✍️",
        "color": "#EF4444",
        "model": "openai/gpt-4o",
        "temperature": 0.8,
        "max_tokens": 2048,
        "is_system": True
    },
    {
        "slug": "market_analyst",
        "name": "Analista de Mercado",
        "description": "Fornece análises de tendências do mercado imobiliário, regiões em valorização e dados de investimento.",
        "emoji": "🔍",
        "color": "#06B6D4",
        "model": "openai/gpt-4o",
        "temperature": 0.3,
        "max_tokens": 3000,
        "is_system": True
    },
]

async def seed():
    print("🌱 Iniciando inicialização de Agentes Especialistas...")
    async with AsyncSessionLocal() as session:
        for agent_data in AGENT_SEED_DATA:
            slug = agent_data["slug"]
            
            # Verifica se o agente já existe
            result = await session.execute(select(Agent).where(Agent.slug == slug))
            agent = result.scalar_one_or_none()
            
            if not agent:
                print(f"➕ Criando agente: {slug}")
                agent = Agent(**agent_data)
                session.add(agent)
                await session.flush()
            else:
                print(f"ℹ️ Agente {slug} já existe. Pulando criação.")

            # Verifica/Cria Prompt padrão se não existir
            if slug in DEFAULT_PROMPTS:
                p_result = await session.execute(
                    select(Prompt).where(Prompt.agent_slug == slug, Prompt.is_active == True)
                )
                if not p_result.scalar_one_or_none():
                    print(f"📝 Criando prompt padrão para: {slug}")
                    prompt = Prompt(
                        agent_slug=slug,
                        version=1,
                        is_active=True,
                        system_prompt=DEFAULT_PROMPTS[slug],
                        notes="Prompt inicial do sistema."
                    )
                    session.add(prompt)
        
        await session.commit()
    print("✨ Sincronização concluída!")

if __name__ == "__main__":
    asyncio.run(seed())
