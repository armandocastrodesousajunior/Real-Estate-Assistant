import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { workspacesAPI, usersAPI } from '../../services/api'
import { 
  X, Building, Settings as SettingsIcon, Users, 
  Trash2, Plus, CheckCircle, AlertCircle, Save, Brain, Cpu, MessageSquare, Zap
} from 'lucide-react'

interface WorkspaceManagerModalProps {
  onClose: () => void
  onWorkspaceCreated: () => void
}

export default function WorkspaceManagerModal({ onClose, onWorkspaceCreated }: WorkspaceManagerModalProps) {
  const navigate = useNavigate()
  const [activeTab, setActiveTab] = useState<'list' | 'settings' | 'members' | 'ai'>('list')
  const [workspaces, setWorkspaces] = useState<any[]>([])
  const [profile, setProfile] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [currentWsId, setCurrentWsId] = useState<number>(Number(localStorage.getItem('rea_workspace_id')))
  // List Tab State
  const [isCreating, setIsCreating] = useState(false)
  const [newWsName, setNewWsName] = useState('')
  const [creatingWs, setCreatingWs] = useState(false)
  const [createError, setCreateError] = useState('')
  
  // Settings Tab State
  const [newName, setNewName] = useState('')
  const [savingSettings, setSavingSettings] = useState(false)
  const [saveSuccess, setSaveSuccess] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [deleteConfirmText, setDeleteConfirmText] = useState('')
  const [deleteError, setDeleteError] = useState('')
  
  const [members, setMembers] = useState<any[]>([])
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviting, setInviting] = useState(false)
  const [inviteError, setInviteError] = useState('')

  // AI Tab State
  const [aiConfig, setAiConfig] = useState({
    supervisor_model: '',
    supervisor_temperature: 0.1,
    prompt_assistant_model: '',
    prompt_assistant_temperature: 0.5,
    repair_model: '',
    repair_temperature: 0.1
  })
  const [savingAI, setSavingAI] = useState(false)
  const [aiSuccess, setAiSuccess] = useState(false)

  useEffect(() => {
    loadInitialData()
  }, [])

  const loadInitialData = async () => {
    setLoading(true)
    try {
      const [uRes, wRes] = await Promise.all([
        usersAPI.me(),
        workspacesAPI.list()
      ])
      setProfile(uRes.data)
      setWorkspaces(wRes.data)
      
      const current = wRes.data.find((w: any) => w.id === currentWsId)
      if (current) setNewName(current.name)
      
      if (activeTab === 'members') loadMembers()
    } catch (err) {
      console.error('Failed to load workspace data', err)
    } finally {
      setLoading(false)
    }
  }

  const loadMembers = async () => {
    try {
      const { data } = await workspacesAPI.listMembers(currentWsId)
      setMembers(data)
    } catch (err) {
      console.error('Failed to load members', err)
    }
  }

  const loadWorkspaceDetail = async () => {
    try {
      const { data } = await workspacesAPI.getDetail(currentWsId)
      setAiConfig({
        supervisor_model: data.supervisor_model || '',
        supervisor_temperature: data.supervisor_temperature ?? 0.1,
        prompt_assistant_model: data.prompt_assistant_model || '',
        prompt_assistant_temperature: data.prompt_assistant_temperature ?? 0.5,
        repair_model: data.repair_model || '',
        repair_temperature: data.repair_temperature ?? 0.1
      })
    } catch (err) {
      console.error('Failed to load workspace details', err)
    }
  }

  useEffect(() => {
    if (activeTab === 'members' && currentWsId) {
      loadMembers()
    }
    if (activeTab === 'ai' && currentWsId) {
      loadWorkspaceDetail()
    }
  }, [activeTab, currentWsId])

  const handleSwitch = (id: number) => {
    localStorage.setItem('rea_workspace_id', String(id))
    window.location.reload()
  }

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newWsName.trim()) return
    setCreatingWs(true)
    setCreateError('')
    try {
      const res = await workspacesAPI.create(newWsName)
      setIsCreating(false)
      setNewWsName('')
      onWorkspaceCreated()
      
      // Opt-in: Switch to new workspace immediately
      localStorage.setItem('rea_workspace_id', String(res.data.id))
      window.location.reload()
    } catch (err: any) {
      setCreateError(err.response?.data?.detail || 'Erro ao criar workspace')
    } finally {
      setCreatingWs(false)
    }
  }

  const handleRename = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newName.trim()) return
    setSavingSettings(true)
    setSaveSuccess(false)
    try {
      await workspacesAPI.update(currentWsId, newName)
      setSaveSuccess(true)
      setWorkspaces(workspaces.map(w => w.id === currentWsId ? { ...w, name: newName } : w))
      setTimeout(() => setSaveSuccess(false), 3000)
    } catch (err) {
      console.error('Failed to rename', err)
    } finally {
      setSavingSettings(false)
    }
  }

  const initiateDelete = () => {
    setShowDeleteConfirm(true)
    setDeleteConfirmText('')
    setDeleteError('')
  }

  const executeDelete = async () => {
    if (deleteConfirmText !== 'deletar') {
      setDeleteError('Você deve digitar "deletar" para confirmar.')
      return
    }

    setIsDeleting(true)
    setDeleteError('')
    try {
      await workspacesAPI.delete(currentWsId)
      // Fallback para outro workspace ou deslogar (se não houver nenhum)
      const remaining = workspaces.filter(w => w.id !== currentWsId)
      if (remaining.length > 0) {
        localStorage.setItem('rea_workspace_id', String(remaining[0].id))
      } else {
        localStorage.removeItem('rea_workspace_id')
      }
      window.location.reload()
    } catch (err) {
      console.error('Failed to delete workspace', err)
      setDeleteError("Erro ao deletar o workspace. Tente novamente.")
      setIsDeleting(false)
    }
  }

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!inviteEmail.trim()) return
    setInviting(true)
    setInviteError('')
    try {
      await workspacesAPI.addMember(currentWsId, inviteEmail)
      setInviteEmail('')
      loadMembers()
    } catch (err: any) {
      setInviteError(err.response?.data?.detail || 'Erro ao convidar usuário')
    } finally {
      setInviting(false)
    }
  }

  const handleRemoveMember = async (userId: number) => {
    if (!confirm('Tem certeza que deseja remover este membro?')) return
    try {
      await workspacesAPI.removeMember(currentWsId, userId)
      loadMembers()
    } catch (err) {
      console.error('Failed to remove member', err)
    }
  }

  const handleUpdateAI = async (e: React.FormEvent) => {
    e.preventDefault()
    setSavingAI(true)
    setAiSuccess(false)
    try {
      // Limpa strings vazias para null (para o backend usar o fallback)
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
    { id: '', name: 'Padrão do Sistema (.env)' },
    { id: 'openai/gpt-4o-mini', name: 'GPT-4o Mini' },
    { id: 'openai/gpt-4o', name: 'GPT-4o (Premium)' },
    { id: 'anthropic/claude-3.5-sonnet', name: 'Claude 3.5 Sonnet' },
    { id: 'google/gemini-pro-1.5', name: 'Gemini 1.5 Pro' },
    { id: 'meta-llama/llama-3.1-70b-instruct', name: 'Llama 3.1 70B' },
  ]

  const currentWorkspace = workspaces.find(w => w.id === currentWsId)
  const isOwner = currentWorkspace?.owner_id === profile?.id

  return (
    <div className="modal-overlay">
      <div className="modal-content" style={{ maxWidth: '520px', width: '100%', padding: '32px' }}>
        <div className="flex justify-between items-center mb-6">
          <div>
            <h2 className="card-title" style={{ fontSize: '1.2rem' }}>Meus Espaços de Trabalho</h2>
            <p className="text-muted text-xs mt-1">Gerencie e alterne entre seus ambientes.</p>
          </div>
          <button className="btn-icon-sm" onClick={onClose}>
            <X size={18} />
          </button>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', maxHeight: '400px', overflowY: 'auto' }} className="custom-scrollbar">
          {loading ? (
            <div className="loading-center">
              <div className="spinner spinner-lg"></div>
            </div>
          ) : (
            <>
              {isCreating && (
                <div className="card" style={{ padding: '16px', border: '1px dashed var(--primary)', backgroundColor: 'rgba(99, 102, 241, 0.05)' }}>
                  <form onSubmit={handleCreate} style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                    <input 
                      autoFocus
                      className="form-input flex-1"
                      placeholder="Nome do novo workspace..."
                      value={newWsName}
                      onChange={e => setNewWsName(e.target.value)}
                      required
                    />
                    <button type="submit" className="btn btn-primary" disabled={creatingWs}>
                      {creatingWs ? <div className="spinner"></div> : 'Criar'}
                    </button>
                  </form>
                  {createError && (
                    <div className="text-xs text-error mt-2">{createError}</div>
                  )}
                </div>
              )}

              {workspaces.map(ws => (
                <div 
                  key={ws.id} 
                  onClick={() => ws.id !== currentWsId && handleSwitch(ws.id)}
                  className="card flex items-center gap-4"
                  style={{ 
                    padding: '16px', 
                    cursor: ws.id === currentWsId ? 'default' : 'pointer',
                    borderColor: ws.id === currentWsId ? 'var(--primary)' : 'var(--border)',
                    boxShadow: ws.id === currentWsId ? 'var(--shadow-card)' : 'none',
                    background: ws.id === currentWsId ? 'var(--primary-dim)' : 'transparent'
                  }}
                >
                  <div className="workspace-icon" style={{ width: '40px', height: '40px', fontSize: '1.2rem' }}>
                    {ws.name.charAt(0)}
                  </div>
                  
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-bold text-primary">{ws.name}</span>
                      {ws.owner_id === profile?.id && (
                        <span className="badge badge-primary text-[10px] uppercase">Proprietário</span>
                      )}
                    </div>
                    <div className="text-xs text-muted font-mono">
                      ID: {ws.id} • {ws.slug}
                    </div>
                  </div>

                  <div className="flex items-center gap-3">
                    {ws.id === currentWsId ? (
                      <div className="badge badge-success text-[11px] gap-1">
                        <CheckCircle size={12} /> Ativo
                      </div>
                    ) : (
                      <button className="btn btn-ghost btn-sm">Trocar</button>
                    )}
                  </div>
                </div>
              ))}
            </>
          )}
        </div>

        <div className="form-actions" style={{ marginTop: '24px' }}>
          <button className="btn btn-ghost" onClick={() => setIsCreating(!isCreating)} style={{ marginRight: 'auto' }}>
            {isCreating ? 'Cancelar' : <><Plus size={16} /> Novo Workspace</>}
          </button>
          <button className="btn btn-primary btn-outline" onClick={() => { onClose(); navigate('/settings/workspace'); }}>
            Ir para Configurações Avançadas
          </button>
        </div>
      </div>
    </div>
  )
}
