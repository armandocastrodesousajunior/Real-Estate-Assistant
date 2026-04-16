import os
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from loguru import logger

from app.core.config import settings
from app.core.database import engine, Base, AsyncSessionLocal

# Importa todos os modelos para que o SQLAlchemy registre as tabelas no metadata
# IMPORTANTE: deve vir antes de Base.metadata.create_all()
from app.models.property import Property          # noqa: F401
from app.models.agent import Agent                # noqa: F401
from app.models.lead import Lead                  # noqa: F401
from app.models.conversation import Conversation, Message  # noqa: F401
from app.models.prompt import Prompt              # noqa: F401

# Routers
from app.routers import auth, properties, agents, prompts, chat, leads, logs, tools, workspaces, users, super_admin


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Lifecycle da aplicação — startup e shutdown"""
    # Startup
    logger.info(f"🚀 Starting {settings.APP_NAME} v{settings.APP_VERSION}")

    # Cria diretório de uploads
    os.makedirs(settings.UPLOAD_DIR, exist_ok=True)
    os.makedirs(os.path.join(settings.UPLOAD_DIR, "properties"), exist_ok=True)
    logger.info(f"📁 Upload directory: {settings.UPLOAD_DIR}")

    # Nota: A criação de tabelas agora é gerenciada pelo script de seed ou migrações
    # para evitar problemas de greenlet no startup
    logger.info("📡 Database connected")

    logger.info("✅ Real-Estate-Assistant API ready!")
    yield

    # Shutdown
    await engine.dispose()
    logger.info("👋 Real-Estate-Assistant API shut down.")


app = FastAPI(
    title="Real-Estate-Assistant — Sistema Multi-Agentes para Imobiliária",
    description="""
## 🏡 Real-Estate-Assistant API

Sistema avançado de inteligência artificial para imobiliárias com **6 agentes especializados** orquestrados por IA.

---

### 🤖 Agentes Disponíveis

| Agente | Função | Emoji |
|---|---|---|
| Supervisor | Roteamento de intenção | 🧠 |
| Buscador de Imóveis | Encontrar propriedades | 🏠 |
| Avaliador de Preços | Análise de precificação | 📊 |
| Atendimento ao Cliente | Qualificação de leads | 👤 |
| Redator de Anúncios | Criação de textos | ✍️ |
| Analista de Mercado | Tendências e mercado | 🔍 |

---

### 🔐 Autenticação

1. Use `POST /api/v1/auth/login` com suas credenciais
2. Copie o `access_token` retornado
3. Clique em **Authorize** e insira: `Bearer <seu_token>`

---

### 💬 Chat em Tempo Real

O endpoint `/api/v1/chat/` retorna **Server-Sent Events (SSE)** em streaming.
Eventos: `agent_selected`, `token`, `done`.

---

### 📚 Recursos

- **Imóveis**: CRUD completo com upload de fotos
- **Leads**: Gestão do funil de vendas
- **Prompts**: Configure cada agente individualmente
- **Configurações**: Gerencie modelos e parâmetros de cada agente
    """,
    version=settings.APP_VERSION,
    contact={
        "name": "Real-Estate-Assistant Support",
        "email": "support@realestateassistant.com",
    },
    license_info={"name": "MIT License"},
    lifespan=lifespan,
    docs_url="/docs",
    redoc_url="/redoc",
    openapi_url="/openapi.json",
)

# ─── Middlewares ──────────────────────────────────────────────────────────────

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:3000", "http://localhost:8080"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["*"],
)

# ─── Static files (uploads) ───────────────────────────────────────────────────

# Garante que o diretório existe antes de montar (evita RuntimeError)
os.makedirs(settings.UPLOAD_DIR, exist_ok=True)
os.makedirs(os.path.join(settings.UPLOAD_DIR, "properties"), exist_ok=True)
app.mount("/uploads", StaticFiles(directory=settings.UPLOAD_DIR), name="uploads")

# ─── Routers ──────────────────────────────────────────────────────────────────

app.include_router(auth.router,       prefix="/api/v1/auth",       tags=["🔐 Autenticação"])
app.include_router(properties.router, prefix="/api/v1/properties", tags=["🏠 Imóveis"])
app.include_router(agents.router,     prefix="/api/v1/agents",     tags=["🤖 Agentes"])
app.include_router(prompts.router,    prefix="/api/v1/prompts",    tags=["🎛️ Prompts"])
app.include_router(chat.router,       prefix="/api/v1/chat",       tags=["💬 Chat"])
app.include_router(leads.router,      prefix="/api/v1/leads",      tags=["👤 Leads"])
app.include_router(logs.router,       prefix="/api/v1/logs",       tags=["📜 Logs"])
app.include_router(tools.router,      prefix="/api/v1/tools",      tags=["🛠️ Ferramentas"])
app.include_router(workspaces.router, prefix="/api/v1/workspaces", tags=["🏢 Workspaces"])
app.include_router(users.router,      prefix="/api/v1/users",      tags=["👤 Usuários"])
app.include_router(super_admin.router, prefix="/api/v1/superadmin", tags=["👑 Super Admin"])

# ─── Root endpoints ───────────────────────────────────────────────────────────

@app.get("/", tags=["📊 Status"], include_in_schema=False)
async def root():
    return {
        "service": "Real-Estate-Assistant API",
        "version": settings.APP_VERSION,
        "status": "online",
        "docs": "/docs",
        "redoc": "/redoc",
    }


@app.get("/health", tags=["📊 Status"], summary="Health check")
async def health():
    """Verificação de saúde da API. Use para monitoramento."""
    return {"status": "healthy", "version": settings.APP_VERSION}
