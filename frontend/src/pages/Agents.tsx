import { useEffect, useState } from 'react'
import { agentsAPI } from '../services/api'

const MODELS_COMMON = [
  'openai/gpt-4o', 'openai/gpt-4o-mini', 'openai/gpt-4-turbo',
  'anthropic/claude-3.5-sonnet', 'anthropic/claude-3-haiku',
  'google/gemini-pro-1.5', 'mistralai/mistral-large',
  'meta-llama/llama-3.1-70b-instruct',
]

export default function Agents() {
  const [agents, setAgents] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState<string | null>(null)
  const [form, setForm] = useState<any>({})
  const [saving, setSaving] = useState(false)

  useEffect(() => { load() }, [])

  const load = async () => {
    setLoading(true)
    const { data } = await agentsAPI.list()
    setAgents(data)
    setLoading(false)
  }

  const startEdit = (agent: any) => {
    setEditing(agent.slug)
    setForm({ model: agent.model, temperature: agent.temperature, max_tokens: agent.max_tokens, top_p: agent.top_p })
  }

  const saveAgent = async (slug: string) => {
    setSaving(true)
    await agentsAPI.update(slug, form)
    await load()
    setEditing(null)
    setSaving(false)
  }

  const toggleAgent = async (slug: string, current: boolean) => {
    await agentsAPI.toggle(slug, !current)
    load()
  }

  if (loading) return <div className="loading-center"><div className="spinner-lg spinner" /></div>

  return (
    <div className="page-container">
      <div className="page-header">
        <div>
          <h1 className="page-header-title">Agentes de IA</h1>
          <p className="page-header-sub">Gestão de modelos e parâmetros inteligentes</p>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: '18px' }}>
        {agents.filter(a => a.slug !== 'supervisor').map((agent) => (
          <div key={agent.slug} className="card" style={{ opacity: agent.is_active ? 1 : 0.65 }}>
            <div className="card-header">
              <div className="flex items-center gap-3">
                <div className="agent-emoji" style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', width: 40, height: 40 }}>
                  {agent.emoji}
                </div>
                <div>
                  <div style={{ fontWeight: 700 }}>{agent.name}</div>
                  <code style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>{agent.slug}</code>
                </div>
              </div>
              <label className="toggle">
                <input type="checkbox" checked={agent.is_active} onChange={() => toggleAgent(agent.slug, agent.is_active)} />
                <div className="toggle-track" />
                <div className="toggle-thumb" />
              </label>
            </div>

            <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <p className="text-sm text-muted">{agent.description}</p>

              {editing === agent.slug ? (
                <>
                  <div className="form-group">
                    <label className="form-label">Modelo OpenRouter</label>
                    <select className="form-select" value={form.model} onChange={e => setForm((f: any) => ({ ...f, model: e.target.value }))}>
                      {MODELS_COMMON.map(m => <option key={m} value={m}>{m}</option>)}
                    </select>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <label className="form-label">Temperatura: <strong style={{ color: 'var(--accent)' }}>{form.temperature}</strong></label>
                    <span className="text-xs text-muted">(0 = preciso | 1.5 = criativo)</span>
                  </div>
                  <input type="range" min="0" max="1.5" step="0.1" value={form.temperature} onChange={e => setForm((f: any) => ({ ...f, temperature: Number(e.target.value) }))} />

                  <div className="form-group">
                    <label className="form-label">Max Tokens: <strong style={{ color: 'var(--accent)' }}>{form.max_tokens}</strong></label>
                    <input type="range" min="256" max="8192" step="256" value={form.max_tokens} onChange={e => setForm((f: any) => ({ ...f, max_tokens: Number(e.target.value) }))} />
                  </div>

                  <div className="flex gap-2 mt-2">
                    <button className="btn btn-primary btn-sm" onClick={() => saveAgent(agent.slug)} disabled={saving}>
                      {saving ? <div className="spinner" /> : '💾 Salvar'}
                    </button>
                    <button className="btn btn-ghost btn-sm" onClick={() => setEditing(null)}>Cancelar</button>
                  </div>
                </>
              ) : (
                <>
                  <div className="agent-model">{agent.model}</div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px', padding: '12px 0', borderTop: '1px solid var(--border)' }}>
                    <div style={{ textAlign: 'center' }}>
                      <div style={{ fontWeight: 700, color: '#FFFFFF' }}>{agent.temperature}</div>
                      <div className="text-xs text-muted">temperatura</div>
                    </div>
                    <div style={{ textAlign: 'center' }}>
                      <div style={{ fontWeight: 700 }}>{agent.max_tokens}</div>
                      <div className="text-xs text-muted">max tokens</div>
                    </div>
                    <div style={{ textAlign: 'center' }}>
                      <div style={{ fontWeight: 700 }}>{agent.total_calls}</div>
                      <div className="text-xs text-muted">chamadas</div>
                    </div>
                  </div>
                  <button className="btn btn-secondary btn-sm" style={{ width: '100%', justifyContent: 'center' }} onClick={() => startEdit(agent)}>
                    Configurar
                  </button>
                </>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
