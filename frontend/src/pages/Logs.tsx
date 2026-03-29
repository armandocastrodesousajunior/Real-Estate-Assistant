import { useEffect, useState } from 'react'
import { Activity, ArrowRight, RefreshCw, ServerCrash, Clock } from 'lucide-react'
import { logsAPI } from '../services/api'
import TraceModal from '../components/TraceModal/TraceModal'

interface LogEntry {
  id: number
  session_id: string
  created_at: string
  agent_slug: string
  metadata: {
    supervisor?: any
    supervisor_selection?: string
    final_agent?: string
    calls?: Array<{
      agent_slug: string
      success: boolean
      redirected_to?: string
      redirect_reason?: string
    }>
  }
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
    } catch (error) {
      console.error('Erro ao carregar logs:', error)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchLogs()
  }, [])

  return (
    <div className="page-container" style={{ padding: '24px', maxWidth: '1200px', margin: '0 auto' }}>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Activity className="text-white" /> System Logs
          </h1>
          <p className="text-muted mt-1 text-sm">
            Auditoria de roteamento e redirecionamentos inteligentes (Self-Evaluation).
          </p>
        </div>
        <button onClick={fetchLogs} disabled={loading} className="btn btn-outline flex items-center gap-2">
          <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
          {loading ? 'Atualizando...' : 'Atualizar Logs'}
        </button>
      </div>

      <div className="card" style={{ overflowX: 'auto' }}>
        {logs.length === 0 && !loading ? (
          <div className="flex flex-col items-center justify-center p-12 text-center text-muted">
            <ServerCrash size={48} className="mb-4 opacity-50" />
            <h3>Nenhum log encontrado.</h3>
            <p className="text-sm">As interações dos agentes aparecerão aqui.</p>
          </div>
        ) : (
          <table className="w-full text-left border-collapse">
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border)', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                <th className="p-3">ID Mensagem</th>
                <th className="p-3">Data / Hora</th>
                <th className="p-3">Sessão</th>
                <th className="p-3">Seleção Inicial (Supervisor)</th>
                <th className="p-3">Redirecionamentos</th>
                <th className="p-3">Agente Final</th>
              </tr>
            </thead>
            <tbody>
              {logs.map((log) => (
                <tr 
                  key={log.id} 
                  style={{ borderBottom: '1px solid var(--border)', fontSize: '0.9rem', cursor: 'pointer' }} 
                  className="hover:bg-white/5 transition-colors"
                  onClick={() => {
                    if (log.metadata) {
                      setSelectedTrace(log.metadata)
                    }
                  }}
                  title="Clique para ver Detalhes do Roteamento"
                >
                  <td className="p-3 font-mono text-xs opacity-70 flex items-center gap-1">
                    #{log.id}
                  </td>
                  <td className="p-3 whitespace-nowrap">
                    <div className="flex items-center gap-1.5 text-muted">
                      <Clock size={12} />
                      {new Date(log.created_at).toLocaleString('pt-BR')}
                    </div>
                  </td>
                  <td className="p-3 font-mono text-xs" style={{ color: '#FFFFFF' }}>
                    {log.session_id.split('-')[0]}...
                  </td>
                  <td className="p-3">
                    {log.metadata?.supervisor_selection ? (
                      <span className="badge badge-muted">{log.metadata.supervisor_selection}</span>
                    ) : (
                      <span className="text-muted italic">N/A</span>
                    )}
                  </td>
                  <td className="p-3">
                    {log.metadata?.calls && log.metadata.calls.filter(c => !c.success).length > 0 ? (
                      <div className="flex flex-col gap-1">
                        {log.metadata.calls.filter(c => !c.success).map((c, i) => (
                          <div key={i} className="flex items-center gap-1.5 text-xs bg-white/5 p-1.5 rounded" title={c.redirect_reason}>
                            <span style={{ color: '#A3A3A3' }}>{c.agent_slug}</span>
                            <ArrowRight size={10} className="text-muted" />
                            <span style={{ color: '#FFFFFF' }}>{c.redirected_to}</span>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <span className="text-muted text-sm italic">Direto</span>
                    )}
                  </td>
                  <td className="p-3 font-medium" style={{ color: '#FFFFFF' }}>
                    {log.agent_slug || log.metadata?.final_agent || 'N/A'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      <TraceModal 
        isOpen={selectedTrace !== null} 
        onClose={() => setSelectedTrace(null)} 
        trace={selectedTrace} 
      />
    </div>
  )
}
