import { useEffect, useState } from 'react'
import { Save, Play, History, RotateCcw } from 'lucide-react'
import { promptsAPI, agentsAPI } from '../services/api'

interface Prompt { id: number; agent_slug: string; version: number; is_active: boolean; system_prompt: string; notes?: string; updated_at: string }
interface Agent { slug: string; name: string; emoji: string; color: string }

export default function Prompts() {
  const [agents, setAgents] = useState<Agent[]>([])
  const [prompts, setPrompts] = useState<Record<string, Prompt>>({})
  const [selected, setSelected] = useState<string>('')
  const [editedPrompt, setEditedPrompt] = useState('')
  const [notes, setNotes] = useState('')
  const [testMsg, setTestMsg] = useState('')
  const [testResult, setTestResult] = useState('')
  const [testing, setTesting] = useState(false)
  const [saving, setSaving] = useState(false)
  const [history, setHistory] = useState<Prompt[]>([])
  const [showHistory, setShowHistory] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => { loadAll() }, [])

  const loadAll = async () => {
    setLoading(true)
    const [agentsRes, promptsRes] = await Promise.all([agentsAPI.list(), promptsAPI.list()])
    const visibleAgents = agentsRes.data.filter((a: Agent) => a.slug !== 'supervisor')
    setAgents(visibleAgents)
    const promptMap: Record<string, Prompt> = {}
    promptsRes.data.forEach((p: Prompt) => { promptMap[p.agent_slug] = p })
    setPrompts(promptMap)
    if (visibleAgents.length > 0) {
      const first = visibleAgents[0].slug
      setSelected(first)
      setEditedPrompt(promptMap[first]?.system_prompt || '')
      setNotes(promptMap[first]?.notes || '')
    }
    setLoading(false)
  }

  const selectAgent = (slug: string) => {
    setSelected(slug)
    setEditedPrompt(prompts[slug]?.system_prompt || '')
    setNotes(prompts[slug]?.notes || '')
    setTestResult('')
    setShowHistory(false)
  }

  const savePrompt = async () => {
    setSaving(true)
    await promptsAPI.update(selected, { system_prompt: editedPrompt, notes })
    await loadAll()
    setSaving(false)
  }

  const testPrompt = async () => {
    if (!testMsg.trim()) return
    setTesting(true)
    setTestResult('')
    const res = await promptsAPI.test(selected, { system_prompt: editedPrompt, user_message: testMsg })
    setTestResult(res.data.success ? res.data.response : `Erro: ${res.data.error}`)
    setTesting(false)
  }

  const loadHistory = async () => {
    const res = await promptsAPI.history(selected)
    setHistory(res.data)
    setShowHistory(true)
  }

  const restoreVersion = (prompt: Prompt) => {
    setEditedPrompt(prompt.system_prompt)
    setShowHistory(false)
  }

  const hasChanges = prompts[selected]?.system_prompt !== editedPrompt

  if (loading) return <div className="loading-center"><div className="spinner-lg spinner" /></div>

  return (
    <div className="page-container">
      <div className="page-header">
        <div>
          <h1 className="page-header-title">🎛️ Editor de Prompts</h1>
          <p className="page-header-sub">Configure o comportamento e personalidade de cada agente</p>
        </div>
      </div>

      {/* Agent Selector */}
      <div className="prompt-agent-selector">
        {agents.map((agent) => (
          <button key={agent.slug} className={`prompt-agent-btn ${selected === agent.slug ? 'selected' : ''}`} onClick={() => selectAgent(agent.slug)}>
            <span className="emoji">{agent.emoji}</span>
            <div>
              <div className="name">{agent.name}</div>
              <div className="text-xs text-muted">v{prompts[agent.slug]?.version || 1}</div>
            </div>
          </button>
        ))}
      </div>

      {/* Editor */}
      {selected && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
          {/* Left: editor */}
          <div className="card">
            <div className="card-header">
              <div>
                <span className="card-title">
                  {agents.find(a => a.slug === selected)?.emoji}{' '}
                  System Prompt — {agents.find(a => a.slug === selected)?.name}
                </span>
                <div className="text-xs text-muted mt-1">
                  Versão {prompts[selected]?.version || 1}
                  {prompts[selected]?.updated_at && ` · Editado ${new Date(prompts[selected].updated_at).toLocaleDateString('pt-BR')}`}
                </div>
              </div>
              <div className="flex gap-2">
                <button className="btn btn-ghost btn-sm" onClick={loadHistory} title="Histórico de versões">
                  <History size={15} />
                </button>
                <button className="btn btn-primary btn-sm" onClick={savePrompt} disabled={saving || !hasChanges}>
                  {saving ? <div className="spinner" /> : <><Save size={14} /> Salvar</>}
                </button>
              </div>
            </div>
            <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {hasChanges && (
                <div style={{ background: 'var(--warning-dim)', border: '1px solid rgba(245,158,11,0.3)', borderRadius: 'var(--radius-sm)', padding: '8px 12px', fontSize: '0.78rem', color: 'var(--warning)' }}>
                  ⚠️ Alterações não salvas. Clique em "Salvar" para criar uma nova versão.
                </div>
              )}
              <textarea
                className="form-textarea code-editor"
                value={editedPrompt}
                onChange={(e) => setEditedPrompt(e.target.value)}
                style={{ minHeight: '380px', fontSize: '0.82rem' }}
                placeholder="Digite o system prompt aqui..."
              />
              <div className="form-group">
                <label className="form-label">Notas (não enviadas ao modelo)</label>
                <textarea className="form-textarea" value={notes} onChange={e => setNotes(e.target.value)} rows={2} placeholder="Observações sobre este prompt..." />
              </div>
            </div>
          </div>

          {/* Right: test */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            {/* Tester */}
            <div className="card">
              <div className="card-header">
                <span className="card-title">🧪 Testar Prompt</span>
              </div>
              <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <div className="form-group">
                  <label className="form-label">Mensagem de teste</label>
                  <textarea
                    className="form-textarea"
                    value={testMsg}
                    onChange={e => setTestMsg(e.target.value)}
                    placeholder="Digite uma mensagem para testar o prompt..."
                    rows={3}
                  />
                </div>
                <button className="btn btn-secondary" onClick={testPrompt} disabled={testing || !testMsg.trim()}>
                  {testing ? <><div className="spinner" /> Testando...</> : <><Play size={14} /> Executar Teste</>}
                </button>
                {testResult && (
                  <div>
                    <label className="form-label" style={{ marginBottom: '6px', display: 'block' }}>Resposta do Agente:</label>
                    <div className="prompt-test-result">{testResult}</div>
                  </div>
                )}
              </div>
            </div>

            {/* History */}
            {showHistory && (
              <div className="card">
                <div className="card-header">
                  <span className="card-title">📋 Histórico de Versões</span>
                  <button className="btn btn-ghost btn-sm" onClick={() => setShowHistory(false)}>✕</button>
                </div>
                <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '320px', overflowY: 'auto' }}>
                  {history.map((h) => (
                    <div key={h.id} style={{ padding: '10px', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', background: h.is_active ? 'var(--accent-dim)' : 'var(--bg-elevated)' }}>
                      <div className="flex items-center justify-between">
                        <div>
                          <span style={{ fontWeight: 600, fontSize: '0.82rem' }}>Versão {h.version}</span>
                          {h.is_active && <span className="badge badge-success" style={{ marginLeft: '8px' }}>atual</span>}
                        </div>
                        <div className="text-xs text-muted">{new Date(h.updated_at).toLocaleDateString('pt-BR')}</div>
                      </div>
                      <div className="text-xs text-muted mt-1" style={{ fontFamily: 'monospace' }}>
                        {h.system_prompt.substring(0, 100)}...
                      </div>
                      {!h.is_active && (
                        <button className="btn btn-ghost btn-sm mt-2" onClick={() => restoreVersion(h)}>
                          <RotateCcw size={12} /> Restaurar
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
