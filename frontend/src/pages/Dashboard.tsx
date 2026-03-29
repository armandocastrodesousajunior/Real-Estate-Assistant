import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Building2, Users, MessageSquare, Bot, TrendingUp, Activity } from 'lucide-react'
import { propertiesAPI, leadsAPI, chatAPI, agentsAPI } from '../services/api'

interface Stats {
  properties: number
  leads: number
  conversations: number
  agents: number
}

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
        setStats({
          properties: propRes.status === 'fulfilled' ? (propRes.value as any).data.total : 0,
          leads: leadRes.status === 'fulfilled' ? (leadRes.value as any).data.total : 0,
          conversations: convRes.status === 'fulfilled' ? (convRes.value as any).data.length : 0,
          agents: 0
        })

        if (agentRes.status === 'fulfilled') {
          const visible = (agentRes.value as any).data.filter((a: any) => a.slug !== 'supervisor')
          setAgents(visible)
          setStats(prev => ({ ...prev, agents: visible.length }))
        }
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  const statCards = [
    { label: 'Imóveis', value: stats.properties, icon: '🏠', color: '#3B82F6', bg: 'rgba(59,130,246,0.12)', path: '/properties' },
    { label: 'Leads', value: stats.leads, icon: '👤', color: '#10B981', bg: 'rgba(16,185,129,0.12)', path: '/leads' },
    { label: 'Conversas', value: stats.conversations, icon: '💬', color: '#F59E0B', bg: 'rgba(245,158,11,0.12)', path: '/chat' },
    { label: 'Agentes Ativos', value: agents.filter(a => a.is_active).length, icon: '🤖', color: '#8B5CF6', bg: 'rgba(139,92,246,0.12)', path: '/agents' },
  ]

  return (
    <div className="page-container">
      {/* Header */}
      <div className="page-header">
        <div>
          <h1 className="page-header-title">Dashboard</h1>
          <p className="page-header-sub">Visão geral do sistema Real-Estate-Assistant</p>
        </div>
        <button className="btn btn-primary" onClick={() => navigate('/chat')}>
          <MessageSquare size={16} />
          Abrir Chat IA
        </button>
      </div>

      {/* Stats */}
      <div className="stats-grid">
        {statCards.map((s) => (
          <div key={s.label} className="stat-card" style={{ cursor: 'pointer' }} onClick={() => navigate(s.path)}>
            <div className="stat-icon" style={{ background: s.bg, color: s.color }}>
              <span style={{ fontSize: '22px' }}>{s.icon}</span>
            </div>
            <div>
              <div className="stat-value">{loading ? '—' : s.value}</div>
              <div className="stat-label">{s.label}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Agents Grid */}
      <div className="card">
        <div className="card-header">
          <span className="card-title">🤖 Agentes de IA</span>
          <button className="btn btn-secondary btn-sm" onClick={() => navigate('/agents')}>
            Gerenciar
          </button>
        </div>
        <div className="card-body">
          {loading ? (
            <div className="loading-center"><div className="spinner" /></div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '14px' }}>
              {agents.map((agent) => (
                <div key={agent.slug} className="agent-card" style={{ opacity: agent.is_active ? 1 : 0.5 }}>
                  <div className="agent-header">
                    <div className="agent-emoji" style={{ background: `${agent.color}22` }}>
                      {agent.emoji}
                    </div>
                    <div>
                      <div className="agent-name">{agent.name}</div>
                      <div className="agent-slug">{agent.slug}</div>
                    </div>
                    <div style={{ marginLeft: 'auto' }}>
                      <span className={`badge ${agent.is_active ? 'badge-success' : 'badge-muted'}`}>
                        {agent.is_active ? '● Online' : '○ Off'}
                      </span>
                    </div>
                  </div>
                  <div className="agent-model">{agent.model}</div>
                  <div className="agent-stats">
                    <div className="agent-stat">
                      <div className="agent-stat-val">{agent.total_calls}</div>
                      <div className="agent-stat-key">Chamadas</div>
                    </div>
                    <div className="agent-stat">
                      <div className="agent-stat-val">{(agent.total_tokens_used / 1000).toFixed(1)}k</div>
                      <div className="agent-stat-key">Tokens</div>
                    </div>
                    <div className="agent-stat">
                      <div className="agent-stat-val">{agent.avg_response_time_ms.toFixed(0)}ms</div>
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
      <div style={{ marginTop: '20px', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '12px' }}>
        {[
          { label: 'Cadastrar Imóvel', icon: '🏠', path: '/properties/new', color: '#3B82F6' },
          { label: 'Ver Chat IA', icon: '💬', path: '/chat', color: '#F59E0B' },
          { label: 'Editar Prompts', icon: '✍️', path: '/prompts', color: '#EF4444' },
          { label: 'Gerenciar Leads', icon: '👤', path: '/leads', color: '#10B981' },
        ].map((a) => (
          <button
            key={a.path}
            className="btn btn-secondary"
            style={{ justifyContent: 'flex-start', gap: '10px', padding: '14px 16px' }}
            onClick={() => navigate(a.path)}
          >
            <span style={{ fontSize: '18px' }}>{a.icon}</span>
            {a.label}
          </button>
        ))}
      </div>
    </div>
  )
}
