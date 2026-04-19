import { useState } from 'react'
import { X, ArrowRight, User, Bot, Search, Code, List, ChevronDown, ChevronRight, MessageSquare, Terminal, FileText, Copy, Check, Wrench, Activity } from 'lucide-react'

interface TraceCall {
  agent_slug?: string
  agent?: string
  model?: string
  success?: boolean
  redirected_to?: string
  redirect_reason?: string
  system_prompt?: string
  messages_sent?: any[]
  messages?: any[]
  raw_ai_output?: string
  usage?: {
    prompt_tokens: number
    completion_tokens: number
    total_tokens: number
    total_cost?: number
  }
  tool_call?: {
    name: string
    arguments: any
  }
  tool_result?: any
}

interface TraceUsage {
  prompt_tokens: number
  completion_tokens: number
  total_tokens: number
  total_cost?: number
  cost?: number
  prompt_tokens_details?: {
    cached_tokens?: number
    [key: string]: any
  }
  completion_tokens_details?: {
    reasoning_tokens?: number
    [key: string]: any
  }
  cost_details?: {
    upstream_inference_cost?: number
    [key: string]: any
  }
}

interface TraceModalProps {
  isOpen: boolean
  onClose: () => void
  trace: {
    supervisor?: any
    supervisor_selection?: string
    calls?: TraceCall[]
    final_agent?: string
    total_usage?: TraceUsage
  }
}

const CodeBlock = ({ title, icon: Icon, content, variant = 'default' }: { title: string; icon: any; content: string; variant?: 'default' | 'context' }) => {
  if (!content) return null;
  const isContext = variant === 'context';
  
  return (
    <div style={{ 
      marginTop: '16px', 
      background: isContext ? 'rgba(59, 130, 246, 0.05)' : 'rgba(0,0,0,0.4)', 
      borderRadius: '8px', 
      border: isContext ? '1px solid rgba(59, 130, 246, 0.2)' : '1px solid var(--border)', 
      overflow: 'hidden' 
    }}>
      <div style={{ 
        display: 'flex', 
        alignItems: 'center', 
        gap: '8px', 
        padding: '8px 12px', 
        background: isContext ? 'rgba(59, 130, 246, 0.1)' : 'rgba(255,255,255,0.05)', 
        borderBottom: isContext ? '1px solid rgba(59, 130, 246, 0.2)' : '1px solid var(--border)', 
        fontSize: '0.72rem', 
        fontWeight: 700, 
        color: isContext ? 'var(--primary)' : 'var(--text-muted)', 
        textTransform: 'uppercase', 
        letterSpacing: '0.05em' 
      }}>
        <Icon size={14} /> {title}
      </div>
      <div style={{ 
        padding: '12px', 
        maxHeight: '400px', 
        overflowY: 'auto', 
        fontSize: '0.75rem', 
        fontFamily: 'var(--font-mono)', 
        color: isContext ? '#bfdbfe' : '#e0e0e0', 
        whiteSpace: 'pre-wrap', 
        lineHeight: 1.5 
      }}>
        {content}
      </div>
    </div>
  )
}

