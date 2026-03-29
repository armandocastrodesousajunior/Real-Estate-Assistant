import asyncio
import os
import sys
import json

# Garante que o diretório atual está no path
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from sqlalchemy import text
from app.core.database import engine

async def fix_nulls():
    print("🛠️ Iniciando correção de valores NULL nas propriedades...")
    async with engine.begin() as conn:
        # Corrige views
        res_views = await conn.execute(text("UPDATE properties SET views = 0 WHERE views IS NULL"))
        print(f"✅ views: {res_views.rowcount} linhas corrigidas")

        # Corrige tags (JSON empty list)
        res_tags = await conn.execute(text("UPDATE properties SET tags = '[]' WHERE tags IS NULL"))
        print(f"✅ tags: {res_tags.rowcount} linhas corrigidas")

        # Corrige amenities (JSON empty list)
        res_amenities = await conn.execute(text("UPDATE properties SET amenities = '[]' WHERE amenities IS NULL"))
        print(f"✅ amenities: {res_amenities.rowcount} linhas corrigidas")

        # Corrige photos (JSON empty list)
        res_photos = await conn.execute(text("UPDATE properties SET photos = '[]' WHERE photos IS NULL"))
        print(f"✅ photos: {res_photos.rowcount} linhas corrigidas")

        # Opcional: Corrige highlights
        res_highlights = await conn.execute(text("UPDATE properties SET highlights = '' WHERE highlights IS NULL"))
        print(f"✅ highlights: {res_highlights.rowcount} linhas corrigidas")

    print("✨ Correção concluída com sucesso!")

if __name__ == "__main__":
    asyncio.run(fix_nulls())
