import { Outlet, NavLink, useNavigate } from 'react-router-dom'
import { 
  User, Building, Shield, ArrowLeft, Settings as SettingsIcon,
  ChevronRight, Brain, Cpu, MessageSquare
} from 'lucide-react'

export default function SettingsLayout() {
  const navigate = useNavigate()

  const settingsNavItems = [
    { to: '/settings', icon: User, label: 'Meu Perfil', end: true },
    { to: '/settings/workspace', icon: Building, label: 'Configurações Gerais' },
    { to: '/settings/tokens', icon: Shield, label: 'Planos & Consumo' },
  ]

  return (
    <div className="app-shell" style={{ backgroundColor: 'var(--bg-base)' }}>
      {/* Settings Internal Sidebar */}
      <aside className="sidebar" style={{ width: '280px' }}>
        <div className="sidebar-logo" style={{ padding: '24px 20px' }}>
          <button 
            onClick={() => navigate('/dashboard')}
            className="flex items-center gap-2 text-muted hover:text-primary transition-colors mb-6"
            style={{ fontSize: '0.85rem', fontWeight: 600, background: 'transparent' }}
          >
            <ArrowLeft size={16} /> Voltar ao Dashboard
          </button>
          
          <div className="flex items-center gap-3">
            <div className="logo-icon" style={{ width: '32px', height: '32px' }}>
              <SettingsIcon size={16} color="#fff" />
            </div>
            <h2 className="page-header-title" style={{ fontSize: '1.2rem', margin: 0 }}>Ajustes</h2>
          </div>
        </div>

        <nav className="sidebar-nav" style={{ padding: '20px 12px' }}>
          <div className="nav-section-title">Geral</div>
          {settingsNavItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
            >
              <item.icon className="nav-icon" size={17} />
              <span style={{ flex: 1 }}>{item.label}</span>
              <ChevronRight className="opacity-0 group-hover:opacity-50" size={12} />
            </NavLink>
          ))}
        </nav>

        <div className="sidebar-footer" style={{ border: 'none', padding: '20px' }}>
          <div className="p-4 rounded-lg bg-elevated border border-border">
            <div className="text-xs font-bold uppercase tracking-wider text-muted mb-1">Versão</div>
            <div className="text-sm font-mono text-primary">v1.2.4-SaaS</div>
          </div>
        </div>
      </aside>

      <main className="main-content" style={{ marginLeft: '280px', backgroundColor: 'var(--bg-base)', minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
        <div className="page-container" style={{ maxWidth: '900px', margin: '0 auto', width: '100%' }}>
          <Outlet />
        </div>
      </main>
    </div>
  )
}
