import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Building2, Users, MessageSquare, Bot, Plus, TrendingUp, ArrowUpRight } from 'lucide-react'
import { propertiesAPI, leadsAPI, chatAPI, agentsAPI } from '../services/api'
import AgentIcon from '../components/AgentIcon'

interface Stats { properties: number; leads: number; conversations: number; agents: number }

const STAT_COLORS = [
  { bg: 'linear-gradient(135deg,rgba(16,185,129,0.15),rgba(16,185,129,0.05))', border: 'rgba(16,185,129,0.3)', icon: 'var(--success)', iconBg: 'var(--success-dim)' },
  { bg: 'linear-gradient(135deg,rgba(99,102,241,0.15),rgba(99,102,241,0.05))', border: 'rgba(99,102,241,0.3)', icon: 'var(--primary)', iconBg: 'var(--primary-dim)' },
  { bg: 'linear-gradient(135deg,rgba(245,158,11,0.15),rgba(245,158,11,0.05))', border: 'rgba(245,158,11,0.3)', icon: 'var(--warning)', iconBg: 'var(--warning-dim)' },
  { bg: 'linear-gradient(135deg,rgba(59,130,246,0.15),rgba(59,130,246,0.05))', border: 'rgba(59,130,246,0.3)', icon: 'var(--info)', iconBg: 'var(--info-dim)' },
]

const QUICK_ACTIONS = [
  { label: 'Cadastrar Imóvel', icon: Plus, path: '/properties/new', desc: 'Adicionar nova propriedade', color: 'var(--accent)' },
  { label: 'Chat com IA', icon: MessageSquare, path: '/playground/agents', desc: 'Conversar com os agentes', color: 'var(--primary)' },
  { label: 'Gerenciar Leads', icon: Users, path: '/leads', desc: 'Ver funil de vendas', color: 'var(--warning)' },
  { label: 'Ver Ferramentas', icon: TrendingUp, path: '/playground/tools', desc: 'Configurar ferramentas', color: 'var(--info)' },
]