const AssistantContextCard = ({ content }: { content: string }) => {
  // Regex to identify blocks
  const blocks = [
    { id: 'ECOSYSTEM', label: 'Ecossistema Multi-Agente', icon: List, regex: /\[ECOSSISTEMA DE AGENTES DO WORKSPACE\]([\s\S]*?)\[\/ECOSSISTEMA DE AGENTES DO WORKSPACE\]/ },
    { id: 'TOOLS', label: 'Catálogo de Ferramentas do Sistema', icon: Wrench, regex: /\[CATÁLOGO DE FERRAMENTAS DO SISTEMA\]([\s\S]*?)\[\/CATÁLOGO DE FERRAMENTAS DO SISTEMA\]/ },
    { id: 'PROMPT', label: 'Prompt Atual (Em Edição)', icon: FileText, regex: /\[PROMPT ATUAL\]([\s\S]*?)\[\/PROMPT ATUAL\]/ },
    { id: 'ANALYSIS', label: 'Análise de Histórico / Logs', icon: Terminal, regex: /\[CONTEXTO DA CONVERSA - ANÁLISE\]([\s\S]*?)\[\/CONTEXTO DA CONVERSA - ANÁLISE\]/ }
  ];

  const foundBlocks = blocks.map(b => {
    const match = content.match(b.regex);
    return match ? { ...b, content: match[1].trim() } : null;
  }).filter(Boolean);

  if (foundBlocks.length === 0) return null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginTop: '16px' }}>
      {foundBlocks.map((block: any) => (
        <CodeBlock 
          key={block.id}
          title={block.label}
          icon={block.icon}
          content={block.content}
          variant="context"
        />
      ))}
    </div>
  );
}

const UsageStats = ({ usage, label = "Uso de Tokens" }: { usage?: TraceUsage | any, label?: string }) => {
  if (!usage) return null;
  
  const cost = usage.total_cost || usage.cost || 0;
  const hasCost = cost > 0;
  
  const cached = usage.prompt_tokens_details?.cached_tokens || 0;
  const reasoning = usage.completion_tokens_details?.reasoning_tokens || 0;

  return (
    <div style={{ 
      display: 'flex', 
      flexWrap: 'wrap',
      gap: '8px', 
      marginTop: '12px',
      padding: '8px 12px',
      background: 'rgba(255,255,255,0.03)',
      borderRadius: '6px',
      border: '1px solid rgba(255,255,255,0.05)'
    }}>
      <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', fontWeight: 600, width: '100%', marginBottom: '2px', textTransform: 'uppercase' }}>
        {label}
      </div>
      <div className="flex items-center gap-1.5 px-2 py-0.5 rounded bg-gray-800/50 border border-gray-700/50 text-[10px] text-gray-300">
        <ArrowRight size={10} className="text-blue-400" /> {usage.prompt_tokens || 0} In
      </div>
      
      {cached > 0 && (
        <div className="flex items-center gap-1.5 px-2 py-0.5 rounded bg-blue-900/30 border border-blue-500/30 text-[10px] text-blue-300 font-bold">
          <Check size={10} /> {cached} Cached
        </div>
      )}

      <div className="flex items-center gap-1.5 px-2 py-0.5 rounded bg-gray-800/50 border border-gray-700/50 text-[10px] text-gray-300">
        <ArrowRight size={10} className="text-green-400 rotate-180" /> {usage.completion_tokens || 0} Out
      </div>

      {reasoning > 0 && (
        <div className="flex items-center gap-1.5 px-2 py-0.5 rounded bg-purple-900/30 border border-purple-500/30 text-[10px] text-purple-300 font-bold">
          <Activity size={10} /> {reasoning} Reasoning
        </div>
      )}

      <div className="flex items-center gap-1.5 px-2 py-0.5 rounded bg-blue-900/20 border border-blue-800/30 text-[10px] text-blue-200">
        Total: {usage.total_tokens || 0}
      </div>
      
      {hasCost && (
        <div className="flex items-center gap-1.5 px-2 py-0.5 rounded bg-emerald-900/20 border border-emerald-800/30 text-[10px] text-emerald-300 font-bold ml-auto">
          Custo: ${cost.toFixed(6)}
        </div>
      )}
    </div>
  )
}

