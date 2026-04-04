import { useEffect, useState } from 'react'
import { Activity, RefreshCw, ServerCrash, Clock, ArrowRight, ChevronRight } from 'lucide-react'
import { logsAPI } from '../services/api'
import TraceModal from '../components/TraceModal/TraceModal'

interface LogEntry {
  id: number; session_id: string; created_at: string; agent_slug: string;
  metadata: { supervisor?: any; supervisor_selection?: string; final_agent?: string; calls?: Array<{ agent_slug: string; success: boolean; redirected_to?: string; redirect_reason?: string }> }
}

export default function Logs() {
  const [logs, setLogs] = useState<LogEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedTrace, setSelectedTrace] = useState<any>(null)

  const fetchLogs = async () => {
    setLoading(true)
    try {
      const { data } = await logsAPI.list()
      setLogs(data)
    } catch (e) { console.error(e) } finally { setLoading(false) }
  }

  useEffect(() => { fetchLogs() }, [])

  return (
    <div className="page-container">
      <div className="page-header">
        <div>
          <h1 className="page-header-title" style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <Activity size={24} style={{ color: 'var(--primary)' }} /> System Logs
          </h1>
          <p className="page-header-sub">Auditoria de roteamento e redirecionamentos inteligentes dos agentes</p>
        </div>
        <button onClick={fetchLogs} disabled={loading} className="btn btn-secondary" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <RefreshCw size={15} className={loading ? 'animate-spin' : ''} />
          {loading ? 'Atualizando...' : 'Atualizar'}
        </button>
      </div>

      {loading ? (
        <div className="loading-center"><div className="spinner-lg spinner" /></div>
      ) : logs.length === 0 ? (
        <div className="card">
          <div className="empty-state" style={{ padding: '80px' }}>
            <div className="empty-icon"><ServerCrash size={40} style={{ color: 'var(--text-muted)' }} /></div>
            <h3>Nenhum log encontrado</h3>
            <p>As interações dos agentes aparecerão aqui após o primeiro uso do Chat IA</p>
          </div>
        </div>
      ) : (
        <div className="table-wrapper">
          <table>
            <thead>
              <tr>
                <th>#ID</th>
                <th>Data / Hora</th>
                <th>Sessão</th>
                <th>Seleção Inicial</th>
                <th>Redirecionamentos</th>
                <th>Agente Final</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {logs.map((log) => {
                const redirects = log.metadata?.calls?.filter(c => !c.success) || []
                const hasRedirects = redirects.length > 0
                return (
                  <tr
                    key={log.id}
                    onClick={() => log.metadata && setSelectedTrace(log.metadata)}
                    title="Clique para ver detalhes do roteamento"
                    style={{ cursor: 'pointer' }}
                  >
                    <td style={{ fontFamily: 'var(--font-mono)', fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                      #{log.id}
                    </td>
                    <td style={{ whiteSpace: 'nowrap' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--text-muted)', fontSize: '0.82rem' }}>
                        <Clock size={12} />
                        {new Date(log.created_at).toLocaleString('pt-BR')}
                      </div>
                    </td>
                    <td style={{ fontFamily: 'var(--font-mono)', fontSize: '0.78rem', color: 'var(--primary)' }}>
                      {log.session_id.split('-')[0]}...
                    </td>
                    <td>
                      {log.metadata?.supervisor_selection
                        ? <span className="badge badge-primary">{log.metadata.supervisor_selection}</span>
                        : <span style={{ color: 'var(--text-muted)', fontSize: '0.8rem', fontStyle: 'italic' }}>N/A</span>}
                    </td>
                    <td>
                      {hasRedirects ? (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                          {redirects.map((c, i) => (
                            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.78rem', background: 'var(--warning-dim)', padding: '3px 8px', borderRadius: 'var(--radius-sm)', width: 'fit-content' }} title={c.redirect_reason}>
                              <span style={{ color: 'var(--text-muted)' }}>{c.agent_slug}</span>
                              <ArrowRight size={10} style={{ color: 'var(--warning)' }} />
                              <span style={{ color: 'var(--warning)', fontWeight: 600 }}>{c.redirected_to}</span>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <span style={{ color: 'var(--success)', fontSize: '0.8rem', fontWeight: 600 }}>✓ Direto</span>
                      )}
                    </td>
                    <td>
                      <span className="badge badge-success">{log.agent_slug || log.metadata?.final_agent || 'N/A'}</span>
                    </td>
                    <td>
                      <ChevronRight size={14} style={{ color: 'var(--text-muted)' }} />
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      <TraceModal isOpen={selectedTrace !== null} onClose={() => setSelectedTrace(null)} trace={selectedTrace} />
    </div>
  )
}
