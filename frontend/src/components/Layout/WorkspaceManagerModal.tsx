import { useState, useEffect } from 'react'
import { workspacesAPI, usersAPI } from '../../services/api'
import { 
  X, Building, Settings as SettingsIcon, Users, 
  Trash2, Plus, CheckCircle, AlertCircle, Save
} from 'lucide-react'

interface WorkspaceManagerModalProps {
  onClose: () => void
  onWorkspaceCreated: () => void
}

export default function WorkspaceManagerModal({ onClose, onWorkspaceCreated }: WorkspaceManagerModalProps) {
  const [activeTab, setActiveTab] = useState<'list' | 'settings' | 'members'>('list')
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
  
  // Members Tab State
  const [members, setMembers] = useState<any[]>([])
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviting, setInviting] = useState(false)
  const [inviteError, setInviteError] = useState('')

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

  useEffect(() => {
    if (activeTab === 'members' && currentWsId) {
      loadMembers()
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

  const currentWorkspace = workspaces.find(w => w.id === currentWsId)
  const isOwner = currentWorkspace?.owner_id === profile?.id

  return (
    <div className="modal-overlay">
      <div className="modal-content" style={{ maxWidth: '700px', width: '100%', padding: 0, overflow: 'hidden' }}>
        <div className="flex" style={{ height: '540px' }}>
          
          {/* Menu Lateral Estilizado (Esquerda) */}
          <div style={{ 
            width: '220px', 
            backgroundColor: 'var(--bg-elevated)', 
            borderRight: '1px solid var(--border)', 
            padding: '24px 16px',
            display: 'flex',
            flexDirection: 'column'
          }}>
            <h3 className="nav-section-title" style={{ marginBottom: '12px' }}>Gestão SaaS</h3>
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', flex: 1 }}>
              <button 
                className={`nav-item w-full ${activeTab === 'list' ? 'active' : ''}`}
                onClick={() => setActiveTab('list')}
                style={{ justifyContent: 'flex-start' }}
              >
                <Building className="nav-icon" size={17} /> 
                <span>Workspaces</span>
              </button>
              
              <button 
                className={`nav-item w-full ${activeTab === 'settings' ? 'active' : ''}`}
                onClick={() => setActiveTab('settings')}
                style={{ justifyContent: 'flex-start' }}
              >
                <SettingsIcon className="nav-icon" size={17} /> 
                <span>Configurações</span>
              </button>

              <button 
                className={`nav-item w-full ${activeTab === 'members' ? 'active' : ''}`}
                onClick={() => setActiveTab('members')}
                style={{ justifyContent: 'flex-start' }}
              >
                <Users className="nav-icon" size={17} /> 
                <span>Membros</span>
              </button>
            </div>

            {profile && (
              <div style={{ 
                marginTop: 'auto', 
                borderTop: '1px solid var(--border)',
                paddingTop: '16px',
                display: 'flex',
                alignItems: 'center',
                gap: '10px'
              }}>
                <div className="user-avatar" style={{ width: '32px', height: '32px', fontSize: '13px' }}>
                  {profile.full_name?.charAt(0) || 'U'}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="user-name" style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{profile.full_name}</div>
                  <div className="user-email" style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{profile.email}</div>
                </div>
              </div>
            )}
          </div>

          {/* Área Principal Estilizada (Direita) */}
          <div className="flex-1 flex flex-col" style={{ backgroundColor: 'var(--bg-card)' }}>
            
            {/* Header Área Principal */}
            <div style={{ 
              padding: '24px 32px', 
              borderBottom: '1px solid var(--border)', 
              display: 'flex', 
              justifyContent: 'space-between', 
              alignItems: 'center' 
            }}>
              <div>
                <h2 className="card-title" style={{ fontSize: '1.2rem' }}>
                  {activeTab === 'list' && 'Seus Espaços de Trabalho'}
                  {activeTab === 'settings' && 'Personalizar Interface'}
                  {activeTab === 'members' && 'Controle de Acesso'}
                </h2>
                <div className="text-muted text-xs mt-1">
                  {activeTab === 'list' && 'Gerencie e alterne entre seus ambientes.'}
                  {activeTab === 'settings' && 'Ajuste as preferências globais do workspace selecionado.'}
                  {activeTab === 'members' && 'Convide colaboradores para trabalhar com você.'}
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                {activeTab === 'list' && (
                  <button className="btn btn-primary btn-sm" onClick={() => setIsCreating(!isCreating)}>
                    {isCreating ? 'Cancelar' : <><Plus size={14} /> Novo Workspace</>}
                  </button>
                )}
                <button className="btn-icon-sm" onClick={onClose}>
                  <X size={18} />
                </button>
              </div>
            </div>

            {/* Conteúdo Dinâmico */}
            <div style={{ padding: '32px', overflowY: 'auto', flex: 1 }} className="custom-scrollbar">
              {loading ? (
                <div className="loading-center">
                  <div className="spinner spinner-lg"></div>
                </div>
              ) : (
                <div style={{ animation: 'fadeIn 0.3s ease' }}>
                  
                  {/* TAB LIST */}
                  {activeTab === 'list' && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
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
                          <div className="workspace-icon" style={{ width: '48px', height: '48px', fontSize: '1.4rem' }}>
                            {ws.name.charAt(0)}
                          </div>
                          
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-1">
                              <span className="font-bold text-primary">{ws.name}</span>
                              {ws.owner_id === profile.id && (
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
                                <CheckCircle size={12} /> Ativo Agora
                              </div>
                            ) : (
                              <button className="btn btn-ghost btn-sm">Trocar</button>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* TAB SETTINGS */}
                  {activeTab === 'settings' && (
                    <div style={{ maxWidth: '440px' }}>
                      {isOwner ? (
                        <>
                        <form onSubmit={handleRename} style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
                          <div className="form-group">
                            <label className="form-label uppercase tracking-wider text-xs">Identificação do Espaço</label>
                            <input 
                              className="form-input"
                              value={newName}
                              onChange={e => setNewName(e.target.value)}
                              placeholder="Nome da imobiliária"
                              style={{ padding: '12px 14px', fontSize: '1rem' }}
                            />
                            <p className="text-xs text-muted mt-2">
                              A alteração do nome é global e será vista por todos os membros deste workspace.
                            </p>
                          </div>

                          <div className="form-actions" style={{ marginTop: '8px', paddingTop: 0, border: 'none', justifyContent: 'flex-start' }}>
                            <button 
                              type="submit" 
                              className="btn btn-primary" 
                              disabled={savingSettings || newName === currentWorkspace?.name}
                            >
                              {savingSettings ? <div className="spinner"></div> : <><Save size={16} /> Atualizar Workspace</>}
                            </button>
                            
                            {saveSuccess && (
                              <div className="text-xs text-success flex items-center gap-2" style={{ color: 'var(--success)', marginLeft: '12px' }}>
                                <CheckCircle size={14} /> Salvo com sucesso!
                              </div>
                            )}
                          </div>
                        </form>
                        
                        {/* DANGER ZONE */}
                        <div style={{ marginTop: '48px', paddingTop: '24px', borderTop: '1px solid var(--border)' }}>
                          <h4 className="flex items-center gap-2" style={{ color: 'var(--error)', fontSize: '0.9rem', fontWeight: 'bold', marginBottom: '8px' }}>
                            <AlertCircle size={16} /> Zona de Perigo
                          </h4>
                          <p className="text-xs text-muted mb-4">
                            Deletar este workspace apagará permanentemente todos os imóveis, clientes, integrações e conversas vinculadas a ele. Esta ação não pode ser desfeita.
                          </p>
                          {showDeleteConfirm ? (
                            <div className="card" style={{ padding: '20px', border: '1px solid rgba(239, 68, 68, 0.4)', backgroundColor: 'rgba(239, 68, 68, 0.05)' }}>
                              <h5 className="font-bold text-sm mb-2 text-white">Você tem certeza absoluta?</h5>
                              <p className="text-xs text-muted mb-4">Para confirmar a exclusão do workspace <strong style={{color: 'var(--text-color)'}}>"{currentWorkspace?.name}"</strong>, digite a palavra <strong style={{color: 'var(--error)'}}>deletar</strong> abaixo:</p>
                              <div style={{ display: 'flex', gap: '12px' }}>
                                <input 
                                  className="form-input flex-1" 
                                  style={{ borderColor: 'rgba(239, 68, 68, 0.4)' }}
                                  value={deleteConfirmText}
                                  onChange={e => setDeleteConfirmText(e.target.value)}
                                  placeholder="deletar"
                                  autoFocus
                                />
                                <button className="btn btn-primary" style={{ backgroundColor: 'var(--error)', borderColor: 'var(--error)', color: '#fff' }} onClick={executeDelete} disabled={isDeleting || deleteConfirmText !== 'deletar'}>
                                  {isDeleting ? <div className="spinner"></div> : 'Confirmar'}
                                </button>
                                <button className="btn btn-ghost" onClick={() => setShowDeleteConfirm(false)} disabled={isDeleting}>Cancelar</button>
                              </div>
                              {deleteError && <div className="text-xs mt-3 flex items-center gap-1" style={{ color: 'var(--error)' }}><AlertCircle size={14}/> {deleteError}</div>}
                            </div>
                          ) : (
                            <button 
                              type="button"
                              className="btn btn-ghost" 
                              style={{ color: 'var(--error)', border: '1px solid rgba(239, 68, 68, 0.2)' }}
                              onClick={initiateDelete}
                              disabled={isDeleting}
                            >
                              {isDeleting ? <div className="spinner"></div> : <><Trash2 size={16} /> Deletar Workspace Permanentemente</>}
                            </button>
                          )}
                        </div>
                        </>
                      ) : (
                        <div className="empty-state">
                          <AlertCircle className="empty-icon text-muted opacity-50" size={48} />
                          <h3>Acesso Restrito</h3>
                          <p>Apenas o proprietário do workspace pode realizar alterações administrativas neste menu.</p>
                        </div>
                      )}
                    </div>
                  )}

                  {/* TAB MEMBERS */}
                  {activeTab === 'members' && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '32px' }}>
                      {isOwner && (
                        <div className="card" style={{ padding: '24px' }}>
                          <h4 className="card-title flex items-center gap-2 mb-4 text-sm" style={{ marginBottom: '16px' }}>
                            <Users size={16} className="text-primary-color" /> Convidar Colaborador
                          </h4>
                          <form onSubmit={handleInvite} className="flex gap-3">
                            <input 
                              type="email"
                              className="form-input flex-1"
                              value={inviteEmail}
                              onChange={e => setInviteEmail(e.target.value)}
                              placeholder="E-mail do novo membro"
                              required
                            />
                            <button type="submit" className="btn btn-primary" disabled={inviting}>
                              {inviting ? <div className="spinner"></div> : <><Plus size={16} /> Enviar Convite</>}
                            </button>
                          </form>
                          {inviteError && (
                            <div className="text-xs text-error flex items-center gap-2 mt-3" style={{ color: 'var(--error)' }}>
                              <AlertCircle size={14} /> {inviteError}
                            </div>
                          )}
                        </div>
                      )}
                      
                      <div>
                        <div className="nav-section-title" style={{ paddingLeft: 0, marginBottom: '12px' }}>Membros Ativos ({members.length})</div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                          {members.map(member => (
                            <div key={member.id} className="card" style={{ padding: '12px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                              <div className="flex items-center gap-3">
                                <div className="user-avatar" style={{ transform: 'none', width: '36px', height: '36px', fontSize: '14px' }}>
                                  {member.email.charAt(0).toUpperCase()}
                                </div>
                                <div>
                                  <div className="text-sm font-bold text-primary">{member.full_name || member.email.split('@')[0]}</div>
                                  <div className="text-xs text-muted font-medium">{member.email}</div>
                                </div>
                              </div>
                              
                              <div className="flex items-center gap-3">
                                {member.is_owner ? (
                                  <div className="badge badge-primary text-[10px] uppercase">
                                    Proprietário
                                  </div>
                                ) : (
                                  <div className="flex items-center gap-4">
                                    <div className="badge badge-muted text-[10px] uppercase">Colaborador</div>
                                    {isOwner && (
                                      <button 
                                        className="btn-icon-sm" 
                                        onClick={() => handleRemoveMember(member.id)}
                                        title="Remover acesso"
                                      >
                                        <Trash2 size={16} className="text-error" style={{ color: 'var(--error)' }} />
                                      </button>
                                    )}
                                  </div>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
