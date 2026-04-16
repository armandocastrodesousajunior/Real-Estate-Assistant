import { Outlet, NavLink, useNavigate } from 'react-router-dom'
import { useState, useEffect } from 'react'
import {
  ShieldCheck, Users, Building, Activity, LogOut, Home, 
  LayoutDashboard, Server, Settings, ChevronLeft
} from 'lucide-react'
import { authAPI } from '../../services/api'

const adminNavItems = [
  { to: '/admin/dashboard', icon: LayoutDashboard, label: 'Painel Global' },
  { to: '/admin/users', icon: Users, label: 'Usuários' },
  { to: '/admin/workspaces', icon: Building, label: 'Workspaces' },
  { to: '/admin/system', icon: Server, label: 'Status do Sistema' },
]

export default function AdminLayout() {
  const navigate = useNavigate()
  const [loading, setLoading] = useState(true)
  const [isVerified, setIsVerified] = useState(false)
  const userName = localStorage.getItem('rea_user_name') || 'Admin'

  useEffect(() => {
    checkAdminStatus()
  }, [])

  const checkAdminStatus = async () => {
    try {
      const { data } = await authAPI.me()
      if (data.is_superadmin) {
        setIsVerified(true)
        localStorage.setItem('rea_is_superadmin', 'true')
      } else {
        navigate('/dashboard')
      }
    } catch (err) {
      console.error('Admin check failed', err)
      navigate('/login')
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return <div className="loading-center"><div className="spinner spinner-lg"></div></div>
  }

  if (!isVerified) return null

  const handleLogout = () => {
    localStorage.removeItem('rea_token')
    localStorage.removeItem('rea_workspace_id')
    localStorage.removeItem('rea_user_workspaces')
    localStorage.removeItem('rea_is_superadmin')
    window.location.href = '/login'
  }

  const handleBackToApp = () => {
    navigate('/dashboard')
  }

  return (
    <div className="app-shell">
      <aside className="sidebar sidebar-admin">
        <div className="sidebar-logo">
          <div className="logo-mark">
            <div className="logo-icon">
              <ShieldCheck size={20} strokeWidth={2.5} color="#fff" />
            </div>
            <div className="logo-text">Admin<span>Portal</span></div>
          </div>
        </div>

        <nav className="sidebar-nav">
          <div className="nav-section-title">Gestão de Plataforma</div>
          {adminNavItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
            >
              <item.icon className="nav-icon" size={17} />
              {item.label}
            </NavLink>
          ))}
          
          <div className="nav-section-title">Atalhos</div>
          <button className="nav-item" onClick={handleBackToApp}>
            <ChevronLeft className="nav-icon" size={17} />
            Voltar ao Aplicativo
          </button>
        </nav>

        <div className="sidebar-footer">
          <div className="user-info">
            <div className="user-avatar" style={{ background: 'var(--admin-accent)' }}>
              {userName.charAt(0)}
            </div>
            <div style={{ flex: 1 }}>
              <div className="user-name">{userName} <span className="admin-badge">Super</span></div>
              <div className="user-email">Painel Administrativo</div>
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

      <main className="main-content" style={{ background: '#020617' }}>
        <Outlet />
      </main>
    </div>
  )
}