const AgentTraceStep = ({ call, stepNumber, isLast }: { call: TraceCall; stepNumber: number; isLast: boolean }) => {
  const [expanded, setExpanded] = useState(false)

  const formatMessages = (messages: any[]) => {
    if (!messages || !Array.isArray(messages)) return 'Nenhum contexto de mensagens disponível.';
    
    // Clean up content by removing structural blocks for the main thread view
    const cleanContent = (text: string) => {
      let cleaned = text;
      cleaned = cleaned.replace(/\[ECOSSISTEMA[\s\S]*?\/ECOSSISTEMA[^\]]*\]/g, '*(Estrutura do Ecossistema injetada)*');
      cleaned = cleaned.replace(/\[PROMPT ATUAL\][\s\S]*?\[\/PROMPT ATUAL\]/g, '*(Prompt atual para edição injetado)*');
      cleaned = cleaned.replace(/\[CONTEXTO DA CONVERSA[\s\S]*?\/CONTEXTO DA CONVERSA[^\]]*\]/g, '*(Logs e histórico para análise injetados)*');
      return cleaned;
    };

    return messages
      .filter(m => m.role !== 'system')
      .map(m => `[${m.role.toUpperCase()}]\n${cleanContent(m.content)}`)
      .join('\n\n');
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
              <div className="text-xs text-muted font-mono mb-1">
                Passo {stepNumber} • {
                  call.tool_call ? 'Chamada de Ferramenta (Tool Call)' :
                  call.success ? 'Resposta Final' : 'Avaliação e Handoff'
                }
              </div>
              <div className="font-semibold text-white flex items-center gap-2">
                {call.agent ? 'Entidade: ' : 'Agente: '} 
                <span className={call.success !== false ? '' : 'text-gray-400'}>{call.agent || call.agent_slug}</span>
              </div>
              
              <UsageStats usage={call.usage} label="Uso deste Step" />
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

          {call.tool_call && (
            <div className="mt-3 p-3 rounded" style={{ background: 'rgba(255,255,255,0.05)', borderLeft: '3px solid var(--primary)' }}>
              <div className="text-xs text-muted uppercase font-bold mb-1 tracking-wider flex items-center gap-2">
                <Wrench size={14} /> FERRAMENTA EXECUTADA: {call.tool_call.name}
              </div>
              <p className="text-xs text-gray-300 font-mono mt-2" style={{ whiteSpace: 'pre-wrap', maxHeight: '150px', overflowY: 'auto' }}>
                {JSON.stringify(call.tool_call.arguments, null, 2)}
              </p>

              {call.tool_result && (
                <div className="mt-4 pt-3" style={{ borderTop: '1px solid rgba(255,255,255,0.1)' }}>
                  <div className="text-xs uppercase font-bold mb-1 tracking-wider flex items-center gap-2" style={{ color: 'var(--success)' }}>
                    <Activity size={14} /> DADOS RETORNADOS PELA FERRAMENTA
                  </div>
                  <div className="text-xs text-gray-300 font-mono mt-2" style={{ whiteSpace: 'pre-wrap', maxHeight: '200px', overflowY: 'auto', background: 'rgba(0,0,0,0.3)', padding: '10px', borderRadius: '4px', border: '1px solid rgba(16,185,129,0.2)' }}>
                    {JSON.stringify(call.tool_result, null, 2)}
                  </div>
                </div>
              )}
            </div>
          )}

          {call.success && !call.tool_call && (
            <p className="text-sm text-muted mt-2" style={{ lineHeight: 1.5 }}>
              Assumiu o escopo da solicitação de forma bem sucedida.
            </p>
          )}
        </div>

        {/* Expanded Body (Technical Details) */}
        {expanded && (
          <div style={{ padding: '0 16px 16px 16px', borderTop: '1px dashed var(--border)', marginTop: '8px', paddingTop: '16px' }}>
            <CodeBlock title={call.agent ? "AI Response Output" : "Raw AI Output (Resposta Bruta do Modelo)"} icon={Terminal} content={call.raw_ai_output || 'N/A'} />
            
            {/* If there are assistant context blocks, render them prominently */}
            {(call.messages || call.messages_sent)?.map((m: any, i: number) => (
                <AssistantContextCard key={i} content={m.content} />
            ))}

            <CodeBlock title="Timeline de Mensagens (Thread)" icon={MessageSquare} content={formatMessages(call.messages || call.messages_sent || [])} />
            {call.system_prompt && <CodeBlock title="System Prompt Entregue ao Modelo" icon={FileText} content={call.system_prompt} />}
          </div>
        )}

      </div>
    </div>
  )
}

