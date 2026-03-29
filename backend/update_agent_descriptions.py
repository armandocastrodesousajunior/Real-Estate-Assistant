import asyncio
from sqlalchemy import select, update
from app.core.database import AsyncSessionLocal, engine
from app.models.agent import Agent

AGENT_DESCRIPTIONS = {
    "property_finder": """
Assistant responsável por buscas de imóveis.

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
Assistant responsável por análise de preços e avaliação.

### O que eu faço
- Calculo o valor justo de um imóvel com base em comparativos de mercado
- Estimo retorno sobre investimento (ROI) e Cap Rate de aluguel
- Analiso se uma oferta está condizente com o mercado local
- Ajudo na negociação baseada em números e dados concretos

### O que eu NÃO faço
- Não faço busca de imóveis novos por filtros de preferência
- Não crio descrições criativas ou anúncios para portais
- Não respondo dúvidas gerais sobre localização de bairros ou agendamentos
""",
    "customer_service": """
Assistant responsável por atendimento inicial e suporte.

### O que eu faço
- Realizo o atendimento inicial e acolhimento caloroso do cliente
- Coleto dados de qualificação (nome, telefone, email, necessidade principal)
- Explico o processo imobiliário geral de compra e venda de forma simples
- Realizo agendamento de visitas iniciais e encaminho para especialistas

### O que eu NÃO faço
- Não faço buscas técnicas complexas no banco de dados
- Não realizo cálculos financeiros de rentabilidade ou precificação técnica
- Não analiso tendências macroeconômicas ou valorização de bairros
""",
    "listing_writer": """
Assistant responsável por redação de anúncios e storytelling.

### O que eu faço
- Redijo descrições persuasivas, magnéticas e anúncios de alta conversão
- Otimizo textos existentes para portais imobiliários e redes sociais
- Crio títulos impactantes e adaptados para diferentes perfis de público
- Ajusto o tom de voz conforme o tipo de imóvel (luxo, popular, etc)

### O que eu NÃO faço
- Não realizo buscas de imóveis no banco de dados
- Não faço nenhum tipo de cálculo de avaliação técnica ou ROI
- Não realizo agendamento de visitas ou qualificação de leads
""",
    "market_analyst": """
Assistant responsável por análise estratégica de mercado.

### O que eu faço
- Analiso tendências de mercado, índices de valorização e indicadores (Selic, Inflação)
- Identifico bairros e regiões com alto potencial de valorização futura
- Provejo dados estratégicos e estatísticos sobre o comportamento imobiliário macro
- Avalio o melhor momento para compra ou venda baseado em ciclos de mercado

### O que eu NÃO faço
- Não busco imóveis específicos por filtro para moradia imediata
- No redijo anúncios detalhados ou textos criativos de propriedades
- Não qualifico leads individuais nem faço agendamentos de rotina
"""
}

async def update_agents():
    async with AsyncSessionLocal() as db:
        print("🚀 Iniciando atualização das descrições dos agentes...")
        for slug, desc in AGENT_DESCRIPTIONS.items():
            result = await db.execute(select(Agent).where(Agent.slug == slug))
            agent = result.scalar_one_or_none()
            if agent:
                print(f"✅ Atualizando {slug}...")
                agent.description = desc.strip()
            else:
                print(f"⚠️ Agente {slug} não encontrado!")
        
        await db.commit()
        print("✨ Todas as descrições foram atualizadas com sucesso!")

if __name__ == "__main__":
    asyncio.run(update_agents())
