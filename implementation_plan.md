# RealtyAI — Sistema Multi-Agentes para Imobiliária

Um sistema de IA profissional e de alto nível para imobiliárias, com orquestração de múltiplos agentes, API RESTful documentada via Swagger, integração com OpenRouter, painel de gestão de imóveis e interface de configuração de prompts.

---

## Visão Geral da Arquitetura


# ============================================================
#  RealtyAI — Conda Environment
#  
#  Criar ambiente:   conda env create -f environment.yml
#  Ativar:           conda activate realtyai
#  Atualizar:        conda env update -f environment.yml --prune
#  Exportar atual:   conda env export > environment.yml
#  Remover:          conda env remove -n realtyai
# ============================================================


```
┌─────────────────────────────────────────────────────────────────┐
│                         FRONTEND (React)                        │
│  ┌──────────────┐  ┌─────────────────┐  ┌───────────────────┐  │
│  │ Painel Admin │  │ Chat com IA     │  │ Gerenc. de Prompts│  │
│  │ Imóveis CRUD │  │ (agentes vivos) │  │ por agente        │  │
│  └──────────────┘  └─────────────────┘  └───────────────────┘  │
└───────────────────────────────┬─────────────────────────────────┘
                                │ HTTP / SSE
┌───────────────────────────────▼─────────────────────────────────┐
│              BACKEND — FastAPI + Swagger UI                     │
│   /api/v1/properties  /api/v1/agents  /api/v1/chat              │
│   /api/v1/prompts     /api/v1/leads   /api/v1/settings          │
└──────────┬──────────────────────────────────────────────────────┘
           │ Orquestrador
┌──────────▼──────────────────────────────────────────────────────┐
│                  ORQUESTRADOR DE AGENTES                        │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────┐  │
│  │ 🧠 Supervisor│  │ 🏠 Buscador  │  │ 📊 Avaliador de Preço│  │
│  │    Agent     │  │    Agent     │  │        Agent         │  │
│  └──────────────┘  └──────────────┘  └──────────────────────┘  │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────┐  │
│  │ 👤 Atend.    │  │ 📝 Redator   │  │ 🔍 Analista de Mercado│  │
│  │    Agent     │  │    de Anúnc. │  │        Agent         │  │
│  └──────────────┘  └──────────────┘  └──────────────────────┘  │
└──────────┬──────────────────────────────────────────────────────┘
           │
┌──────────▼──────────────────────────────────────────────────────┐
│              OpenRouter API  (Model Routing)                    │
│   GPT-4o / Claude Sonnet / Gemini Pro / Mistral / etc.          │
└─────────────────────────────────────────────────────────────────┘
           │
┌──────────▼──────────────────────────────────────────────────────┐
│                    PERSISTÊNCIA                                  │
│         SQLite (dev)  →  PostgreSQL (prod)                      │
│         imóveis, leads, conversas, prompts, configurações       │
└─────────────────────────────────────────────────────────────────┘
```

---

## Stack Tecnológica

| Camada | Tecnologia | Motivo |
|---|---|---|
| **Backend** | FastAPI + Python 3.11 | Async, tipagem, OpenAPI automático |
| **ORM** | SQLAlchemy 2.0 + Alembic | Migrations robustas |
| **Database** | SQLite → PostgreSQL | Simples no dev, escala no prod |
| **AI Routing** | OpenRouter API | Multi-modelo, sem lock-in |
| **Frontend** | React + Vite + TypeScript | SPA moderna e reativa |
| **Estilos** | Vanilla CSS + CSS Variables | Controle máximo, design premium |
| **API Docs** | Swagger UI (automático FastAPI) | Documentação profissional |
| **Autenticação** | JWT (jose) + API Keys | Seguro para admin e agentes |
| **Validação** | Pydantic v2 | Confiável e rápido |

---

## Estrutura de Diretórios

