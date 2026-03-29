# 🧠 Lógica Multi-Agentes do Real-Estate-Assistant

O Real-Estate-Assistant não é um simples chatbot. Ele é um sistema orquestrado onde vários "Especialistas Virtuais" trabalham em conjunto para responder o usuário da melhor forma possível, economizando tokens e melhorando a qualidade de resposta.

Neste documento, explicamos detalhadamente como funciona o roteamento e a execução dos agentes.

---

## 🏗️ Arquitetura de Roteamento (Supervisor Pattern)

A arquitetura utilizada é conhecida como **Supervisor-Worker Pattern**. Funciona em duas etapas cada vez que o usuário envia uma nova mensagem.

1. **Agente Supervisor (O Roteador)**
2. **Agente Especialista (O Worker)**

### O Fluxo Passo a Passo:

#### Passo 1: O Usuário envia uma mensagem
A mensagem chega no endpoint `/api/v1/chat/` (`backend/app/routers/chat.py`). O backend carrega o histórico recente daquela conversa do banco de dados para dar contexto às IAs.

#### Passo 2: Avaliação do Supervisor
Antes de processar a resposta final, a mensagem passa pelo fluxo do **Supervisor** (`backend/app/agents/orchestrator.py` -> `run_agent_stream`). 

O Supervisor é um LLM configurado *especificamente* (com baixo `temperature` e processando poucos tokens) para realizar **Apenas uma tarefa:** Ler a requisição e decidir **qual** agente especialista deve responder. 

Ele tem acesso à lista de todos os agentes ativos no banco de dados e suas descrições.
Exemplo de operação do Supervisor:
* **Usuário:** "Quero ver casas com piscina no Morumbi."
* **Supervisor:** Analisa intenção -> Intenção é busca imobiliária -> Retorna: `property_finder`
* **Usuário:** "Qual a taxa média de condomínio de um prédio assim?"
* **Supervisor:** Analisa intenção -> Intenção financeira/avaliação -> Retorna: `pricing_analyst`

#### Passo 3: Hand-off (Transferência)
A API recebe a decisão do Supervisor (ex: `property_finder`) e emite um evento "SSE" (Server-Sent Event) para o **Frontend**. 
*O Frontend, neste momento, exibe a tag animada com a cor e o nome de qual Agente assumiu a conversa.*

#### Passo 4: Execução do Especialista
O Orquestrador então busca no banco de dados o **System Prompt**, **Modelo OpenRouter** e as **Configurações** (como temperatura) do agente escolhido (`property_finder`, neste caso).

Ele envia a mensagem original do usuário para a API do OpenRouter, mas **injetando o contexto e o System Prompt** focado apenas em achar imóveis. 

#### Passo 5: Streaming da Resposta (SSE)
Assim que o OpenRouter começa a responder (`backend/app/agents/openrouter.py`), a API do Real-Estate-Assistant vai mastigando pedaço por pedaço e devolvendo em tempo real (`yield`) para o Frontend. 

Isso dá aquele feito visual estilo ChatGPT do texto sendo digitado na hora, garantindo performance e rapidez percebida pelo cliente humano.

#### Passo 6: Persistência
Ao final do streaming, a fala completa gerada pelo agente é pega pelo Orquestrador, salva no banco de dados (`messages`) assinalando a qual agente pertencia (campos `agent_slug`, `agent_name`, `agent_emoji`) para manter o histórico coerente.

---

## 🤖 Como saber qual Agente vai responder?

Ao criar ou editar o **System Prompt** do Supervisor no painel frontend (`/prompts`), você pode verificar e afinar as regras de decisão dele. A tomada de decisão é baseada exclusivamente na compreensão textual da intenção do lead somada às definições dos agentes.

O sistema possui inteligência natural. Se um agente falhar ou for desativado pelo Painel de Controle, a lista enviada ao Supervisor nos bastidores se altera dinamicamente e ele deixa de direcionar requisições àquele agente inativo.

### Os 6 Agentes Integrados e Seus Domínios:

| Slug (Identificador) | Nome Visual | Quando o Supervisor o Escolhe (Intenção) |
| :--- | :--- | :--- |
| `supervisor` | Supervisor | (Ele não responde diretamente ao usuário de modo geral; apenas orquestra.) |
| `property_finder` | Buscador de Imóveis | Quando o usuário quer procurar, listar, filtrar, ou perguntar se temos X imóvel. |
| `pricing_analyst` | Avaliador de Preços | Quando a pergunta envolve preço do metro quadrado, custos ocultos (IPTU, condomínio) ou se um imóvel está caro/barato. |
| `customer_service`| Atendimento | Humanização (ex: "Bom dia!", "Como você se chama?"), agendar visitas, lidar com dúvidas operacionais da imobiliária. |
| `listing_writer` | Redator de Anúncios| Quando um corretor interno pede para o chat gerar um texto bonitão de vendas para redes sociais, instagram, etc. |
| `market_analyst` | Analista de Mercado | Macroeconomia. "Vale a pena investir na zona sul neste semestre?", "A Selic afeta o financiamento atual?". |

---

## 🚀 Como customizar esta lógica?

A parte mais poderosa desta arquitetura é que **tudo é editável pelo painel Administrativo (React)**, no menu "Agentes" e "Prompts".

Sem tocar em código, você pode:
1. Ir no menu **Agentes**, e mudar o `property_finder` para usar o modelo `Claude 3.5 Sonnet` (mais caro e forte), e deixar o `customer_service` no modelo `GPT-4o-Mini` (mais rápido e barato).
2. Ir no menu **Prompts**, testar o comportamento de um agente no simulador, e se ele estiver escapando do escopo, editar a diretriz dele.
3. Se quiser forçar que o Supervisor tome decisões melhores, basta editar o System Prompt do Supervisor instruindo-o: *"Se o usuário citar a palavra 'Investimento', sempre mande para o market_analyst"*.

---

### Porque este modelo (Multi-Agent/Orquestrador) é o state-of-the-art?
- **Redução de Custos:** Você não precisa rodar sempre as requests em Modelos Gigantescos (que cobram por Token). Pode deixar um modelo pequeno e de baixo custo tomando a decisão (Supervisor), acionando o modelo caro apenas quando for uma tarefa analítica pesada.
- **Isolamento de Erros:** O "Redator" nunca fará promessas aos clientes sobre preços e agendamentos porque ele foi configurado só para Redigir anúncios. O "Atendimento", não corre o risco de tentar cruzar dados da taxa Selic de forma errada sugerindo péssimos investimentos - o escopo é fechado.
- **Rápida Atualização:** Precisa mudar a regra da corretora? Basta atualizar um dos Prompts — não requer push de código no backend.
