import asyncio
from sqlalchemy import select, update
from app.core.database import AsyncSessionLocal
from app.models.prompt import Prompt, DEFAULT_PROMPTS

async def sync_prompts():
    async with AsyncSessionLocal() as db:
        print("🔄 Sincronizando Prompts do Banco com o Código...")
        
        for slug, system_content in DEFAULT_PROMPTS.items():
            # Busca o prompt ativo do agente
            result = await db.execute(
                select(Prompt).where(Prompt.agent_slug == slug, Prompt.is_active == True)
            )
            prompt_obj = result.scalar_one_or_none()
            
            if prompt_obj:
                print(f"✅ Atualizando Prompt: {slug}")
                prompt_obj.system_prompt = system_content
            else:
                print(f"➕ Criando novo Prompt: {slug}")
                new_prompt = Prompt(
                    agent_slug=slug,
                    system_prompt=system_content,
                    is_active=True
                )
                db.add(new_prompt)
        
        await db.commit()
        print("✨ Sincronização concluída! Agora os agentes estão usando o novo template de Redirecionamento.")

if __name__ == "__main__":
    asyncio.run(sync_prompts())
