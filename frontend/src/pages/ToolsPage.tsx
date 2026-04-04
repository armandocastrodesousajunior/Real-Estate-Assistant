import { useEffect, useState } from 'react'
import { Wrench, Plus, Trash2, Link, Link2Off, Search, ShieldCheck, Zap, Info, Play, ExternalLink, X } from 'lucide-react'
import { toolsAPI, agentsAPI } from '../services/api'

interface Tool { slug: string; name: string; description: string; prompt: string; type: string; is_active: boolean }
interface Agent { slug: string; name: string; emoji: string }

export default function ToolsPage() {
  const [tools, setTools] = useState<Tool[]>([])
  const [agents, setAgents] = useState<Agent[]>([])
  const [searchTerm, setSearchTerm] = useState('')
  const [selectedTool, setSelectedTool] = useState<Tool | null>(null)
  const [linkedAgents, setLinkedAgents] = useState<string[]>([])
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false)
  const [newTool, setNewTool] = useState({ slug: '', name: '', description: '', prompt: '', type: 'external' })
  const [isLinking, setIsLinking] = useState(false)
  const [sandboxResult, setSandboxResult] = useState<any>(null)

  useEffect(() => { loadData() }, [])

  const loadData = async () => {
    try {
      const [toolsRes, agentsRes] = await Promise.all([toolsAPI.list(), agentsAPI.list()])
      setTools(toolsRes.data)
      setAgents(agentsRes.data.filter((a: any) => a.slug !== 'supervisor'))
    } catch (err) { console.error(err) }
  }

  const handleSelectTool = async (tool: Tool) => {
    setSelectedTool(tool)
    setSandboxResult(null)
    const links: string[] = []
    for (const agent of agents) {
      const res = await toolsAPI.listAgentTools(agent.slug)
      if (res.data.includes(tool.slug)) links.push(agent.slug)
    }
    setLinkedAgents(links)
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
    } catch { alert('Erro ao alterar vínculo.') } finally { setIsLinking(false) }
  }

  const handleCreateTool = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      await toolsAPI.create(newTool)
      setIsCreateModalOpen(false)
      setNewTool({ slug: '', name: '', description: '', prompt: '', type: 'external' })
      loadData()
    } catch (err: any) { alert(err.response?.data?.detail || 'Erro ao criar ferramenta.') }
  }

  const handleDeleteTool = async (slug: string) => {
    if (!confirm('Excluir esta ferramenta permanentemente?')) return
    try {
      await toolsAPI.delete(slug)
      if (selectedTool?.slug === slug) setSelectedTool(null)
      loadData()
    } catch { alert('Erro ao excluir.') }
  }

  const filteredTools = tools.filter(t => t.name.toLowerCase().includes(searchTerm.toLowerCase()) || t.slug.toLowerCase().includes(searchTerm.toLowerCase()))
  const toolsByCategory = { internal: filteredTools.filter(t => t.type === 'internal'), external: filteredTools.filter(t => t.type === 'external') }

  return (
    <div className="tools-layout">
      {/* Sidebar */}
      <div className="tools-sidebar">
        <div className="tools-sidebar-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '14px' }}>
            <Wrench size={18} style={{ color: 'var(--accent)' }} />
            <h1 style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: '1rem', color: 'var(--text-primary)' }}>Ferramentas</h1>
          </div>
          <div className="search-box" style={{ marginBottom: '12px' }}>
            <Search size={14} className="search-icon" />
            <input type="text" placeholder="Buscar ferramenta..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} />
          </div>
          <button className="btn btn-primary w-full gap-2" style={{ justifyContent: 'center' }} onClick={() => setIsCreateModalOpen(true)}>
            <Plus size={14} /> Nova Ferramenta
          </button>
        </div>

        <div className="tools-list-scroll">
          {(['internal', 'external'] as const).map(cat => (
            <div key={cat} className="tool-category-section">
              <div className="category-title">{cat === 'internal' ? '🛡️ Nativas (MCP)' : '⚡ Externas'}</div>
              {toolsByCategory[cat].map(t => (
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
              {toolsByCategory[cat].length === 0 && (
                <div style={{ padding: '8px 10px', fontSize: '0.75rem', color: 'var(--text-muted)', fontStyle: 'italic' }}>Nenhuma</div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Main */}
      <div className="tools-main">
        {selectedTool ? (
          <div className="tool-details-container">
            <div className="tool-details-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                <span className={`tool-badge ${selectedTool.type}`}>{selectedTool.type === 'internal' ? 'INTERNA' : 'EXTERNA'}</span>
                <h2 style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: '1.4rem', color: 'var(--text-primary)' }}>{selectedTool.name}</h2>
              </div>
              {selectedTool.type === 'external' && (
                <button className="btn btn-danger btn-sm" onClick={() => handleDeleteTool(selectedTool.slug)}>
                  <Trash2 size={14} /> Excluir
                </button>
              )}
            </div>

            <div className="tool-grid">
              <div>
                <div className="detail-section">
                  <label><Info size={14} /> Descrição</label>
                  <p style={{ fontSize: '0.875rem', color: 'var(--text-secondary)', lineHeight: 1.7 }}>{selectedTool.description || '—'}</p>
                </div>
                <div className="detail-section">
                  <label><ExternalLink size={14} /> Instrução para o Agente (Prompt)</label>
                  <div className="prompt-preview-box">{selectedTool.prompt || '—'}</div>
                </div>
                <div className="detail-section">
                  <label><Play size={14} /> Sandbox / Simulação</label>
                  <div className="sandbox-box">
                    <p style={{ fontSize: '0.76rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '10px' }}>
                      Simular injeção no prompt do agente
                    </p>
                    <button className="btn btn-secondary btn-sm w-full" style={{ justifyContent: 'center' }} onClick={() => setSandboxResult({ injected_prompt: `### Tool: ${selectedTool.slug}\n**Descrição:** ${selectedTool.description}\n**Como usar:** ${selectedTool.prompt}` })}>
                      Executar Simulação
                    </button>
                    {sandboxResult && (
                      <div className="sandbox-result" style={{ marginTop: '12px' }}>
                        <pre>{sandboxResult.injected_prompt}</pre>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              <div>
                <div className="panel-card">
                  <div className="panel-card-header">
                    <Link size={15} style={{ color: 'var(--accent)' }} /> Agentes Vinculados
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
                            {isLinked ? <Link2Off size={13} /> : <Link size={13} />}
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
            <div style={{ width: 72, height: 72, borderRadius: 'var(--radius-xl)', background: 'var(--bg-card)', border: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center', animation: 'float 3s ease-in-out infinite' }}>
              <Wrench size={32} style={{ color: 'var(--text-muted)' }} />
            </div>
            <h3>Gerencie suas Ferramentas</h3>
            <p>Selecione uma ferramenta na lista lateral para configurar permissões ou testar o prompt.</p>
          </div>
        )}
      </div>

      {/* Create Modal */}
      {isCreateModalOpen && (
        <div className="modal-overlay" onClick={() => setIsCreateModalOpen(false)}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '24px' }}>
              <div>
                <h2 style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: '1.2rem', color: 'var(--text-primary)' }}>Cadastrar Ferramenta Externa</h2>
                <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: '3px' }}>Instrua os agentes sobre como usar esta ferramenta</p>
              </div>
              <button className="btn btn-ghost btn-sm" onClick={() => setIsCreateModalOpen(false)} style={{ padding: '6px' }}><X size={18} /></button>
            </div>
            <form onSubmit={handleCreateTool} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div className="form-group">
                <label className="form-label">Nome</label>
                <input type="text" className="form-input" placeholder="Ex: Calculadora de Impostos" value={newTool.name} onChange={e => setNewTool({ ...newTool, name: e.target.value })} required />
              </div>
              <div className="form-group">
                <label className="form-label">Slug (único)</label>
                <input type="text" className="form-input" placeholder="ex: calc_impostos" value={newTool.slug} onChange={e => setNewTool({ ...newTool, slug: e.target.value.toLowerCase().replace(/\s+/g, '_') })} required />
              </div>
              <div className="form-group">
                <label className="form-label">Descrição (para humanos)</label>
                <textarea className="form-textarea" style={{ minHeight: '70px' }} placeholder="O que esta ferramenta faz?" value={newTool.description} onChange={e => setNewTool({ ...newTool, description: e.target.value })} />
              </div>
              <div className="form-group">
                <label className="form-label">Prompt de Uso (para a IA)</label>
                <textarea className="form-textarea" style={{ minHeight: '100px', fontFamily: 'var(--font-mono)', fontSize: '0.78rem' }} placeholder="Instrua a IA sobre como e quando usar esta ferramenta..." value={newTool.prompt} onChange={e => setNewTool({ ...newTool, prompt: e.target.value })} required />
              </div>
              <div style={{ display: 'flex', gap: '10px', marginTop: '8px' }}>
                <button type="button" className="btn btn-ghost" style={{ flex: 1, justifyContent: 'center' }} onClick={() => setIsCreateModalOpen(false)}>Cancelar</button>
                <button type="submit" className="btn btn-primary" style={{ flex: 1, justifyContent: 'center' }}>Criar Ferramenta</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