export default function Dashboard() {
  const navigate = useNavigate()
  const [stats, setStats] = useState<Stats>({ properties: 0, leads: 0, conversations: 0, agents: 0 })
  const [agents, setAgents] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const load = async () => {
      try {
        const [propRes, leadRes, convRes, agentRes] = await Promise.allSettled([
          propertiesAPI.list({ page_size: 1 }),
          leadsAPI.list({ page_size: 1 }),
          chatAPI.listConversations({ page_size: 1 }),
          agentsAPI.list(),
        ])
        const agentList = agentRes.status === 'fulfilled' ? (agentRes.value as any).data.filter((a: any) => a.slug !== 'supervisor') : []
        setAgents(agentList)
        setStats({
          properties: propRes.status === 'fulfilled' ? (propRes.value as any).data.total : 0,
          leads: leadRes.status === 'fulfilled' ? (leadRes.value as any).data.total : 0,
          conversations: convRes.status === 'fulfilled' ? (convRes.value as any).data.length : 0,
          agents: agentList.filter((a: any) => a.is_active).length,
        })
      } finally { setLoading(false) }
    }
    load()
  }, [])

  const statCards = [
    { label: 'Imóveis Cadastrados', value: stats.properties, icon: <Building2 size={20} />, path: '/properties' },
    { label: 'Leads no Funil', value: stats.leads, icon: <Users size={20} />, path: '/leads' },
    { label: 'Conversas Recentes', value: stats.conversations, icon: <MessageSquare size={20} />, path: '/playground/agents' },
    { label: 'Agentes Ativos', value: stats.agents, icon: <Bot size={20} />, path: '/playground/agents' },
  ]

  return (
    <div className="page-container">
      <div className="page-header">
        <div>
          <h1 className="page-header-title">Dashboard</h1>
          <p className="page-header-sub">Visão geral do sistema RealtyAI</p>
        </div>
        <button className="btn btn-primary" onClick={() => navigate('/playground/agents')}>
          <MessageSquare size={16} /> Abrir Chat IA
        </button>
      </div>

      {/* Stats */}
      <div className="stats-grid">
        {statCards.map((s, i) => {
          const c = STAT_COLORS[i]
          return (
            <div key={s.label} className="stat-card" style={{ background: c.bg, borderColor: c.border }} onClick={() => navigate(s.path)}>
              <div className="stat-icon" style={{ background: c.iconBg, color: c.icon }}>{s.icon}</div>
              <div>
                <div className="stat-value">{loading ? '—' : s.value}</div>
                <div className="stat-label">{s.label}</div>
              </div>
              <ArrowUpRight size={16} style={{ marginLeft: 'auto', color: c.icon, opacity: 0.6 }} />
            </div>
          )
        })}
      </div>

      {/* Agents Grid */}
      <div className="card" style={{ marginBottom: '24px' }}>
        <div className="card-header">
          <span className="card-title">🤖 Agentes de IA Especialistas</span>
          <button className="btn btn-secondary btn-sm" onClick={() => navigate('/playground/agents')}>
            Gerenciar Agentes
          </button>
        </div>
        <div className="card-body">
          {loading ? (
            <div className="loading-center"><div className="spinner" /></div>
          ) : agents.length === 0 ? (
            <div className="empty-state" style={{ padding: '40px' }}>
              <div className="empty-icon">🤖</div>
              <h3>Nenhum agente configurado</h3>
              <p>Configure agentes no Playground</p>
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(280px,1fr))', gap: '14px' }}>
              {agents.map((agent) => (
                <div
                  key={agent.slug}
                  className="agent-card"
                  style={{ opacity: agent.is_active ? 1 : 0.5, cursor: 'pointer' }}
                  onClick={() => navigate('/playground/agents')}
                >
                  <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '8px' }}>
                    <span className={`badge ${agent.is_active ? 'badge-success' : 'badge-muted'}`}>
                      {agent.is_active ? '● Ativo' : '○ Inativo'}
                    </span>
                  </div>
                  <div className="agent-header">
                    <AgentIcon name={agent.name} emoji={agent.emoji} size="lg" />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div className="agent-name">{agent.name}</div>
                      <div className="agent-slug">{agent.slug}</div>
                    </div>
                  </div>
                  <div className="agent-model">{agent.model}</div>
                  <div className="agent-stats">
                    <div className="agent-stat">
                      <div className="agent-stat-val">{agent.total_calls ?? 0}</div>
                      <div className="agent-stat-key">Chamadas</div>
                    </div>
                    <div className="agent-stat">
                      <div className="agent-stat-val">{((agent.total_tokens_used ?? 0) / 1000).toFixed(1)}k</div>
                      <div className="agent-stat-key">Tokens</div>
                    </div>
                    <div className="agent-stat">
                      <div className="agent-stat-val">{(agent.avg_response_time_ms ?? 0).toFixed(0)}ms</div>
                      <div className="agent-stat-key">Resp. média</div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Quick Actions */}
      <div>
        <h2 style={{ fontFamily: 'var(--font-display)', fontSize: '1rem', fontWeight: 700, color: 'var(--text-secondary)', marginBottom: '14px', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
          Ações Rápidas
        </h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(200px,1fr))', gap: '12px' }}>
          {QUICK_ACTIONS.map((a) => (
            <button
              key={a.path}
              onClick={() => navigate(a.path)}
              style={{
                background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)',
                padding: '18px 20px', cursor: 'pointer', transition: 'var(--transition)', textAlign: 'left',
                display: 'flex', flexDirection: 'column', gap: '10px'
              }}
              onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.borderColor = a.color; (e.currentTarget as HTMLElement).style.transform = 'translateY(-2px)' }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.borderColor = 'var(--border)'; (e.currentTarget as HTMLElement).style.transform = 'none' }}
            >
              <div style={{ width: 38, height: 38, borderRadius: 'var(--radius-md)', background: `${a.color}20`, display: 'flex', alignItems: 'center', justifyContent: 'center', color: a.color }}>
                <a.icon size={18} />
              </div>
              <div>
                <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: '0.9rem', color: 'var(--text-primary)' }}>{a.label}</div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '2px' }}>{a.desc}</div>
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
