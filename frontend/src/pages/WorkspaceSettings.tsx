import { useState, useEffect } from 'react'
import { workspacesAPI, usersAPI } from '../services/api'
import { 
  Building, CheckCircle, Save, Zap, MessageSquare, Cpu, AlertCircle, 
  Info, Sparkles, Sliders
} from 'lucide-react'

export default function WorkspaceSettings() {
  const [profile, setProfile] = useState<any>(null)
  const [workspaces, setWorkspaces] = useState<any[]>([])
  const [currentWsId, setCurrentWsId] = useState<number>(Number(localStorage.getItem('rea_workspace_id')))
  const [loading, setLoading] = useState(true)
  
  const [savingAI, setSavingAI] = useState(false)
  const [aiSuccess, setAiSuccess] = useState(false)

  const [aiConfig, setAiConfig] = useState({
    supervisor_model: '',
    supervisor_temperature: 0.1,
    prompt_assistant_model: '',
    prompt_assistant_temperature: 0.5,
    repair_model: '',
    repair_temperature: 0.1
  })

  useEffect(() => {
    loadData()
  }, [])

  const loadData = async () => {
    setLoading(true)
    try {
      const [uRes, wRes] = await Promise.all([
        usersAPI.me(),
        workspacesAPI.list()
      ])
      setProfile(uRes.data)
      setWorkspaces(wRes.data)
      
      const current = wRes.data.find((w: any) => w.id === currentWsId)
      if (current) {
        // Load details for AI config
        const { data: detail } = await workspacesAPI.getDetail(currentWsId)
        setAiConfig({
          supervisor_model: detail.supervisor_model || '',
          supervisor_temperature: detail.supervisor_temperature ?? 0.1,
          prompt_assistant_model: detail.prompt_assistant_model || '',
          prompt_assistant_temperature: detail.prompt_assistant_temperature ?? 0.5,
          repair_model: detail.repair_model || '',
          repair_temperature: detail.repair_temperature ?? 0.1
        })
      }
    } catch (err) {
      console.error('Failed to load workspace settings', err)
    } finally {
      setLoading(false)
    }
  }

  const handleUpdateAI = async (e: React.FormEvent) => {
    e.preventDefault()
    setSavingAI(true)
    setAiSuccess(false)
    try {
      const data = {
        supervisor_model: aiConfig.supervisor_model || null,
        supervisor_temperature: aiConfig.supervisor_temperature,
        prompt_assistant_model: aiConfig.prompt_assistant_model || null,
        prompt_assistant_temperature: aiConfig.prompt_assistant_temperature,
        repair_model: aiConfig.repair_model || null,
        repair_temperature: aiConfig.repair_temperature
      }
      await workspacesAPI.update(currentWsId, null, data)
      setAiSuccess(true)
      setTimeout(() => setAiSuccess(false), 3000)
    } catch (err) {
      console.error('Failed to update AI config', err)
    } finally {
      setSavingAI(false)
    }
  }

  const OPENROUTER_MODELS = [
    { id: '', name: 'Padrão do Sistema' },
    { id: 'openai/gpt-4o-mini', name: 'GPT-4o Mini' },
    { id: 'openai/gpt-4o', name: 'GPT-4o (Premium)' },
    { id: 'anthropic/claude-3.5-sonnet', name: 'Claude 3.5 Sonnet' },
    { id: 'google/gemini-pro-1.5', name: 'Gemini 1.5 Pro' },
    { id: 'meta-llama/llama-3.1-70b-instruct', name: 'Llama 3.1 70B' },
  ]

  const currentWorkspace = workspaces.find(w => w.id === currentWsId)
  const isOwner = currentWorkspace?.owner_id === profile?.id

  if (loading) return <div className="loading-center"><div className="spinner spinner-lg"></div></div>

  return (
    <div className="space-y-8 pb-20">
      <div className="page-header">
        <div>
          <h1 className="page-header-title">Configurações Gerais</h1>
          <p className="page-header-sub">Gerencie a inteligência e os motores que alimentam seu workspace.</p>
        </div>
        <div className="badge badge-primary">{currentWorkspace?.name}</div>
      </div>

      {/* Basic Settings section removed as per user request */}

      {/* AI Settings */}
      <div className="card">
        <div className="card-header">
          <div className="flex items-center justify-between w-full">
            <div className="card-title flex items-center gap-2">
              <Sparkles size={17} className="text-accent" />
              Cérebros do Sistema (IA Interna)
            </div>
            <div className="badge badge-muted text-[10px]">REQUER CHAVE API</div>
          </div>
        </div>
        <div className="card-body" style={{ padding: '24px' }}>
          {!isOwner ? (
            <div className="empty-state" style={{ padding: '20px' }}>
              <AlertCircle size={32} className="text-muted opacity-50 mb-2" />
              <p className="text-sm">Apenas o proprietário pode alterar os motores de IA.</p>
            </div>
          ) : (
            <form onSubmit={handleUpdateAI} className="space-y-12">
              
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-8" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '24px' }}>
                
                {/* Supervisor */}
                <div className="card premium-card-gradient" style={{ border: '1px solid var(--border)', background: 'var(--bg-card)' }}>
                  <div style={{ padding: '24px' }}>
                    <div className="flex items-start justify-between mb-6">
                      <div className="flex items-center gap-4">
                        <div className="w-12 h-12 rounded-xl bg-primary-dim text-primary flex items-center justify-center" style={{ boxWeight: 'bold', boxShadow: '0 0 20px rgba(99, 102, 241, 0.1)' }}>
                          <Zap size={24} />
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <h4 className="font-bold text-base">Supervisor</h4>
                            <div 
                              className="has-tooltip text-muted hover:text-primary transition-colors"
                              data-explanation="O cérebro principal que decide qual agente deve responder ao usuário e gera títulos automáticos para as conversas."
                            >
                              <Info size={14} />
                            </div>
                          </div>
                          <p className="text-[11px] text-muted">Orquestração e Roteamento</p>
                        </div>
                      </div>
                    </div>

                    <div className="space-y-6">
                      <div className="form-group">
                        <label className="form-label text-[10px] uppercase tracking-wider">Modelo de Inteligência</label>
                        <select 
                          className="form-select"
                          style={{ height: '42px', fontSize: '0.85rem' }}
                          value={aiConfig.supervisor_model}
                          onChange={e => setAiConfig({...aiConfig, supervisor_model: e.target.value})}
                        >
                          {OPENROUTER_MODELS.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
                        </select>
                      </div>
                      
                      <div className="form-group">
                        <div className="flex justify-between items-center mb-2">
                          <label className="form-label text-[10px] uppercase tracking-wider">Criatividade (Temp)</label>
                          <span className="value-badge" style={{ padding: '2px 10px', fontSize: '0.7rem' }}>{aiConfig.supervisor_temperature}</span>
                        </div>
                        <input 
                          type="range" min="0" max="1" step="0.1"
                          style={{ accentColor: 'var(--primary)' }}
                          value={aiConfig.supervisor_temperature}
                          onChange={e => setAiConfig({...aiConfig, supervisor_temperature: parseFloat(e.target.value)})}
                        />
                        <div className="flex justify-between text-[10px] text-muted mt-1 px-1">
                          <span>Preciso</span>
                          <span>Criativo</span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Prompt Assistant */}
                <div className="card premium-card-gradient" style={{ border: '1px solid var(--border)', background: 'var(--bg-card)' }}>
                  <div style={{ padding: '24px' }}>
                    <div className="flex items-start justify-between mb-6">
                      <div className="flex items-center gap-4">
                        <div className="w-12 h-12 rounded-xl bg-success-dim text-success flex items-center justify-center" style={{ boxWeight: 'bold', boxShadow: '0 0 20px rgba(16, 185, 129, 0.1)' }}>
                          <MessageSquare size={24} />
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <h4 className="font-bold text-base">Eng. de Prompts</h4>
                            <div 
                              className="has-tooltip text-muted hover:text-success transition-colors"
                              data-explanation="O especialista que te ajuda a escrever instruções perfeitas para seus agentes, garantindo resultados precisos."
                            >
                              <Info size={14} />
                            </div>
                          </div>
                          <p className="text-[11px] text-muted">Assistente de Configuração</p>
                        </div>
                      </div>
                    </div>

                    <div className="space-y-6">
                      <div className="form-group">
                        <label className="form-label text-[10px] uppercase tracking-wider">Modelo de Inteligência</label>
                        <select 
                          className="form-select"
                          style={{ height: '42px', fontSize: '0.85rem' }}
                          value={aiConfig.prompt_assistant_model}
                          onChange={e => setAiConfig({...aiConfig, prompt_assistant_model: e.target.value})}
                        >
                          {OPENROUTER_MODELS.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
                        </select>
                      </div>
                      
                      <div className="form-group">
                        <div className="flex justify-between items-center mb-2">
                          <label className="form-label text-[10px] uppercase tracking-wider">Criatividade (Temp)</label>
                          <span className="value-badge" style={{ backgroundColor: 'var(--success-dim)', color: 'var(--success)', padding: '2px 10px', fontSize: '0.7rem' }}>{aiConfig.prompt_assistant_temperature}</span>
                        </div>
                        <input 
                          type="range" min="0" max="1" step="0.1"
                          style={{ accentColor: 'var(--success)' }}
                          value={aiConfig.prompt_assistant_temperature}
                          onChange={e => setAiConfig({...aiConfig, prompt_assistant_temperature: parseFloat(e.target.value)})}
                        />
                        <div className="flex justify-between text-[10px] text-muted mt-1 px-1">
                          <span>Preciso</span>
                          <span>Criativo</span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Repair Agent */}
                <div className="card premium-card-gradient" style={{ border: '1px solid var(--border)', background: 'var(--bg-card)' }}>
                  <div style={{ padding: '24px' }}>
                    <div className="flex items-start justify-between mb-6">
                      <div className="flex items-center gap-4">
                        <div className="w-12 h-12 rounded-xl bg-warning-dim text-warning flex items-center justify-center" style={{ boxWeight: 'bold', boxShadow: '0 0 20px rgba(245, 158, 11, 0.1)' }}>
                          <Cpu size={24} />
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <h4 className="font-bold text-base">Reparo JSON</h4>
                            <div 
                              className="has-tooltip text-muted hover:text-warning transition-colors"
                              data-explanation="Garante a estabilidade do sistema corrigindo problemas técnicos e formatação de dados em tempo real."
                            >
                              <Info size={14} />
                            </div>
                          </div>
                          <p className="text-[11px] text-muted">Estabilidade e Formatação</p>
                        </div>
                      </div>
                    </div>

                    <div className="space-y-6">
                      <div className="form-group">
                        <label className="form-label text-[10px] uppercase tracking-wider">Modelo de Inteligência</label>
                        <select 
                          className="form-select"
                          style={{ height: '42px', fontSize: '0.85rem' }}
                          value={aiConfig.repair_model}
                          onChange={e => setAiConfig({...aiConfig, repair_model: e.target.value})}
                        >
                          {OPENROUTER_MODELS.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
                        </select>
                      </div>
                      
                      <div className="form-group">
                        <div className="flex justify-between items-center mb-2">
                          <label className="form-label text-[10px] uppercase tracking-wider">Criatividade (Temp)</label>
                          <span className="value-badge" style={{ backgroundColor: 'var(--warning-dim)', color: 'var(--warning)', padding: '2px 10px', fontSize: '0.7rem' }}>{aiConfig.repair_temperature}</span>
                        </div>
                        <input 
                          type="range" min="0" max="1" step="0.1"
                          style={{ accentColor: 'var(--warning)' }}
                          value={aiConfig.repair_temperature}
                          onChange={e => setAiConfig({...aiConfig, repair_temperature: parseFloat(e.target.value)})}
                        />
                        <div className="flex justify-between text-[10px] text-muted mt-1 px-1">
                          <span>Preciso</span>
                          <span>Criativo</span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <div className="pt-8 border-t border-border flex flex-col gap-4">
                <div className="flex items-start gap-3 p-4 rounded-lg bg-info-dim border border-info/20">
                  <Info size={18} className="text-info mt-0.5" />
                  <p className="text-xs text-info leading-relaxed">
                    <strong>Nota importante:</strong> Se você selecionar "Padrão do Sistema", o sistema usará os modelos definidos no arquivo .env global. 
                    Seu workspace herdará essas configurações automaticamente em caso de falha.
                  </p>
                </div>
                <div className="flex items-center gap-4">
                  <button type="submit" className="btn btn-primary" disabled={savingAI}>
                    {savingAI ? <div className="spinner" /> : <><Save size={16} /> Salvar Configurações de IA</>}
                  </button>
                  {aiSuccess && <span className="text-sm text-success font-bold flex items-center gap-2"><CheckCircle size={18}/> Configurações Aplicadas!</span>}
                </div>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  )
}