```
RealtyAI/
├── backend/
│   ├── app/
│   │   ├── main.py                  # FastAPI app entry
│   │   ├── core/
│   │   │   ├── config.py            # Settings (env vars)
│   │   │   ├── security.py          # JWT / API keys
│   │   │   └── database.py          # SQLAlchemy engine
│   │   ├── models/
│   │   │   ├── property.py          # Modelo de imóvel
│   │   │   ├── agent.py             # Modelo de agente
│   │   │   ├── lead.py              # Modelo de lead
│   │   │   ├── conversation.py      # Histórico de chat
│   │   │   └── prompt.py            # Prompts por agente
│   │   ├── schemas/
│   │   │   ├── property.py          # Pydantic schemas
│   │   │   ├── agent.py
│   │   │   ├── lead.py
│   │   │   └── chat.py
│   │   ├── routers/
│   │   │   ├── properties.py        # CRUD imóveis
│   │   │   ├── agents.py            # Gerenciamento de agentes
│   │   │   ├── prompts.py           # CRUD prompts
│   │   │   ├── chat.py              # Endpoint de chat (SSE)
│   │   │   ├── leads.py             # Gestão de leads
│   │   │   └── auth.py              # Auth endpoints
│   │   └── agents/
│   │       ├── orchestrator.py      # Supervisor agent
│   │       ├── property_finder.py   # Agente buscador
│   │       ├── pricing_analyst.py   # Agente avaliador
│   │       ├── customer_service.py  # Agente atendimento
│   │       ├── listing_writer.py    # Agente redator
│   │       ├── market_analyst.py    # Agente de mercado
│   │       └── openrouter.py        # Client OpenRouter
│   ├── migrations/                  # Alembic migrations
│   ├── requirements.txt
│   └── .env.example
│
└── frontend/
    ├── src/
    │   ├── App.tsx
    │   ├── main.tsx
    │   ├── index.css               # Design system global
    │   ├── pages/
    │   │   ├── Dashboard.tsx       # Visão geral
    │   │   ├── Properties.tsx      # Lista de imóveis
    │   │   ├── PropertyForm.tsx    # Cadastro/edição
    │   │   ├── Chat.tsx            # Chat com IA
    │   │   ├── Agents.tsx          # Configuração agentes
    │   │   ├── Prompts.tsx         # Editor de prompts
    │   │   └── Leads.tsx           # Gestão de leads
    │   ├── components/
    │   │   ├── Layout/
    │   │   ├── PropertyCard/
    │   │   ├── AgentCard/
    │   │   ├── ChatInterface/
    │   │   ├── PromptEditor/
    │   │   └── ui/                 # Componentes base
    │   ├── services/
    │   │   ├── api.ts              # Axios client
    │   │   └── openrouter.ts
    │   └── types/
    ├── index.html
    ├── package.json
    └── vite.config.ts
```

---

## Módulos e Funcionalidades Detalhadas

### 🏠 Módulo de Imóveis (Properties)
- **CRUD completo** com fotos múltiplas (upload)
- Campos: tipo, endereço, bairro, cidade, área, quartos, banheiros, vagas, valor, condomínio, IPTU, descrição, status
- **Busca avançada** com filtros: tipo, faixa de preço, localização, área
- **Status de imóvel**: Disponível, Reservado, Vendido/Alugado
- **Tags** customizáveis (novo, reformado, oportunidade...)

### 🤖 Sistema Multi-Agentes

| Agente | Função | Modelo Sugerido |
|---|---|---|
| **🧠 Supervisor** | Roteamento de intenção | Claude Sonnet |
| **🏠 Buscador** | Encontra imóveis no DB com base na conversa | GPT-4o-mini |
| **📊 Avaliador de Preço** | Análise de precificação e comparáveis | GPT-4o |
| **👤 Atendimento** | Qualificação de lead e CRM | Claude Haiku |
| **📝 Redator** | Criação de anúncios e descrições | GPT-4o |
| **🔍 Analista de Mercado** | Tendências e análise de mercado | Claude Sonnet |

### 💬 Interface de Chat
- Chat em tempo real com **SSE (Server-Sent Events)**
- **Indicador visual** de qual agente está respondendo
- Histórico de conversas persistido
- Suporte a **contexto multi-turno**
- Exibição de **raciocínio do agente** (transparência)

### 🎛️ Gerenciador de Prompts
- Editor rico (monaco-like) para editar cada prompt
- **Templates** padrão por agente
- **Versionamento** de prompts (histórico)
- **Teste de prompt** diretamente na interface
- Variáveis dinâmicas: `{{property_data}}`, `{{lead_name}}`, etc.

### ⚙️ Configurações de Agentes
- Selecionar modelo por agente (dropdown com modelos OpenRouter)
- Configurar **temperatura**, **max_tokens**, **top_p**
- **Ativar/desativar** agentes individualmente
- Testar agente com input de exemplo

### 📊 Dashboard
- Métricas: imóveis cadastrados, leads, conversas, tokens usados
- Logs de atividade dos agentes em tempo real
- Gráfico de uso de tokens/custo estimado

---

## API — Endpoints Documentados

