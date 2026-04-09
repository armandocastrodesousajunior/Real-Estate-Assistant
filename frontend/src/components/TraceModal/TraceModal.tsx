import { useState } from 'react'
import { X, ArrowRight, User, Bot, Search, Code, List, ChevronDown, ChevronRight, MessageSquare, Terminal, FileText } from 'lucide-react'

interface TraceCall {
  agent_slug: string
  success: boolean
  redirected_to?: string
  redirect_reason?: string
  system_prompt?: string
  messages_sent?: any[]
  raw_ai_output?: string
}

interface TraceModalProps {
  isOpen: boolean
  onClose: () => void
  trace: {
    supervisor?: any
    supervisor_selection?: string
    calls?: TraceCall[]
    final_agent?: string
  }
}

const CodeBlock = ({ title, icon: Icon, content }: { title: string; icon: any; content: string }) => {
  if (!content) return null;
  return (
    <div style={{ marginTop: '16px', background: 'rgba(0,0,0,0.4)', borderRadius: '6px', border: '1px solid var(--border)', overflow: 'hidden' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 12px', background: 'rgba(255,255,255,0.05)', borderBottom: '1px solid var(--border)', fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
        <Icon size={14} /> {title}
      </div>
      <div style={{ padding: '12px', maxHeight: '300px', overflowY: 'auto', fontSize: '0.75rem', fontFamily: 'var(--font-mono)', color: '#e0e0e0', whiteSpace: 'pre-wrap', lineHeight: 1.5 }}>
        {content}
      </div>
    </div>
  )
}

const AgentTraceStep = ({ call, stepNumber, isLast }: { call: TraceCall; stepNumber: number; isLast: boolean }) => {
  const [expanded, setExpanded] = useState(false)

  const formatMessages = (messages: any[]) => {
    if (!messages || !Array.isArray(messages)) return 'Nenhum contexto de mensagens disponível.';
    return messages.map(m => `[${m.role.toUpperCase()}]\n${m.content}`).join('\n\n');
  }

  return (
    <div className="timeline-item" style={{ display: 'flex', gap: '16px', zIndex: 1, position: 'relative' }}>
      <div className="timeline-icon" style={{
        width: '48px', height: '48px', borderRadius: '50%', background: call.success ? 'var(--primary)' : 'rgba(255,255,255,0.05)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', color: call.success ? '#FFF' : '#FFFFFF', flexShrink: 0, 
        border: call.success ? 'none' : '1px solid rgba(255,255,255,0.1)'
      }}>
        {call.success ? <Bot size={22} /> : <ArrowRight size={20} />}
      </div>
      <div className="timeline-content" style={{ flex: 1, background: 'rgba(255,255,255,0.03)', padding: '0', borderRadius: '8px', border: call.success ? '1px solid var(--primary)' : '1px solid var(--border)', overflow: 'hidden' }}>
        
        {/* Header (Always Visible) */}
        <div style={{ padding: '16px', cursor: 'pointer' }} onClick={() => setExpanded(!expanded)}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div>
              <div className="text-xs text-muted font-mono mb-1">Passo {stepNumber} • {call.success ? 'Resposta Final' : 'Avaliação e Handoff'}</div>
              <div className="font-semibold text-white flex items-center gap-2">
                Agente: <span className={call.success ? '' : 'text-gray-400'}>{call.agent_slug}</span>
              </div>
            </div>
            <button className="btn btn-ghost p-1" style={{ color: 'var(--text-muted)' }}>
              {expanded ? <ChevronDown size={20} /> : <ChevronRight size={20} />}
            </button>
          </div>

          {!call.success && call.redirect_reason && (
            <div className="mt-3 p-3 rounded" style={{ background: 'rgba(255,255,255,0.05)', borderLeft: '3px solid var(--warning)' }}>
              <div className="text-xs text-muted uppercase font-bold mb-1 tracking-wider">Motivo da Recusa</div>
              <p className="text-sm text-gray-300 italic">"{call.redirect_reason}"</p>
            </div>
          )}

          {!call.success && call.redirected_to && (
             <div className="mt-3 text-sm text-muted flex items-center gap-2">
               <ArrowRight size={14} /> Delegado para próximo agente: <span className="badge badge-outline">{call.redirected_to}</span>
             </div>
          )}

          {call.success && (
            <p className="text-sm text-muted mt-2" style={{ lineHeight: 1.5 }}>
              Assumiu o escopo da solicitação de forma bem sucedida.
            </p>
          )}
        </div>

        {/* Expanded Body (Technical Details) */}
        {expanded && (
          <div style={{ padding: '0 16px 16px 16px', borderTop: '1px dashed var(--border)', marginTop: '8px', paddingTop: '16px' }}>
            <CodeBlock title="Raw AI Output (Resposta Bruta do Modelo)" icon={Terminal} content={call.raw_ai_output || 'N/A'} />
            <CodeBlock title="Contexto de Mensagens (Histórico)" icon={MessageSquare} content={formatMessages(call.messages_sent || [])} />
            <CodeBlock title="System Prompt Entregue ao Modelo" icon={FileText} content={call.system_prompt || 'N/A'} />
          </div>
        )}

      </div>
    </div>
  )
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
        width: '100%', maxWidth: '800px', maxHeight: '85vh', overflowY: 'auto',
        padding: '24px', position: 'relative', border: '1px solid var(--border)'
      }}>
        <button onClick={onClose} className="btn btn-ghost" style={{ position: 'absolute', top: '16px', right: '16px', padding: '4px' }}>
          <X size={20} />
        </button>

        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-bold flex items-center gap-2" style={{ color: '#FFFFFF', margin: 0 }}>
            <Search size={22} /> Rastreamento Detalhado de IA
          </h2>
          <button 
            onClick={() => setShowJson(!showJson)}
            className="btn btn-sm btn-outline flex items-center gap-2"
            style={{ fontSize: '0.75rem', marginRight: '30px' }}
          >
            {showJson ? <><List size={14} /> Ver Modo Interface</> : <><Code size={14} /> Ver Payload Completo</>}
          </button>
        </div>

        {showJson ? (
          <div className="json-view" style={{
            background: 'rgba(0,0,0,0.4)', padding: '16px', borderRadius: '8px', 
            border: '1px solid var(--border)', fontFamily: 'var(--font-mono)', fontSize: '0.75rem', 
            color: '#FFFFFF', whiteSpace: 'pre-wrap', overflowX: 'auto', maxHeight: '600px'
          }}>
            {JSON.stringify(trace, null, 2)}
          </div>
        ) : (
          <div className="timeline" style={{ display: 'flex', flexDirection: 'column', gap: '24px', position: 'relative' }}>
            {/* Main connecting line */}
            <div style={{ position: 'absolute', left: '23px', top: '30px', bottom: '30px', width: '2px', background: 'var(--border)', zIndex: 0 }}></div>

            {/* Step 1: Supervisor */}
            <div className="timeline-item" style={{ display: 'flex', gap: '16px', zIndex: 1, position: 'relative' }}>
            <div className="timeline-icon" style={{
                width: '48px', height: '48px', borderRadius: '50%', background: '#FFFFFF',
                display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#000000', flexShrink: 0
              }}>
                <User size={20} />
              </div>
              <div className="timeline-content" style={{ flex: 1, background: 'rgba(255,255,255,0.03)', padding: '16px', borderRadius: '8px', border: '1px solid var(--border)' }}>
                <div className="text-xs text-muted font-mono mb-1">Passo 1 • Classificação Inicial (Zero-Shot)</div>
                <div className="font-semibold text-white">Supervisor (Roteamento Rápido)</div>
                
                <div className="mt-2 text-sm">
                  <span className="text-muted">Ação principal: </span>
                  <span className="badge badge-primary">{trace.supervisor_selection}</span>
                </div>
                
                {trace.supervisor?.reason && (
                  <div className="mt-3 p-3 rounded" style={{ background: 'rgba(255,255,255,0.05)', borderLeft: '3px solid var(--text-muted)' }}>
                    <div className="text-xs text-muted uppercase font-bold mb-1 tracking-wider">Lógica do Supervisor</div>
                    <p className="text-sm text-gray-300 italic">"{trace.supervisor.reason}"</p>
                  </div>
                )}
              </div>
            </div>

            {/* Interação com Agentes */}
            {trace.calls && trace.calls.map((call, index) => (
              <AgentTraceStep 
                key={index} 
                call={call} 
                stepNumber={index + 2} 
                isLast={index === trace.calls!.length - 1} 
              />
            ))}
            
          </div>
        )}
      </div>
    </div>
  )
}
