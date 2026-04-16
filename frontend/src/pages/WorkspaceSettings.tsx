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
            <form onSubmit={handleUpdateAI} className="space-y-10">
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(380px, 1fr))', gap: '32px' }}>
                
                {/* Supervisor */}
                <div className="p-5 rounded-xl border border-border bg-elevated/30 hover:border-primary/30 transition-colors">
                  <div className="flex items-center gap-3 mb-4">
                    <div className="w-10 h-10 rounded-lg bg-primary-dim text-primary flex items-center justify-center">
                      <Zap size={20} />
                    </div>
                    <div>
                      <h4 className="font-bold text-sm">Supervisor de Conversa</h4>
                      <p className="text-[11px] text-muted">Classifica intenções e gera títulos automaticamente.</p>
                    </div>
                  </div>
                  <div className="space-y-4">
                    <div className="form-group">
                      <label className="form-label text-[10px]">Modelo de IA</label>
                      <select 
                        className="form-select"
                        value={aiConfig.supervisor_model}
                        onChange={e => setAiConfig({...aiConfig, supervisor_model: e.target.value})}
                      >
                        {OPENROUTER_MODELS.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
                      </select>
                    </div>
                    <div className="form-group">
                      <div className="flex justify-between items-center mb-1">
                        <label className="form-label text-[10px]">Temperatura</label>
                        <span className="value-badge">{aiConfig.supervisor_temperature}</span>
                      </div>
                      <input 
                        type="range" min="0" max="1" step="0.1"
                        value={aiConfig.supervisor_temperature}
                        onChange={e => setAiConfig({...aiConfig, supervisor_temperature: parseFloat(e.target.value)})}
                      />
                    </div>
                  </div>
                </div>

                {/* Prompt Assistant */}
                <div className="p-5 rounded-xl border border-border bg-elevated/30 hover:border-success/30 transition-colors">
                  <div className="flex items-center gap-3 mb-4">
                    <div className="w-10 h-10 rounded-lg bg-success-dim text-success flex items-center justify-center">
                      <MessageSquare size={20} />
                    </div>
                    <div>
                      <h4 className="font-bold text-sm">Engenheiro de Prompts</h4>
                      <p className="text-[11px] text-muted">Auxilia na criação e refinamento de instruções dos agentes.</p>
                    </div>
                  </div>
                  <div className="space-y-4">
                    <div className="form-group">
                      <label className="form-label text-[10px]">Modelo de IA</label>
                      <select 
                        className="form-select"
                        value={aiConfig.prompt_assistant_model}
                        onChange={e => setAiConfig({...aiConfig, prompt_assistant_model: e.target.value})}
                      >
                        {OPENROUTER_MODELS.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
                      </select>
                    </div>
                    <div className="form-group">
                      <div className="flex justify-between items-center mb-1">
                        <label className="form-label text-[10px]">Temperatura</label>
                        <span className="value-badge">{aiConfig.prompt_assistant_temperature}</span>
                      </div>
                      <input 
                        type="range" min="0" max="1" step="0.1"
                        className="accent-success"
                        style={{ accentColor: 'var(--success)' }}
                        value={aiConfig.prompt_assistant_temperature}
                        onChange={e => setAiConfig({...aiConfig, prompt_assistant_temperature: parseFloat(e.target.value)})}
                      />
                    </div>
                  </div>
                </div>

                {/* Repair Agent */}
                <div className="p-5 rounded-xl border border-border bg-elevated/30 hover:border-warning/30 transition-colors">
                  <div className="flex items-center gap-3 mb-4">
                    <div className="w-10 h-10 rounded-lg bg-warning-dim text-warning flex items-center justify-center">
                      <Cpu size={20} />
                    </div>
                    <div>
                      <h4 className="font-bold text-sm">Agente de Reparo (JSON)</h4>
                      <p className="text-[11px] text-muted">Corrige erros de formatação em tempo real para estabilidade.</p>
                    </div>
                  </div>
                  <div className="space-y-4">
                    <div className="form-group">
                      <label className="form-label text-[10px]">Modelo de IA</label>
                      <select 
                        className="form-select"
                        value={aiConfig.repair_model}
                        onChange={e => setAiConfig({...aiConfig, repair_model: e.target.value})}
                      >
                        {OPENROUTER_MODELS.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
                      </select>
                    </div>
                    <div className="form-group">
                      <div className="flex justify-between items-center mb-1">
                        <label className="form-label text-[10px]">Temperatura</label>
                        <span className="value-badge">{aiConfig.repair_temperature}</span>
                      </div>
                      <input 
                        type="range" min="0" max="1" step="0.1"
                        style={{ accentColor: 'var(--warning)' }}
                        value={aiConfig.repair_temperature}
                        onChange={e => setAiConfig({...aiConfig, repair_temperature: parseFloat(e.target.value)})}
                      />
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