export default function TraceModal({ isOpen, onClose, trace }: TraceModalProps) {
  const [showJson, setShowJson] = useState(false)
  const [isCopied, setIsCopied] = useState(false)
  const isAssistant = trace?.supervisor_selection?.toLowerCase().includes('prompt assistant');

  if (!isOpen || !trace) return null

  const handleCopy = (e: React.MouseEvent) => {
    e.stopPropagation()
    navigator.clipboard.writeText(JSON.stringify(trace, null, 2))
    setIsCopied(true)
    setTimeout(() => setIsCopied(false), 2000)
  }

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
            {(trace.total_usage?.total_cost || trace.total_usage?.cost) && (
              <span className="text-xs font-normal px-2 py-1 rounded bg-emerald-900/30 text-emerald-400 border border-emerald-800/50 ml-2">
                Custo Total: ${(trace.total_usage.total_cost || trace.total_usage.cost || 0).toFixed(6)}
              </span>
            )}
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
          <div style={{ position: 'relative' }}>
            <button 
              onClick={handleCopy}
              className="btn btn-sm btn-ghost" 
              style={{ position: 'absolute', top: '12px', right: '12px', background: 'rgba(255,255,255,0.1)', color: '#FFF' }}
              title="Copiar JSON"
            >
              {isCopied ? <Check size={14} style={{ color: 'var(--success)' }} /> : <Copy size={14} />}
            </button>
            <div className="json-view" style={{
              background: 'rgba(0,0,0,0.4)', padding: '16px', borderRadius: '8px', 
              border: '1px solid var(--border)', fontFamily: 'var(--font-mono)', fontSize: '0.75rem', 
              color: '#FFFFFF', whiteSpace: 'pre-wrap', overflowX: 'auto', maxHeight: '600px'
            }}>
              {JSON.stringify(trace, null, 2)}
            </div>
          </div>
        ) : (
          <div className="timeline" style={{ display: 'flex', flexDirection: 'column', gap: '24px', position: 'relative' }}>
            {/* Main connecting line */}
            <div style={{ position: 'absolute', left: '23px', top: '30px', bottom: '30px', width: '2px', background: 'var(--border)', zIndex: 0 }}></div>

            {/* Step 1: Supervisor */}
            <div className="timeline-item" style={{ display: 'flex', gap: '16px', zIndex: 1, position: 'relative' }}>
            <div className="timeline-icon" style={{
                width: '48px', height: '48px', borderRadius: '50%', background: isAssistant ? 'var(--primary)' : '#FFFFFF',
                display: 'flex', alignItems: 'center', justifyContent: 'center', color: isAssistant ? '#FFF' : '#000000', flexShrink: 0
              }}>
                {isAssistant ? <Activity size={20} /> : <User size={20} />}
              </div>
              <div className="timeline-content" style={{ flex: 1, background: 'rgba(255,255,255,0.03)', padding: '16px', borderRadius: '8px', border: '1px solid var(--border)' }}>
                <div className="text-xs text-muted font-mono mb-1">Passo 1 • {isAssistant ? 'Engenharia de Prompt' : 'Classificação Inicial (Zero-Shot)'}</div>
                <div className="font-semibold text-white">{isAssistant ? 'Prompt Assistant Configuration' : 'Supervisor (Roteamento Rápido)'}</div>
                
                <div className="mt-2 text-sm">
                  <span className="text-muted">Iniciado como: </span>
                  <span className="badge badge-primary" style={{ background: isAssistant ? 'var(--primary-dim)' : 'var(--primary)', border: 'none' }}>{trace.supervisor_selection}</span>
                </div>
                
                {/* Supervisor Usage */}
                <UsageStats usage={trace.supervisor?.usage} label="Uso do Supervisor/Redirecionador" />
                
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
