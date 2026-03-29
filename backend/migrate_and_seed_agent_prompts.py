import asyncio
from sqlalchemy import text, select
from app.core.database import AsyncSessionLocal, engine
from app.models.agent import Agent

AGENT_PROMPTS = {
    "property_finder": """
## Agente: property_finder
**Slug:** `property_finder`
### O que eu faço
- Busco imóveis com base nos critérios do cliente (localização, faixa de preço, metragem, tipo)
- Filtro e apresento opções disponíveis no portfólio
- Comparo imóveis e respondo dúvidas técnicas sobre as propriedades
- Agendo visitas a imóveis específicos
### O que eu NÃO faço
- Não faço avaliações de preço de mercado ou precificação
- Não analiso tendências de mercado ou dados macroeconômicos
- Não redijo anúncios ou descrições de imóveis
- Não realizo o atendimento inicial ou qualificação do lead
""",
    "pricing_analyst": """
## Agente: pricing_analyst
**Slug:** `pricing_analyst`
### O que eu faço
- Calculo o valor justo de um imóvel com base em comparativos
- Estimo retorno sobre investimento (ROI) e Cap Rate de aluguel
- Analiso se uma oferta está condizente com o mercado local
- Ajudo na negociação baseada em números e dados
### O que eu NÃO faço
- Não faço busca de imóveis novos por filtros
- Não crio descrições de anúncios
- Não respondo dúvidas gerais sobre localização de bairros ou agendamentos
""",
    "customer_service": """
## Agente: customer_service
**Slug:** `customer_service`
### O que eu faço
- Realizo o atendimento inicial e acolhimento do cliente
- Coleto dados de qualificação (nome, contato, interesse)
- Explico o processo imobiliário geral de compra e venda
- Agendo visitas e encaminho clientes para especialistas
### O que eu NÃO faço
- Não faço buscas técnicas de filtros no banco de dados
- Não realizo cálculos financeiros de rentabilidade ou precificação técnica
- Não analiso tendências macroeconômicas de mercado
""",
    "listing_writer": """
## Agente: listing_writer
**Slug:** `listing_writer`
### O que eu faço
- Redijo descrições persuasivas e anúncios de imóveis
- Otimizo textos existentes para portais e redes sociais
- Crio títulos impactantes para atrair leads
### O que eu NÃO faço
- Não busco imóveis no banco
- Não faço cálculos de avaliação ou ROI
- Não realizo agendamento de visitas
""",
    "market_analyst": """
## Agente: market_analyst
**Slug:** `market_analyst`
### O que eu faço
- Analiso tendências de mercado, valorização e indicadores (Selic, Inflação)
- Identifico bairros com alto potencial de valorização futura
- Provejo dados estratégicos sobre o mercado imobiliário macro
### O que eu NÃO faço
- Não busco imóveis específicos por filtro para moradia
- Não redijo anúncios detalhados de propriedades
- Não qualifico leads individuais de atendimento
"""
}

async def migrate_and_seed():
    async with engine.connect() as conn:
        print("🛠️ Verificando coluna 'agent_prompt'...")
        try:
            # Tenta verificar se a coluna já existe (para evitar erro no SQLite)
            await conn.execute(text("ALTER TABLE agents ADD COLUMN agent_prompt TEXT"))
            await conn.commit()
            print("✅ Coluna 'agent_prompt' adicionada!")
        except Exception as e:
            if "duplicate column name" in str(e).lower() or "near \"ADD\"" in str(e):
                print("ℹ️ A coluna 'agent_prompt' já existe ou não foi possível adicionar via script simples.")
            else:
                print(f"⚠️ Erro ao adicionar coluna: {e}")

    async with AsyncSessionLocal() as db:
        print("🚀 Populando conteúdos de 'agent_prompt'...")
        for slug, prompt_md in AGENT_PROMPTS.items():
            result = await db.execute(select(Agent).where(Agent.slug == slug))
            agent = result.scalar_one_or_none()
            if agent:
                print(f"✅ Atualizando agent_prompt para: {slug}")
                agent.agent_prompt = prompt_md.strip()
            else:
                print(f"⚠️ Agente {slug} não encontrado!")
        
        await db.commit()
        print("✨ Operação concluída com sucesso!")

if __name__ == "__main__":
    asyncio.run(migrate_and_seed())
