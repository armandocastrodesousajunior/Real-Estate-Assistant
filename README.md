# 🏡 Real-Estate-Assistant — Sistema Multi-Agentes para Imobiliária

Sistema avançado de inteligência artificial para imobiliárias com **6 agentes IA especializados**, API documentada via Swagger, painel de gestão de imóveis e editor de prompts.

---

## 🚀 Início Rápido

### 1. Criar e ativar o ambiente Conda

```bash
# Na raiz do projeto
conda env create -f environment.yml
conda activate real-estate-assistant
```

### 2. Configurar variáveis de ambiente

```bash
cd backend
copy .env.example .env
# Edite o .env e configure sua OPENROUTER_API_KEY
```

> A chave OpenRouter já está pré-configurada no `.env` se você a forneceu durante a instalação.

### 3. Iniciar o Backend

```bash
cd backend
uvicorn app.main:app --reload --port 8000
```

Acesse a documentação Swagger em: **http://localhost:8000/docs**

### 4. Iniciar o Frontend

```bash
cd frontend
npm run dev
```

Acesse o painel em: **http://localhost:5173**

### 5. Login

- **Email:** `admin@realestateassistant.com`
- **Senha:** `rea2024`

> Configure em `backend/.env` com `ADMIN_EMAIL` e `ADMIN_PASSWORD`

---

## 🏗️ Arquitetura

```
Real-Estate-Assistant/
├── backend/                 # API FastAPI + Python
│   ├── app/
│   │   ├── main.py          # FastAPI app + Swagger
│   │   ├── core/            # Config, Database, Security
│   │   ├── models/          # SQLAlchemy models
│   │   ├── schemas/         # Pydantic schemas
│   │   ├── routers/         # Endpoints da API
│   │   └── agents/          # Sistema multi-agentes
│   └── .env                 # Variáveis de ambiente
├── frontend/                # React + Vite + TypeScript
│   └── src/
│       ├── pages/           # Todas as páginas
│       ├── components/      # Componentes reutilizáveis
│       └── services/        # API client (Axios)
├── requirements.txt         # Dependências Python
└── environment.yml          # Ambiente Conda
```

---

## 🤖 Agentes de IA

| Agente | Função | Modelo Padrão |
|---|---|---|
| 🧠 **Supervisor** | Roteia para o agente correto | gpt-4o-mini |
| 🏠 **Buscador** | Encontra imóveis no banco | gpt-4o-mini |
| 📊 **Avaliador** | Análise de preços e rentabilidade | gpt-4o |
| 👤 **Atendimento** | Qualificação de leads | gpt-4o-mini |
| ✍️ **Redator** | Cria anúncios e descrições | gpt-4o |
| 🔍 **Analista** | Tendências de mercado | gpt-4o |

---

## 🔌 API — Endpoints Principais

| Método | Endpoint | Descrição |
|---|---|---|
| `POST` | `/api/v1/auth/login` | Login JWT |
| `GET` | `/api/v1/properties/` | Listar imóveis |
| `POST` | `/api/v1/properties/` | Criar imóvel |
| `POST` | `/api/v1/properties/{id}/photos` | Upload de fotos |
| `POST` | `/api/v1/chat/` | Chat SSE streaming |
| `GET` | `/api/v1/agents/` | Listar agentes |
| `PUT` | `/api/v1/agents/{slug}` | Configurar agente |
| `PUT` | `/api/v1/prompts/{slug}` | Atualizar prompt |
| `GET` | `/api/v1/leads/` | Listar leads |

**Documentação completa:** http://localhost:8000/docs

---

## 💡 Uso do Chat IA (SSE)

```javascript
const response = await fetch('/api/v1/chat/', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer TOKEN' },
  body: JSON.stringify({ message: 'Quais imóveis têm 3 quartos em SP?', stream: true })
})

const reader = response.body.getReader()
// Eventos: agent_selected | token | done
```

---

## ⚙️ Variáveis de Ambiente

| Variável | Descrição | Padrão |
|---|---|---|
| `DATABASE_URL` | URL do banco SQLite/PostgreSQL | `sqlite+aiosqlite:///./real_estate_assistant.db` |
| `OPENROUTER_API_KEY` | Chave da API OpenRouter | — |
| `JWT_SECRET_KEY` | Chave secreta JWT | Mude em produção! |
| `ADMIN_EMAIL` | Email do admin | `admin@realestateassistant.com` |
| `ADMIN_PASSWORD` | Senha do admin | `rea2024` |

---

## 🛠️ Stack Tecnológica

**Backend:** FastAPI · SQLAlchemy · Pydantic v2 · python-jose · OpenRouter API  
**Frontend:** React 18 · Vite · TypeScript · Axios · Lucide Icons  
**Database:** SQLite (dev) → PostgreSQL (prod)  
**AI:** OpenRouter (GPT-4o · Claude · Gemini · Mistral)
