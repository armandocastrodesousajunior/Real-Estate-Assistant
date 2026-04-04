import { Outlet, NavLink, useNavigate } from 'react-router-dom'
import { useState } from 'react'
import {
  LayoutDashboard, Building2, Bot, Users, LogOut, Activity, Home,
  ChevronDown, ChevronUp, Wrench
} from 'lucide-react'

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
]

export default function Layout() {
  const navigate = useNavigate()

  const handleLogout = () => {
    localStorage.removeItem('rea_token')
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
    </div>
  )
}
