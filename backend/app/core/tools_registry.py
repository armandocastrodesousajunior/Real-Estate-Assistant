from typing import List, Dict

INTERNAL_TOOLS = {
    "leads": [
        {
            "slug": "consultar_lead",
            "name": "Consultar Lead",
            "description": "Busca um lead pelo ID, telefone ou e-mail e retorna todos os dados cadastrais, histórico de interações e status atual.",
            "prompt": "Para consultar um lead, informe o 'id', 'email' ou 'phone'. O sistema retornará o objeto completo do lead."
        },
        {
            "slug": "criar_lead",
            "name": "Criar Lead",
            "description": "Cria um novo lead com nome, telefone, e-mail, origem e estágio inicial no funil.",
            "prompt": "Parâmetros obrigatórios: 'name' e ('phone' ou 'email'). Parâmetros opcionais: 'source', 'status'."
        },
        {
            "slug": "editar_lead",
            "name": "Editar Lead",
            "description": "Atualiza campos específicos de um lead existente (nome, telefone, e-mail, estágio, tags, observações).",
            "prompt": "Informe o 'id' do lead e os campos que deseja alterar no JSON de saída."
        },
        {
            "slug": "deletar_lead",
            "name": "Deletar Lead",
            "description": "Remove permanentemente um lead pelo ID.",
            "prompt": "Informe apenas o 'id' do lead a ser removido."
        },
        {
            "slug": "listar_leads",
            "name": "Listar Leads",
            "description": "Retorna lista paginada de leads com filtros por status, estágio, origem e data de criação.",
            "prompt": "Filtros opcionais: 'status', 'source', 'page', 'page_size'."
        },
        {
            "slug": "mover_lead_funil",
            "name": "Mover Lead no Funil",
            "description": "Altera o estágio do lead dentro do funil de vendas (ex: contato -> qualificado -> proposta -> fechado).",
            "prompt": "Informe o 'id' do lead e o novo 'status'."
        },
        {
            "slug": "adicionar_obs_lead",
            "name": "Adicionar Observação ao Lead",
            "description": "Insere uma nota interna no histórico do lead sem alterar outros campos.",
            "prompt": "Informe o 'id' do lead e o texto da 'observation'."
        }
    ],
    "sessions": [
        {
            "slug": "consultar_sessao",
            "name": "Consultar Sessão",
            "description": "Retorna dados completos de uma sessão pelo ID, incluindo histórico de mensagens e status atual.",
            "prompt": "Informe o 'session_id'."
        },
        {
            "slug": "listar_sessoes",
            "name": "Listar Sessões",
            "description": "Retorna sessões filtradas por agente, lead, status (open, closed, pending) e intervalo de datas.",
            "prompt": "Filtros opcionais: 'agent_slug', 'status', 'limit'."
        },
        {
            "slug": "alterar_status_sessao",
            "name": "Alterar Status da Sessão",
            "description": "Atualiza a coluna status na tabela de sessões para open, closed ou pending.",
            "prompt": "Informe 'session_id' e o novo 'status'."
        },
        {
            "slug": "encerrar_sessao",
            "name": "Encerrar Sessão",
            "description": "Define status como closed e registra timestamp de encerramento.",
            "prompt": "Informe o 'session_id' para encerrar a conversa."
        },
        {
            "slug": "transferir_sessao",
            "name": "Transferir Sessão",
            "description": "Reatribui uma sessão a outro agente, atualizando o vínculo no banco.",
            "prompt": "Informe 'session_id' e o 'target_agent_slug'."
        }
    ],
    "properties": [
        {
            "slug": "consultar_imovel",
            "name": "Consultar Imóvel",
            "description": "Busca um imóvel pelo ID ou código de referência e retorna todos os dados cadastrais.",
            "prompt": "Informe 'id' ou 'code'."
        },
        {
            "slug": "listar_imoveis",
            "name": "Listar Imóveis",
            "description": "Retorna imóveis com filtros por tipo, faixa de preço, localização, área e disponibilidade.",
            "prompt": "Filtros: 'type', 'min_price', 'max_price', 'city', 'neighborhood'."
        },
        {
            "slug": "consultar_disponibilidade",
            "name": "Consultar Disponibilidade",
            "description": "Verifica se um imóvel específico está disponível para venda ou locação.",
            "prompt": "Informe o 'id' do imóvel."
        },
        {
            "slug": "buscar_imoveis_perfil",
            "name": "Buscar Imóveis por Perfil",
            "description": "Recebe critérios do lead (orçamento, localização, tipo, metragem) e retorna imóveis compatíveis.",
            "prompt": "Informe um objeto 'profile' com as preferências do cliente."
        },
        {
            "slug": "vincular_imovel_lead",
            "name": "Vincular Imóvel ao Lead",
            "description": "Associa um ou mais imóveis de interesse ao cadastro do lead.",
            "prompt": "Informe 'lead_id' e 'property_ids' (lista)."
        }
    ]
}

def get_all_internal_tools() -> List[Dict]:
    all_tools = []
    for category in INTERNAL_TOOLS.values():
        for tool in category:
            tool_copy = tool.copy()
            tool_copy["type"] = "internal"
            all_tools.append(tool_copy)
    return all_tools

def get_tool_by_slug(slug: str) -> Dict:
    for tool in get_all_internal_tools():
        if tool["slug"] == slug:
            return tool
    return None

def format_tools_for_prompt(tools: List[Dict]) -> str:
    if not tools:
        return "_Você não possui nenhuma ferramenta de automação atribuída no momento._"
    
    prompt = ""
    for t in tools:
        prompt += f"### Tool: {t['slug']}\n"
        prompt += f"**Descrição:** {t['description']}\n"
        prompt += f"**Como usar:** {t['prompt']}\n\n"
        
    return prompt
