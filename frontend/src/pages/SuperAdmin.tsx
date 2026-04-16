import { useState, useEffect } from 'react'
import { superAdminAPI } from '../services/api'
import { 
  Users, Building, ShieldCheck, Activity, Search, 
  ToggleLeft, ToggleRight, Calendar, Mail, UserCheck,
  Plus, Edit, Trash2, X, Lock
} from 'lucide-react'

interface UserModalProps {
  user?: any
  onClose: () => void
  onSave: () => void
}

function UserModal({ user, onClose, onSave }: UserModalProps) {
  const [formData, setFormData] = useState({
    email: user?.email || '',
    full_name: user?.full_name || '',
    password: '',
    is_active: user ? user.is_active : true,
    is_superadmin: user ? user.is_superadmin : false,
    workspace_limit: user?.workspace_limit || 2
  })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')
    try {
      if (user) {
        await superAdminAPI.updateUser(user.id, formData)
      } else {
        if (!formData.password) throw new Error('Senha é obrigatória para novos usuários')
        await superAdminAPI.createUser(formData)
      }
      onSave()
    } catch (err: any) {
      setError(err.response?.data?.detail || err.message || 'Falha ao salvar usuário')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="modal-overlay">
      <div className="modal-content" style={{ maxWidth: '480px' }}>
        <div className="flex justify-between items-center mb-6">
          <h2 className="page-header-title" style={{ fontSize: '1.25rem', margin: 0 }}>
            {user ? 'Editar Usuário' : 'Novo Usuário'}
          </h2>
          <button onClick={onClose} className="btn-icon-sm"><X size={18} /></button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="form-group">
            <label className="form-label">Nome Completo</label>
            <input 
              className="form-input"
              value={formData.full_name}
              onChange={e => setFormData({...formData, full_name: e.target.value})}
              placeholder="Ex: João Silva"
            />
          </div>

          <div className="form-group">
            <label className="form-label">Email</label>
            <input 
              type="email"
              className="form-input"
              value={formData.email}
              onChange={e => setFormData({...formData, email: e.target.value})}
              placeholder="exemplo@gmail.com"
              required
            />
          </div>

          <div className="form-group">
            <label className="form-label">{user ? 'Nova Senha (deixe em branco para manter)' : 'Senha'}</label>
            <input 
              type="password"
              className="form-input"
              value={formData.password}
              onChange={e => setFormData({...formData, password: e.target.value})}
              placeholder="••••••••"
              required={!user}
            />
          </div>

          <div className="form-grid">
            <div className="form-group">
              <label className="form-label">Limite de Workspaces</label>
              <input 
                type="number"
                className="form-input"
                min="1"
                max="100"
                value={formData.workspace_limit}
                onChange={e => setFormData({...formData, workspace_limit: parseInt(e.target.value)})}
              />
            </div>
            <div className="form-group">
              <label className="form-label">Tipo de Conta</label>
              <select 
                className="form-select"
                value={formData.is_superadmin ? 'admin' : 'user'}
                onChange={e => setFormData({...formData, is_superadmin: e.target.value === 'admin'})}
              >
                <option value="user">Usuário Comum</option>
                <option value="admin">Super Admin</option>
              </select>
            </div>
          </div>

          {error && <div className="text-sm text-error" style={{ color: 'var(--error)' }}>{error}</div>}

          <div className="form-actions">
            <button type="button" className="btn btn-ghost" onClick={onClose}>Cancelar</button>
            <button type="submit" className="btn btn-primary" disabled={loading}>
              {loading ? <div className="spinner" /> : (user ? 'Salvar Alterações' : 'Criar Usuário')}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

export default function SuperAdmin() {
  const [activeTab, setActiveTab] = useState<'users' | 'workspaces'>('users')
  const [stats, setStats] = useState<any>(null)
  const [users, setUsers] = useState<any[]>([])
  const [workspaces, setWorkspaces] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [editingUser, setEditingUser] = useState<any>(null)

  useEffect(() => {
    loadData()
  }, [])

  const loadData = async () => {
    setLoading(true)
    try {
      const [statsRes, usersRes, wsRes] = await Promise.all([
        superAdminAPI.getStats(),
        superAdminAPI.listUsers(),
        superAdminAPI.listWorkspaces()
      ])
      setStats(statsRes.data)
      setUsers(usersRes.data)
      setWorkspaces(wsRes.data)
    } catch (err) {
      console.error('Failed to load admin data', err)
    } finally {
      setLoading(false)
    }
  }

  const handleToggleActive = async (userId: number) => {
    try {
      await superAdminAPI.toggleUserActive(userId)
      setUsers(users.map(u => u.id === userId ? { ...u, is_active: !u.is_active } : u))
    } catch (err) {
      alert('Falha ao alterar status do usuário')
    }
  }

  const handleDeleteUser = async (userId: number) => {
    if (!window.confirm('Tem certeza que deseja remover permanentemente este usuário? Esta ação não pode ser desfeita.')) return
    try {
      await superAdminAPI.deleteUser(userId)
      loadData()
    } catch (err) {
      alert('Falha ao remover usuário')
    }
  }

  const filteredUsers = users.filter(u => 
    u.email.toLowerCase().includes(searchTerm.toLowerCase()) || 
    (u.full_name && u.full_name.toLowerCase().includes(searchTerm.toLowerCase()))
  )

  const filteredWorkspaces = workspaces.filter(w => 
    w.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    w.owner_email.toLowerCase().includes(searchTerm.toLowerCase())
  )

  if (loading) return <div className="loading-center"><div className="spinner spinner-lg"></div></div>

  return (
    <div className="page-container">
      <div className="page-header">
        <div>
          <h1 className="page-header-title">👑 Administração Global</h1>
          <p className="page-header-sub">Gerencie todos os usuários e workspaces da plataforma.</p>
        </div>
        {activeTab === 'users' && (
          <button className="btn btn-primary" onClick={() => { setEditingUser(null); setIsModalOpen(true); }}>
            <Plus size={16} /> Novo Usuário
          </button>
        )}
      </div>

      {/* Global Stats */}
      <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-icon" style={{ background: 'var(--primary-dim)', color: 'var(--primary)' }}>
            <Users size={24} />
          </div>
          <div>
            <div className="stat-value">{stats?.total_users || 0}</div>
            <div className="stat-label">Usuários Totais</div>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-icon" style={{ background: 'var(--accent-dim)', color: 'var(--accent)' }}>
            <Building size={24} />
          </div>
          <div>
            <div className="stat-value">{stats?.total_workspaces || 0}</div>
            <div className="stat-label">Workspaces Criados</div>
          </div>
        </div>
      </div>

      <div className="card">
        <div className="card-header" style={{ padding: '0' }}>
          <div className="flex border-bottom">
            <button 
              className={`p-4 font-bold text-sm transition-colors ${activeTab === 'users' ? 'text-primary-color border-bottom-primary' : 'text-muted opacity-70 hover:opacity-100'}`}
              onClick={() => { setActiveTab('users'); setSearchTerm(''); }}
              style={activeTab === 'users' ? { borderBottom: '2px solid var(--accent)', color: 'var(--accent)' } : {}}
            >
              Usuários do Sistema
            </button>
            <button 
              className={`p-4 font-bold text-sm transition-colors ${activeTab === 'workspaces' ? 'text-primary-color' : 'text-muted opacity-70 hover:opacity-100'}`}
              onClick={() => { setActiveTab('workspaces'); setSearchTerm(''); }}
              style={activeTab === 'workspaces' ? { borderBottom: '2px solid var(--accent)', color: 'var(--accent)' } : {}}
            >
              Workspaces Ativos
            </button>
          </div>
        </div>

        <div className="card-body">
          <div className="filters-bar">
            <div className="search-input-wrapper" style={{ flex: 1 }}>
              <Search size={16} className="search-icon" />
              <input 
                type="text" 
                placeholder={activeTab === 'users' ? "Buscar por nome ou email..." : "Buscar workspace ou dono..."}
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="form-input"
              />
            </div>
            <button className="btn btn-secondary btn-sm" onClick={loadData}>
              <Activity size={14} /> Atualizar
            </button>
          </div>

          <div className="table-wrapper">
            <table>
              <thead>
                {activeTab === 'users' ? (
                  <tr>
                    <th>Usuário</th>
                    <th>Status</th>
                    <th>Função</th>
                    <th>Limite WS</th>
                    <th>Cadastro</th>
                    <th>Ações</th>
                  </tr>
                ) : (
                  <tr>
                    <th>Workspace</th>
                    <th>Dono</th>
                    <th>Membros</th>
                    <th>Criado em</th>
                  </tr>
                )}
              </thead>
              <tbody>
                {activeTab === 'users' ? (
                  filteredUsers.map((u) => (
                    <tr key={u.id}>
                      <td>
                        <div className="flex flex-col">
                          <span className="font-bold text-primary">{u.full_name || 'Sem Nome'}</span>
                          <span className="text-xs text-muted flex items-center gap-1"><Mail size={10} /> {u.email}</span>
                        </div>
                      </td>
                      <td>
                        <span className={`badge ${u.is_active ? 'badge-success' : 'badge-error'}`}>
                          {u.is_active ? 'Ativo' : 'Inativo'}
                        </span>
                      </td>
                      <td>
                        {u.is_superadmin ? (
                          <span className="badge badge-primary flex items-center gap-1">
                            <ShieldCheck size={10} /> Super Admin
                          </span>
                        ) : (
                          <span className="text-xs text-muted">Usuário</span>
                        )}
                      </td>
                      <td className="text-center">
                        <span className="font-mono text-sm">{u.workspace_count} / {u.workspace_limit}</span>
                      </td>
                      <td>
                        <div className="text-xs text-muted flex items-center gap-1">
                          <Calendar size={10} /> {new Date(u.created_at).toLocaleDateString()}
                        </div>
                      </td>
                      <td>
                        <div className="flex items-center gap-1">
                          <button 
                            className="btn-icon-sm"
                            title="Editar"
                            onClick={() => { setEditingUser(u); setIsModalOpen(true); }}
                          >
                            <Edit size={14} />
                          </button>
                          <button 
                            className={`btn-icon-sm ${u.id === stats?.current_user_id ? 'opacity-30 pointer-events-none' : ''}`}
                            title={u.is_active ? "Desativar" : "Ativar"}
                            onClick={() => handleToggleActive(u.id)}
                          >
                            {u.is_active ? <ToggleRight size={18} color="var(--success)" strokeWidth={1.5} /> : <ToggleLeft size={18} strokeWidth={1.5} />}
                          </button>
                          <button 
                            className={`btn-icon-sm ${u.id === stats?.current_user_id ? 'opacity-30 pointer-events-none' : ''}`}
                            style={{ color: 'var(--error)' }}
                            title="Excluir"
                            onClick={() => handleDeleteUser(u.id)}
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                ) : (
                  filteredWorkspaces.map((w) => (
                    <tr key={w.id}>
                      <td>
                        <div className="flex items-center gap-3">
                          <div className="workspace-icon" style={{ width: 32, height: 32 }}>
                            <Building size={16} />
                          </div>
                          <div className="flex flex-col">
                            <span className="font-bold text-primary">{w.name}</span>
                            <span className="text-xs text-muted font-mono">{w.slug}</span>
                          </div>
                        </div>
                      </td>
                      <td>
                        <span className="text-sm">{w.owner_email}</span>
                      </td>
                      <td className="text-center">
                        <span className="badge badge-muted flex items-center gap-1 justify-center">
                          <UserCheck size={12} /> {w.member_count}
                        </span>
                      </td>
                      <td>
                        <span className="text-xs text-muted">{new Date(w.created_at).toLocaleDateString()}</span>
                      </td>
                    </tr>
                  ))
                )}
                {((activeTab === 'users' && filteredUsers.length === 0) || (activeTab === 'workspaces' && filteredWorkspaces.length === 0)) && (
                  <tr>
                    <td colSpan={6} className="text-center p-12 text-muted">Nenhum resultado encontrado.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {isModalOpen && (
        <UserModal 
          user={editingUser} 
          onClose={() => setIsModalOpen(false)} 
          onSave={() => { setIsModalOpen(false); loadData(); }} 
        />
      )}
    </div>
  )
}
