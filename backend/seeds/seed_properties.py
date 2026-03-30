import asyncio
import os
import sys
import json
from datetime import datetime

# Garante que o diretório atual está no path
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from sqlalchemy import text, select
from app.core.database import engine

def generate_slug(title: str, property_id: int) -> str:
    slug = title.lower()
    for char in " àáâãäåèéêëìíîïòóôõöùúûü":
        slug = slug.replace(char, "-")
    slug = "".join(c for c in slug if c.isalnum() or c == "-")
    slug = slug.strip("-")
    return f"{slug}-{property_id}"

PROPERTIES_DATA = [
    {
        "title": "Apartamento Luxo Jardins",
        "type": "apartamento",
        "purpose": "venda",
        "status": "disponivel",
        "address": "Rua Oscar Freire, 1200",
        "neighborhood": "Jardins",
        "city": "São Paulo",
        "state": "SP",
        "area": 120.0,
        "bedrooms": 3,
        "bathrooms": 2,
        "suites": 1,
        "parking_spaces": 2,
        "price": 2500000.0,
        "condominium_fee": 1800.0,
        "iptu": 450.0,
        "description": "Espetacular apartamento reformado no coração dos Jardins. Acabamento de alto padrão.",
        "tags": json.dumps(["luxo", "reformado", "varanda gourmet"]),
        "featured": 1
    },
    {
        "title": "Casa de Condomínio Morumbi",
        "type": "casa",
        "purpose": "venda",
        "status": "disponivel",
        "address": "Av. Alberto Penteado, 500",
        "neighborhood": "Morumbi",
        "city": "São Paulo",
        "state": "SP",
        "area": 450.0,
        "built_area": 380.0,
        "bedrooms": 4,
        "bathrooms": 5,
        "suites": 4,
        "parking_spaces": 4,
        "price": 3800000.0,
        "condominium_fee": 2500.0,
        "iptu": 1200.0,
        "description": "Linda casa em condomínio fechado com segurança 24h. Piscina privativa.",
        "tags": json.dumps(["piscina", "segurança", "quintal"]),
        "featured": 1
    },
    {
        "title": "Studio Moderno Itaim Bibi",
        "type": "kitnet_studio",
        "purpose": "aluguel",
        "status": "disponivel",
        "address": "Rua Tabapuã, 800",
        "neighborhood": "Itaim Bibi",
        "city": "São Paulo",
        "state": "SP",
        "area": 35.0,
        "bedrooms": 1,
        "bathrooms": 1,
        "parking_spaces": 1,
        "price": 4500.0,
        "rent_price": 4500.0,
        "condominium_fee": 700.0,
        "iptu": 150.0,
        "description": "Studio mobiliado ideal para executivos.",
        "tags": json.dumps(["mobiliado", "rooftop", "academia"]),
        "featured": 0
    },
    {
        "title": "Apartamento Vista Mar Leblon",
        "type": "apartamento",
        "purpose": "venda",
        "status": "disponivel",
        "address": "Av. Delfim Moreira, 100",
        "neighborhood": "Leblon",
        "city": "Rio de Janeiro",
        "state": "RJ",
        "area": 180.0,
        "bedrooms": 3,
        "bathrooms": 3,
        "suites": 2,
        "parking_spaces": 2,
        "price": 8500000.0,
        "condominium_fee": 3500.0,
        "iptu": 1800.0,
        "description": "Exclusividade total na quadra da praia do Leblon.",
        "tags": json.dumps(["vista mar", "frente praia", "exclusivo"]),
        "featured": 1
    },
    {
        "title": "Cobertura Duplex Vila Nova Conceição",
        "type": "apartamento",
        "purpose": "venda",
        "status": "disponivel",
        "address": "Rua João Lourenço, 400",
        "neighborhood": "Vila Nova Conceição",
        "city": "São Paulo",
        "state": "SP",
        "area": 220.0,
        "bedrooms": 3,
        "bathrooms": 4,
        "suites": 3,
        "parking_spaces": 3,
        "price": 6200000.0,
        "condominium_fee": 2800.0,
        "iptu": 900.0,
        "description": "Cobertura incrível próxima ao Parque Ibirapuera.",
        "tags": json.dumps(["cobertura", "perto parque", "automação"]),
        "featured": 1
    },
    {
        "title": "Casa de Vila charmosa Pinheiros",
        "type": "casa",
        "purpose": "venda",
        "status": "disponivel",
        "address": "Rua Simão Álvares, 200",
        "neighborhood": "Pinheiros",
        "city": "São Paulo",
        "state": "SP",
        "area": 110.0,
        "bedrooms": 2,
        "bathrooms": 2,
        "suites": 1,
        "parking_spaces": 1,
        "price": 1450000.0,
        "description": "Raridade em Pinheiros. Casa de vila silenciosa.",
        "tags": json.dumps(["casa de vila", "silencioso", "charme"]),
        "featured": 0
    },
    {
        "title": "Sala Comercial Berrini",
        "type": "comercial",
        "purpose": "aluguel",
        "status": "disponivel",
        "address": "Av. Eng Luiz Carlos Berrini, 1500",
        "neighborhood": "Brooklin",
        "city": "São Paulo",
        "state": "SP",
        "area": 85.0,
        "bathrooms": 2,
        "parking_spaces": 2,
        "price": 7500.0,
        "rent_price": 7500.0,
        "condominium_fee": 1200.0,
        "iptu": 350.0,
        "description": "Laje comercial pronta para uso.",
        "tags": json.dumps(["comercial", "corporativo", "infraestrutura"]),
        "featured": 0
    },
    {
        "title": "Terreno em Condomínio Alphaville",
        "type": "terreno",
        "purpose": "venda",
        "status": "disponivel",
        "address": "Al. Rio Negro, 10",
        "neighborhood": "Alphaville",
        "city": "Barueri",
        "state": "SP",
        "area": 600.0,
        "price": 950000.0,
        "condominium_fee": 850.0,
        "iptu": 200.0,
        "description": "Lote plano em localização privilegiada no condomínio.",
        "tags": json.dumps(["terreno", "condomínio fechado", "lote"]),
        "featured": 0
    },
    {
        "title": "Apartamento Garden Moema",
        "type": "apartamento",
        "purpose": "venda",
        "status": "disponivel",
        "address": "Rua Gaivota, 650",
        "neighborhood": "Moema Pássaros",
        "city": "São Paulo",
        "state": "SP",
        "area": 150.0,
        "bedrooms": 3,
        "bathrooms": 3,
        "suites": 1,
        "parking_spaces": 2,
        "price": 2100000.0,
        "condominium_fee": 1400.0,
        "iptu": 400.0,
        "description": "Apartamento Garden com amplo terraço privativo.",
        "tags": json.dumps(["garden", "terraço", "moema"]),
        "featured": 0
    },
    {
        "title": "Sítio Atibaia Vista Montanha",
        "type": "rural",
        "purpose": "venda",
        "status": "disponivel",
        "address": "Estrada das Palmeiras, KM 12",
        "neighborhood": "Área Rural",
        "city": "Atibaia",
        "state": "SP",
        "area": 5000.0,
        "built_area": 350.0,
        "bedrooms": 5,
        "bathrooms": 4,
        "suites": 2,
        "parking_spaces": 10,
        "price": 1850000.0,
        "description": "Maravilhoso sítio com pomar e vista deslumbrante.",
        "tags": json.dumps(["rural", "lazer", "vista"]),
        "featured": 0
    }
]

