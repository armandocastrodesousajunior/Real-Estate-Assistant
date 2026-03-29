import { useState } from 'react'
import { X, ArrowRight, User, Bot, Search, Code, List } from 'lucide-react'

interface TraceModalProps {
  isOpen: boolean
  onClose: () => void
  trace: {
    supervisor?: any
    supervisor_selection?: string
    calls?: Array<{
      agent_slug: string
      success: boolean
      redirected_to?: string
      redirect_reason?: string
      system_prompt?: string
      messages_sent?: any[]
      raw_ai_output?: string
    }>
    final_agent?: string
  }
}

export default function TraceModal({ isOpen, onClose, trace }: TraceModalProps) {
  const [showJson, setShowJson] = useState(false)

  if (!isOpen || !trace) return null

  return (
    <div className="modal-overlay" onClick={onClose} style={{
      position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
      backgroundColor: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999
    }}>
      <div className="modal-content card" onClick={e => e.stopPropagation()} style={{
        width: '100%', maxWidth: '600px', maxHeight: '85vh', overflowY: 'auto',
        padding: '24px', position: 'relative', border: '1px solid var(--border)'
      }}>
        <button onClick={onClose} className="btn btn-ghost" style={{ position: 'absolute', top: '16px', right: '16px', padding: '4px' }}>
          <X size={20} />
        </button>

        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-bold flex items-center gap-2" style={{ color: 'var(--accent)', margin: 0 }}>
            <Search size={22} /> Rastreamento de Handoff (IA)
          </h2>
          <button 
            onClick={() => setShowJson(!showJson)}
            className="btn btn-sm btn-outline flex items-center gap-2"
            style={{ fontSize: '0.75rem', marginRight: '30px' }}
          >
            {showJson ? <><List size={14} /> Ver Linha do Tempo</> : <><Code size={14} /> Ver Log JSON</>}
          </button>
        </div>

        {showJson ? (
          <div className="json-view" style={{
            background: 'rgba(0,0,0,0.3)',
            padding: '16px',
            borderRadius: '8px',
            border: '1px solid var(--border)',
            fontFamily: 'monospace',
            fontSize: '0.85rem',
            color: '#A78BFA',
            whiteSpace: 'pre-wrap',
            overflowX: 'auto'
          }}>
            {JSON.stringify(trace, null, 2)}
          </div>
        ) : (
          <div className="timeline" style={{ display: 'flex', flexDirection: 'column', gap: '20px', position: 'relative' }}>
            {/* Linha conectora na lateral */}
            <div style={{ position: 'absolute', left: '23px', top: '30px', bottom: '30px', width: '2px', background: 'var(--border)', zIndex: 0 }}></div>

            {/* Passo 1: Supervisor */}
            <div className="timeline-item" style={{ display: 'flex', gap: '16px', zIndex: 1, position: 'relative' }}>
              <div className="timeline-icon" style={{
                width: '48px', height: '48px', borderRadius: '50%', background: 'linear-gradient(135deg, #8B5CF6, #3B82F6)',
                display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', flexShrink: 0, boxShadow: '0 4px 12px rgba(139, 92, 246, 0.3)'
              }}>
                <User size={20} />
              </div>
              <div className="timeline-content" style={{ flex: 1, background: 'rgba(255,255,255,0.03)', padding: '16px', borderRadius: '8px', border: '1px solid var(--border)' }}>
                <div className="text-xs text-muted font-mono mb-1">Passo 1 • Classificação Inicial</div>
                <div className="font-semibold text-white">Supervisor (Roteamento)</div>
                <p className="text-sm text-muted mt-2" style={{ lineHeight: 1.5 }}>
                  Analisou a mensagem do cliente e decidiu que a área responsável seria: <span className="badge badge-outline text-accent">{trace.supervisor_selection}</span>.
                </p>
              </div>
            </div>

            {/* Passos de Redirect / Chamadas intermediárias */}
            {trace.calls && trace.calls.filter(c => !c.success).map((c, i) => (
              <div key={i} className="timeline-item" style={{ display: 'flex', gap: '16px', zIndex: 1, position: 'relative' }}>
                <div className="timeline-icon" style={{
                  width: '48px', height: '48px', borderRadius: '50%', background: 'rgba(239, 68, 68, 0.2)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#EF4444', flexShrink: 0, border: '1px solid rgba(239, 68, 68, 0.5)'
                }}>
                  <ArrowRight size={20} />
                </div>
                <div className="timeline-content" style={{ flex: 1, background: 'rgba(255,255,255,0.03)', padding: '16px', borderRadius: '8px', border: '1px solid var(--border)' }}>
                  <div className="text-xs text-muted font-mono mb-1">Passo {i + 2} • Avaliação e Recusa</div>
                  <div className="font-semibold" style={{ color: '#EF4444' }}>Agente {c.agent_slug}</div>
                  <div className="mt-3 p-3 rounded" style={{ background: 'rgba(0,0,0,0.3)', borderLeft: '3px solid #EF4444' }}>
                    <div className="text-xs text-muted uppercase font-bold mb-1 tracking-wider">Motivo da Recusa (Extraído do JSON)</div>
                    <p className="text-sm text-gray-300 italic">"{c.redirect_reason}"</p>
                  </div>
                  <div className="mt-3 text-sm text-muted flex items-center gap-2">
                    <ArrowRight size={14} /> Delegado para: <span className="badge badge-outline">{c.redirected_to}</span>
                  </div>
                </div>
              </div>
            ))}

            {/* Passo Final */}
            <div className="timeline-item" style={{ display: 'flex', gap: '16px', zIndex: 1, position: 'relative' }}>
              <div className="timeline-icon" style={{
                width: '48px', height: '48px', borderRadius: '50%', background: 'linear-gradient(135deg, #10B981, #059669)',
                display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', flexShrink: 0, boxShadow: '0 4px 12px rgba(16, 185, 129, 0.3)'
              }}>
                <Bot size={24} />
              </div>
              <div className="timeline-content" style={{ flex: 1, background: 'rgba(255,255,255,0.03)', padding: '16px', borderRadius: '8px', border: '1px solid var(--border)' }}>
                <div className="text-xs text-muted font-mono mb-1">Resposta Final</div>
                <div className="font-semibold text-emerald-400">Agente {trace.final_agent}</div>
                <p className="text-sm text-muted mt-2" style={{ lineHeight: 1.5 }}>
                  Assumiu o escopo da solicitação, processou os dados com sucesso e gerou a resposta no chat.
                </p>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
