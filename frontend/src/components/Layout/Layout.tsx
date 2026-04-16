import { Outlet, NavLink, useNavigate } from 'react-router-dom'
import { useState } from 'react'
import {
  LayoutDashboard, Building2, Bot, Users, LogOut, Activity, Home,
  ChevronDown, ChevronUp, Wrench, Settings, Building, SwitchCamera
} from 'lucide-react'
import { workspacesAPI, usersAPI } from '../../services/api'
import { useEffect } from 'react'
import WorkspaceManagerModal from './WorkspaceManagerModal'

const navItems = [
  { to: '/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/properties', icon: Building2, label: 'Imóveis' },
  { to: '/leads', icon: Users, label: 'Leads' },
  {
    to: '/playground',
    icon: Bot,
    label: 'Playground',
    subItems: [
      { to: '/playground/agents', icon: Bot, label: 'Agentes' },
      { to: '/playground/tools', icon: Wrench, label: 'Ferramentas' },
    ]
  },
  { to: '/logs', icon: Activity, label: 'System Logs' },
  { to: '/settings', icon: Settings, label: 'Configurações' },
]

export default function Layout() {
  const [workspaces, setWorkspaces] = useState<any[]>([])
  const [currentWorkspaceId, setCurrentWorkspaceId] = useState<string | null>(
    localStorage.getItem('rea_workspace_id')
  )
  const [isWorkspaceOpen, setIsWorkspaceOpen] = useState(false)
  const [isManageModalOpen, setIsManageModalOpen] = useState(false)
  const [user, setUser] = useState<any>(null)
  
  const navigate = useNavigate()

  useEffect(() => {
    loadData()
  }, [])

  const loadData = async () => {
    try {
      const [wsRes, uRes] = await Promise.all([
        workspacesAPI.list(),
        usersAPI.me()
      ])
      setWorkspaces(wsRes.data)
      setUser(uRes.data)
      
      // Persiste para uso rápido em outros lugares (opcional, mas bom manter sync)
      localStorage.setItem('rea_user_workspaces', JSON.stringify(wsRes.data))
      
      if (!currentWorkspaceId && wsRes.data.length > 0) {
        handleWorkspaceChange(wsRes.data[0].id)
      }
    } catch (err) {
      console.error('Failed to load layout data', err)
    }
  }

  const handleWorkspaceChange = (id: string) => {
    localStorage.setItem('rea_workspace_id', String(id))
    setCurrentWorkspaceId(String(id))
    setIsWorkspaceOpen(false)
    window.location.reload()
  }

  const currentWorkspace = workspaces.find(w => String(w.id) === String(currentWorkspaceId))

  const handleLogout = () => {
    localStorage.removeItem('rea_token')
    localStorage.removeItem('rea_workspace_id')
    localStorage.removeItem('rea_user_workspaces')
    window.location.href = '/login'
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="sidebar-logo">
          <div className="logo-mark">
            <div className="logo-icon">
              <Home size={18} strokeWidth={2.5} color="#fff" />
            </div>
            <div className="logo-text">Realty<span>AI</span></div>
          </div>
        </div>

        {/* Workspace Switcher */}
        <div className="workspace-switcher">
          <div 
            className="workspace-current"
            onClick={() => setIsWorkspaceOpen(!isWorkspaceOpen)}
          >
            <div className="workspace-icon">
              <Building size={14} />
            </div>
            <div className="workspace-info">
              <span className="workspace-label">Workspace</span>
              <span className="workspace-name">{currentWorkspace?.name || 'Selecione...'}</span>
            </div>
            <ChevronDown size={14} className={`workspace-chevron ${isWorkspaceOpen ? 'open' : ''}`} />
          </div>

          {isWorkspaceOpen && (
            <div className="workspace-dropdown">
              {workspaces.map((w) => (
                <div 
                  key={w.id} 
                  className={`workspace-option ${String(w.id) === String(currentWorkspaceId) ? 'active' : ''}`}
                  onClick={() => handleWorkspaceChange(w.id)}
                >
                  <Building size={12} />
                  <span>{w.name}</span>
                </div>
              ))}
              <div className="workspace-divider" />
              <button 
                className="workspace-create-btn"
                onClick={() => {
                  setIsManageModalOpen(true)
                  setIsWorkspaceOpen(false)
                }}
              >
                Gerenciar Workspaces
              </button>
            </div>
          )}
        </div>

        <nav className="sidebar-nav">
          <div className="nav-section-title">Menu Principal</div>
          {navItems.map((item) => {
            const { to, icon: Icon, label, subItems } = item
            const [expanded, setExpanded] = useState(true)

            if (subItems) {
              return (
                <div key={to} className="nav-group">
                  <div
                    className={`nav-item group-header ${typeof window !== 'undefined' && window.location.pathname.startsWith(to) ? 'active' : ''}`}
                    onClick={() => setExpanded(!expanded)}
                  >
                    <Icon className="nav-icon" size={17} />
                    <span style={{ flex: 1 }}>{label}</span>
                    {expanded ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                  </div>
                  {expanded && (
                    <div className="nav-subitems">
                      {subItems.map((sub) => (
                        <NavLink
                          key={sub.to}
                          to={sub.to}
                          className={({ isActive }) => `nav-subitem ${isActive ? 'active' : ''}`}
                        >
                          <sub.icon size={13} />
                          {sub.label}
                        </NavLink>
                      ))}
                    </div>
                  )}
                </div>
              )
            }

            return (
              <NavLink
                key={to}
                to={to}
                className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
              >
                <Icon className="nav-icon" size={17} />
                {label}
              </NavLink>
            )
          })}
        </nav>

        <div className="sidebar-footer">
          <div className="user-info">
            <div className="user-avatar">A</div>
            <div style={{ flex: 1 }}>
              <div className="user-name">Admin</div>
              <div className="user-email">admin@realtyai.com</div>
            </div>
            <button
              className="btn btn-ghost btn-sm"
              onClick={handleLogout}
              title="Sair"
              style={{ padding: '6px', minWidth: 'auto' }}
            >
              <LogOut size={15} />
            </button>
          </div>
        </div>
      </aside>

      <main className="main-content">
        <Outlet />
      </main>

      {isManageModalOpen && (
        <WorkspaceManagerModal 
          onClose={() => setIsManageModalOpen(false)} 
          onWorkspaceCreated={loadData} 
        />
      )}
    </div>
  )
}