async def seed():
    print("🌱 Iniciando seed de imóveis (SQL Direto)...")
    async with engine.begin() as conn:
        # Verifica se já existem imóveis
        result = await conn.execute(text("SELECT id FROM properties LIMIT 1"))
        if result.fetchone():
            print("ℹ️ O banco de dados já possui imóveis. Pulando seed.")
            return

        for data in PROPERTIES_DATA:
            # Calcula preço por m²
            price_per_sqm = round(data["price"] / data["area"], 2) if data.get("area") else 0
            
            # Campos automáticos
            created_at = datetime.utcnow().isoformat()
            updated_at = created_at

            keys = list(data.keys())
            keys.extend(["price_per_sqm", "created_at", "updated_at", "photos", "amenities"])
            
            values = list(data.values())
            values.extend([price_per_sqm, created_at, updated_at, json.dumps([]), json.dumps([])])
            
            placeholders = ", ".join([f":{k}" for k in keys])
            cols = ", ".join(keys)
            
            sql = text(f"INSERT INTO properties ({cols}) VALUES ({placeholders})")
            
            # Inserção
            insert_result = await conn.execute(sql, {**data, "price_per_sqm": price_per_sqm, "created_at": created_at, "updated_at": updated_at, "photos": json.dumps([]), "amenities": json.dumps([])})
            
            # Gera slug (precisamos do ID, mas em SQL direto o result.lastrowid funciona no SQLite)
            prop_id = insert_result.lastrowid
            slug = generate_slug(data["title"], prop_id)
            
            await conn.execute(text("UPDATE properties SET slug = :slug WHERE id = :id"), {"slug": slug, "id": prop_id})
            
            print(f"✅ Adicionado: {data['title']} (ID: {prop_id})")

    print("✨ Seed de imóveis concluído com sucesso!")

if __name__ == "__main__":
    asyncio.run(seed())
