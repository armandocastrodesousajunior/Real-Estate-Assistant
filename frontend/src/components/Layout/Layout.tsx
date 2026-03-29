import { Outlet, NavLink, useNavigate } from 'react-router-dom'
import {
  LayoutDashboard, Building2, MessageSquare, Bot, FileText,
  Users, LogOut, Activity, Home
} from 'lucide-react'

const navItems = [
  { to: '/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/properties', icon: Building2, label: 'Imóveis' },
  { to: '/leads', icon: Users, label: 'Leads' },
  { to: '/chat', icon: MessageSquare, label: 'Chat IA' },
  { to: '/agents', icon: Bot, label: 'Agentes' },
  { to: '/prompts', icon: FileText, label: 'Prompts' },
  { to: '/logs', icon: Activity, label: 'System Logs' },
]

export default function Layout() {
  const navigate = useNavigate()
  const userName = 'Admin'

  const handleLogout = () => {
    localStorage.removeItem('rea_token')
    navigate('/login')
    window.location.reload()
  }

  return (
    <div className="app-shell">
      {/* Sidebar */}
      <aside className="sidebar">
        <div className="sidebar-logo">
          <div className="logo-mark">
            <div className="logo-icon">
              <Home size={18} strokeWidth={2.5} color="#000" />
            </div>
            <div className="logo-text">Real<span>Estate</span></div>
          </div>
        </div>

        <nav className="sidebar-nav">
          <div className="nav-section-title">Menu</div>
          {navItems.map(({ to, icon: Icon, label }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
            >
              <Icon className="nav-icon" size={17} />
              {label}
            </NavLink>
          ))}
        </nav>

        <div className="sidebar-footer">
          <div className="user-info">
            <div className="user-avatar">A</div>
            <div style={{ flex: 1 }}>
              <div className="user-name">{userName}</div>
              <div className="user-email">admin@realestateassistant.com</div>
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

      {/* Main */}
      <main className="main-content">
        <Outlet />
      </main>
    </div>
  )
}