```yaml
# Todos os endpoints abaixo têm documentação Swagger completa

/api/v1/auth/
  POST /login          # Obter JWT token
  POST /refresh        # Refresh token

/api/v1/properties/
  GET    /             # Listar com filtros e paginação
  POST   /             # Criar imóvel
  GET    /{id}         # Detalhe do imóvel
  PUT    /{id}         # Atualizar imóvel
  DELETE /{id}         # Remover imóvel
  POST   /{id}/photos  # Upload de fotos
  GET    /search       # Busca avançada

/api/v1/agents/
  GET    /             # Listar agentes e configs
  GET    /{id}         # Config de um agente
  PUT    /{id}         # Atualizar config do agente
  PUT    /{id}/model   # Trocar modelo
  PUT    /{id}/toggle  # Ativar/desativar agente

/api/v1/prompts/
  GET    /             # Listar todos os prompts
  GET    /{agent_id}   # Prompt do agente
  PUT    /{agent_id}   # Atualizar prompt
  POST   /{agent_id}/test # Testar prompt
  GET    /{agent_id}/history # Histórico de versões

/api/v1/chat/
  POST   /             # Nova mensagem (streaming SSE)
  GET    /conversations # Listar conversas
  GET    /conversations/{id} # Histórico de uma conversa
  DELETE /conversations/{id} # Deletar conversa

/api/v1/leads/
  GET    /             # Listar leads
  POST   /             # Criar lead
  GET    /{id}         # Detalhe
  PUT    /{id}         # Atualizar status
  GET    /{id}/timeline # Histórico de interações

/api/v1/settings/
  GET    /openrouter   # Config OpenRouter (modelos disponíveis)
  PUT    /openrouter   # Salvar API key
  GET    /models       # Modelos disponíveis no OpenRouter
```

---

## Design Visual — Frontend

**Paleta**: Dark mode premium com acentos em dourado/âmbar (#F59E0B) sobre fundo slate escuro
- Background: `#0F1117` (quase preto)
- Surface: `#1A1D2E` (azul-escuro)
- Accent: `#F59E0B` (âmbar/dourado)
- Text: `#E2E8F0`
- Success: `#10B981`
- Border: `#2D3748`

**Fontes**: Inter + JetBrains Mono (código/prompts)

**Animações**: Transições suaves, pulse nos agentes ativos, streaming de texto tipo "typewriter"

---

## Open Questions

> [!IMPORTANT]  
> **Pergunta 1: Banco de dados**
> Devemos usar SQLite (zero configuração, ideal para início) ou você já tem um PostgreSQL disponível?
> Recomendo SQLite para começar — fácil de migrar depois.

> [!IMPORTANT]  
> **Pergunta 2: Autenticação**
> Você precisa de múltiplos usuários/perfis ou é um sistema **single-user** (só você usa o painel)?
> Se single-user, podemos simplificar com apenas uma API key + JWT básico.

> [!IMPORTANT]  
> **Pergunta 3: Upload de fotos**
> As fotos de imóveis devem ser armazenadas **localmente** no servidor ou em um storage externo como **Cloudinary/S3**?
> Localmente é mais simples para começar.

> [!NOTE]
> **Pergunta 4: API Key OpenRouter**
> Você já tem uma API key do OpenRouter? Precisaremos configurá-la no `.env`.

> [!NOTE]
> **Pergunta 5: Idioma dos agentes**  
> Os agentes devem responder em **Português (PT-BR)** por padrão?

---

## Plano de Execução (Fases)

### Fase 1 — Backend Core (1ª entrega)
1. Configuração do projeto FastAPI com Swagger completo
2. Models e migrations (SQLAlchemy + Alembic)
3. CRUD de Imóveis com upload de fotos
4. Client OpenRouter com suporte a streaming

### Fase 2 — Sistema de Agentes
5. Orquestrador Supervisor
6. Implementação dos 6 agentes especializados
7. Endpoint de chat com SSE streaming
8. Persistência de conversas

### Fase 3 — Frontend Premium
9. Design system e componentes base
10. Dashboard com métricas
11. Painel de imóveis (listagem + formulário)
12. Interface de chat ao vivo
13. Editor de prompts por agente
14. Configurações de agentes

### Fase 4 — Polish
15. Documentação Swagger completa com exemplos
16. Tratamento de erros e logs
17. Arquivo `.env.example` e README detalhado

---

## Verificação Final

- [ ] Todos os endpoints documentados no Swagger (`/docs` e `/redoc`)
- [ ] Sistema multi-agentes funcionando com OpenRouter
- [ ] CRUD de imóveis com fotos
- [ ] Editor de prompts operacional
- [ ] Chat em tempo real com streaming
- [ ] Dashboard com métricas reais
- [ ] Design premium dark mode
