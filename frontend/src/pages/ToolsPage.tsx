import { useEffect, useState } from 'react'
import { 
  Wrench, Plus, Trash2, Link, Link2Off, 
  Search, ShieldCheck, Zap, Info, Play, ExternalLink
} from 'lucide-react'
import { toolsAPI, agentsAPI } from '../services/api'

interface Tool {
  slug: string
  name: string
  description: string
  prompt: string
  type: string // internal/external
  is_active: boolean
}

interface Agent {
  slug: string
  name: string
  emoji: string
}

export default function ToolsPage() {
  const [tools, setTools] = useState<Tool[]>([])
  const [agents, setAgents] = useState<Agent[]>([])
  const [searchTerm, setSearchTerm] = useState('')
  
  // Selection
  const [selectedTool, setSelectedTool] = useState<Tool | null>(null)
  const [linkedAgents, setLinkedAgents] = useState<string[]>([])
  
  // Modals
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false)
  const [newTool, setNewTool] = useState({ slug: '', name: '', description: '', prompt: '', type: 'external' })
  const [isLinking, setIsLinking] = useState(false)

  // Sandbox
  const [sandboxResult, setSandboxResult] = useState<any>(null)

  useEffect(() => {
    loadData()
  }, [])

  const loadData = async () => {
    try {
      const [toolsRes, agentsRes] = await Promise.all([
        toolsAPI.list(),
        agentsAPI.list()
      ])
      setTools(toolsRes.data)
      setAgents(agentsRes.data.filter((a: any) => a.slug !== 'supervisor'))
    } catch (err) {
      console.error('Erro ao carregar ferramentas:', err)
    }
  }

  const handleSelectTool = async (tool: Tool) => {
    setSelectedTool(tool)
    setSandboxResult(null)
    try {
      const { data } = await toolsAPI.listAgentTools(tool.slug)
      // Note: Backend returns agent_slugs linked to this tool? 
      // Actually my backend router list_agent_tools(agent_slug) returns tool_slugs.
      // I need an endpoint to get agents by tool or just filter locally.
      // Let's modify the backend search or just do it for all agents.
      const links: string[] = []
      for (const agent of agents) {
        const res = await toolsAPI.listAgentTools(agent.slug)
        if (res.data.includes(tool.slug)) {
          links.push(agent.slug)
        }
      }
      setLinkedAgents(links)
    } catch (err) {
      console.error('Erro ao carregar vínculos:', err)
    }
  }

  const toggleLink = async (agentSlug: string) => {
    if (!selectedTool) return
    setIsLinking(true)
    const isLinked = linkedAgents.includes(agentSlug)
    try {
      if (isLinked) {
        await toolsAPI.unlink(agentSlug, selectedTool.slug)
        setLinkedAgents(prev => prev.filter(s => s !== agentSlug))
      } else {
        await toolsAPI.link(agentSlug, selectedTool.slug)
        setLinkedAgents(prev => [...prev, agentSlug])
      }
    } catch (err) {
      alert('Erro ao alterar vínculo.')
    } finally {
      setIsLinking(false)
    }
  }

  const handleCreateTool = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      await toolsAPI.create(newTool)
      setIsCreateModalOpen(false)
      setNewTool({ slug: '', name: '', description: '', prompt: '', type: 'external' })
      loadData()
    } catch (err: any) {
      alert(err.response?.data?.detail || 'Erro ao criar ferramenta.')
    }
  }

  const handleDeleteTool = async (slug: string) => {
    if (!confirm('Excluir esta ferramenta externa permanentemente?')) return
    try {
      await toolsAPI.delete(slug)
      if (selectedTool?.slug === slug) setSelectedTool(null)
      loadData()
    } catch (err) {
      alert('Erro ao excluir.')
    }
  }

  const runSandbox = () => {
    // Simulação local de como o prompt ficaria
    if (!selectedTool) return
    setSandboxResult({
      status: 'simulated',
      injected_prompt: `### Tool: ${selectedTool.slug}\n**Descrição:** ${selectedTool.description}\n**Como usar:** ${selectedTool.prompt}`,
      instruction: "Este é o bloco de texto que será injetado no System Prompt dos agentes vinculados."
    })
  }

  const filteredTools = tools.filter(t => 
    t.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
    t.slug.toLowerCase().includes(searchTerm.toLowerCase())
  )

  const toolsByCategory = {
    internal: filteredTools.filter(t => t.type === 'internal'),
    external: filteredTools.filter(t => t.type === 'external'),
  }

  return (
    <div className="tools-layout">
      {/* Sidebar List */}
      <div className="tools-sidebar">
        <div className="tools-sidebar-header">
          <div className="flex items-center gap-2 mb-4">
            <Wrench size={18} className="text-primary" />
            <h1 className="text-lg font-bold">Ferramentas</h1>
          </div>
          
          <div className="search-box mb-4">
            <Search size={14} className="search-icon" />
            <input 
              type="text" 
              placeholder="Buscar ferramenta..." 
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
            />
          </div>

          <button className="btn btn-primary w-full gap-2" onClick={() => setIsCreateModalOpen(true)}>
            <Plus size={14} /> Nova Ferramenta
          </button>
        </div>

        <div className="tools-list-scroll">
          {['internal', 'external'].map(cat => (
            <div key={cat} className="tool-category-section">
              <div className="category-title">{cat === 'internal' ? 'Nativas (MCP)' : 'Externas'}</div>
              {toolsByCategory[cat as keyof typeof toolsByCategory].map(t => (
                <div 
                  key={t.slug} 
                  className={`tool-item ${selectedTool?.slug === t.slug ? 'active' : ''}`}
                  onClick={() => handleSelectTool(t)}
                >
                  <div className={`tool-icon-mini ${t.type}`}>
                    {t.type === 'internal' ? <ShieldCheck size={12} /> : <Zap size={12} />}
                  </div>
                  <div className="tool-info-mini">
                    <div className="name">{t.name}</div>
                    <div className="slug">{t.slug}</div>
                  </div>
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>

      {/* Main Content */}
      <div className="tools-main">
        {selectedTool ? (
          <div className="tool-details-container">
            <header className="tool-details-header">
              <div className="flex items-center gap-4">
                <div className={`tool-badge ${selectedTool.type}`}>
                  {selectedTool.type === 'internal' ? 'INTERNA' : 'EXTERNA'}
                </div>
                <h2 className="text-2xl font-bold">{selectedTool.name}</h2>
              </div>
              
              {selectedTool.type === 'external' && (
                <button className="btn btn-danger btn-sm" onClick={() => handleDeleteTool(selectedTool.slug)}>
                  <Trash2 size={14} /> Excluir
                </button>
              )}
            </header>

            <div className="tool-grid">
              {/* Info Section */}
              <div className="tool-info-panel">
                <section className="detail-section">
                  <label><Info size={14} /> Descrição</label>
                  <p className="text-muted text-sm leading-relaxed">{selectedTool.description}</p>
                </section>

                <section className="detail-section">
                  <label><ExternalLink size={14} /> Instrução para o Agente (Prompt)</label>
                  <div className="prompt-preview-box">
                    {selectedTool.prompt}
                  </div>
                </section>

                <section className="detail-section">
                  <label><Play size={14} /> Sandbox / Teste</label>
                  <div className="sandbox-box">
                    <p className="text-[10px] text-muted uppercase mb-2">Simular injeção no prompt</p>
                    <button className="btn btn-secondary btn-sm w-full" onClick={runSandbox}>
                      Executar Simulação
                    </button>
                    {sandboxResult && (
                      <div className="sandbox-result mt-3">
                        <pre>{sandboxResult.injected_prompt}</pre>
                      </div>
                    )}
                  </div>
                </section>
              </div>

              {/* Assignment Section */}
              <div className="tool-assignment-panel">
                <div className="panel-card">
                  <div className="panel-card-header">
                    <Link size={16} className="text-primary" />
                    <span>Agentes Vinculados</span>
                  </div>
                  <div className="agents-link-list">
                    {agents.map(a => {
                      const isLinked = linkedAgents.includes(a.slug)
                      return (
                        <div key={a.slug} className={`agent-link-item ${isLinked ? 'linked' : ''}`}>
                          <div className="agent-link-info">
                            <span className="emoji">{a.emoji}</span>
                            <span className="name">{a.name}</span>
                          </div>
                          <button 
                            className={`btn-link-toggle ${isLinked ? 'active' : ''}`}
                            onClick={() => toggleLink(a.slug)}
                            disabled={isLinking}
                          >
                            {isLinked ? <Link2Off size={14} /> : <Link size={14} />}
                            {isLinked ? 'Desvincular' : 'Vincular'}
                          </button>
                        </div>
                      )
                    })}
                  </div>
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="tools-empty-state">
            <div className="empty-icon"><Wrench size={48} /></div>
            <h3>Gerencie suas Ferramentas</h3>
            <p>Selecione uma ferramenta na lista lateral para configurar permissões ou testar o prompt de injeção.</p>
          </div>
        )}
      </div>

      {/* Create Modal */}
      {isCreateModalOpen && (
        <div className="modal-overlay">
          <div className="modal-content max-w-lg">
            <h2 className="text-xl font-bold mb-6">Cadastrar Ferramenta Externa</h2>
            <form onSubmit={handleCreateTool} className="space-y-4">
              <div>
                <label className="config-label">Nome</label>
                <input 
                  type="text" className="form-input w-full" placeholder="Ex: Calculadora de Impostos"
                  value={newTool.name} onChange={e => setNewTool({...newTool, name: e.target.value})} required
                />
              </div>
              <div>
                <label className="config-label">Slug (único)</label>
                <input 
                  type="text" className="form-input w-full" placeholder="ex: calc_impostos"
                  value={newTool.slug} onChange={e => setNewTool({...newTool, slug: e.target.value.toLowerCase().replace(/\s+/g, '_')})} required
                />
              </div>
              <div>
                <label className="config-label">Descrição (para humanos)</label>
                <textarea 
                  className="form-input w-full h-20" placeholder="O que esta ferramenta faz?"
                  value={newTool.description} onChange={e => setNewTool({...newTool, description: e.target.value})}
                />
              </div>
              <div>
                <label className="config-label">Prompt de Uso (para a IA)</label>
                <textarea 
                  className="form-input w-full h-32 font-mono text-xs" 
                  placeholder="Instrua a IA sobre como e quando usar esta ferramenta..."
                  value={newTool.prompt} onChange={e => setNewTool({...newTool, prompt: e.target.value})} required
                />
              </div>
              <div className="flex gap-3 pt-4">
                <button type="button" className="btn btn-secondary flex-1" onClick={() => setIsCreateModalOpen(false)}>Cancelar</button>
                <button type="submit" className="btn btn-primary flex-1">Criar Ferramenta</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
