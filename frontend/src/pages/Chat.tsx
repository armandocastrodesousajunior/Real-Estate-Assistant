import { useEffect, useRef, useState } from 'react'
import { Plus, Send, Trash2, Activity, Search, Home } from 'lucide-react'
import { chatAPI } from '../services/api'
import TraceModal from '../components/TraceModal/TraceModal'

interface Message { role: string; content: string; agentSlug?: string; agentName?: string; agentEmoji?: string; agentColor?: string; metadata?: any }
interface Conversation { id: number; session_id: string; title?: string; message_count: number; updated_at: string }

export default function Chat() {
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [activeSession, setActiveSession] = useState<string | null>(null)
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [isStreaming, setIsStreaming] = useState(false)
  const [streamingAgent, setStreamingAgent] = useState<{ name: string; emoji: string; color: string } | null>(null)
  const [streamingText, setStreamingText] = useState('')
  const [showDebug, setShowDebug] = useState(false)
  const [selectedTrace, setSelectedTrace] = useState<any>(null)
  
  const streamingTextRef = useRef('')        // ref para acúmulo seguro no closure async
  const streamingAgentRef = useRef<{ name: string; emoji: string; color: string } | null>(null)
  const streamingTraceRef = useRef<any>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => { loadConversations() }, [])
  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages, streamingText])

  const loadConversations = async () => {
    const { data } = await chatAPI.listConversations()
    setConversations(data)
  }

  const loadConversation = async (sessionId: string) => {
    setActiveSession(sessionId)
    const { data } = await chatAPI.getConversation(sessionId)
    setMessages(data.messages.map((m: any) => ({
      role: m.role,
      content: m.content,
      agentSlug: m.agent_slug,
      agentName: m.agent_name,
      agentEmoji: m.agent_emoji,
      metadata: m.metadata || m.metadata_,
    })))
  }

  const newChat = () => {
    setActiveSession(null)
    setMessages([])
    setStreamingText('')
  }

  const deleteConversation = async (sessionId: string, e: React.MouseEvent) => {
    e.stopPropagation()
    await chatAPI.deleteConversation(sessionId)
    if (activeSession === sessionId) newChat()
    loadConversations()
  }

  const sendMessage = async () => {
    const text = input.trim()
    if (!text || isStreaming) return

    const userMsg: Message = { role: 'user', content: text }
    setMessages(prev => [...prev, userMsg])
    setInput('')
    setIsStreaming(true)
    setStreamingText('')
    setStreamingAgent(null)
    streamingTextRef.current = ''
    streamingAgentRef.current = null

    try {
      const response = await chatAPI.streamChat(text, activeSession || undefined)
      const reader = response.body!.getReader()
      const decoder = new TextDecoder()
      let buffer = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() || ''

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue
          try {
            const event = JSON.parse(line.slice(6))
            if (event.type === 'agent_selected') {
              const agentInfo = { name: event.agent_name, emoji: event.agent_emoji, color: event.agent_color }
              streamingAgentRef.current = agentInfo
              setStreamingAgent(agentInfo)
              if (event.session_id) setActiveSession(event.session_id)
            } else if (event.type === 'token') {
              streamingTextRef.current += event.content
              setStreamingText(streamingTextRef.current)
            } else if (event.type === 'debug_trace') {
              streamingTraceRef.current = event.trace
            }
          } catch {}
        }
      }

      // Usa os refs para capturar o valor final correto (sem stale closure)
      const finalText = streamingTextRef.current
      const finalAgent = streamingAgentRef.current
      const finalTrace = streamingTraceRef.current
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: finalText,
        agentName: finalAgent?.name,
        agentEmoji: finalAgent?.emoji,
        agentColor: finalAgent?.color,
        metadata: finalTrace
      }])
      setStreamingText('')
      setStreamingAgent(null)
      streamingTextRef.current = ''
      streamingAgentRef.current = null
      streamingTraceRef.current = null
      loadConversations()
    } catch {
      setMessages(prev => [...prev, {
        role: 'assistant', content: '❌ Erro ao conectar com os agentes. Verifique se o backend está rodando.',
      }])
    } finally {
      setIsStreaming(false)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage() }
  }

  const suggestions = [
    'Quais imóveis de 3 quartos estão disponíveis em SP?',
    'Qual o preço médio de apartamentos no Brooklin?',
    'Me ajude a criar um anúncio para um flat no centro',
    'Como está o mercado imobiliário em 2025?',
  ]

  return (
    <div className="chat-layout">
      {/* Sidebar de conversas */}
      <div className="chat-sidebar">
        <div className="chat-sidebar-header">
          <span style={{ fontWeight: 600, fontSize: '0.9rem' }}>💬 Conversas</span>
          <div className="flex gap-2">
            <button className={`btn btn-sm ${showDebug ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setShowDebug(!showDebug)} title="Modo Debug (Trace de Agentes)">
              <Activity size={14} />
            </button>
            <button className="btn btn-primary btn-sm" onClick={newChat}><Plus size={14} /></button>
          </div>
        </div>
        <div className="conversation-list">
          {conversations.length === 0 && (
            <div style={{ padding: '16px', textAlign: 'center', fontSize: '0.78rem', color: 'var(--text-muted)' }}>
              Nenhuma conversa ainda
            </div>
          )}
          {conversations.map((c) => (
            <div key={c.session_id} className={`conversation-item ${activeSession === c.session_id ? 'active' : ''}`} onClick={() => loadConversation(c.session_id)}>
              <div className="flex items-center justify-between">
                <div className="conversation-title">{c.title || 'Nova conversa'}</div>
                <button className="btn btn-ghost" style={{ padding: '2px', color: 'var(--text-muted)' }} onClick={(e) => deleteConversation(c.session_id, e)}>
                  <Trash2 size={12} />
                </button>
              </div>
              <div className="conversation-meta">{c.message_count} msg · {new Date(c.updated_at).toLocaleDateString('pt-BR')}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Chat main */}
      <div className="chat-main">
        {messages.length === 0 && !streamingText ? (
          <div className="chat-welcome">
            <div className="chat-welcome-icon"><Home size={40} /></div>
            <h2>Real-Estate-Assistant</h2>
            <p>Converse com 6 agentes de IA especializados. Busque imóveis, analise preços, crie anúncios e muito mais.</p>
            <div className="chat-suggestions">
              {suggestions.map((s) => (
                <button key={s} className="chat-suggestion" onClick={() => { setInput(s); textareaRef.current?.focus() }}>{s}</button>
              ))}
            </div>
          </div>
        ) : (
          <div className="messages-area">
            {messages.map((msg, i) => (
              <div key={i} className={`message-wrapper ${msg.role}`}>
                {msg.role === 'assistant' ? (
                  <div className="message-avatar" style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)' }}>
                    {msg.agentEmoji || '🤖'}
                  </div>
                ) : (
                  <div className="message-avatar user-avatar-msg" style={{ background: '#FFF', color: '#000' }}>A</div>
                )}
                <div>
                  {msg.role === 'assistant' && msg.agentName && (
                    <div className="message-agent-tag" style={{ color: '#A3A3A3' }}>
                      {msg.agentName}
                    </div>
                  )}
                  <div className={`message-bubble ${msg.role}`}>
                    <div className="markdown-content" dangerouslySetInnerHTML={{
                      __html: msg.content
                        .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
                        .replace(/\*(.*?)\*/g, '<em>$1</em>')
                        .replace(/`(.*?)`/g, '<code>$1</code>')
                        .replace(/\n/g, '<br>')
                    }} />
                  </div>
                  
                  {/* Botão de Debug Modal (Substituindo o painel solto antigo) */}
                  {showDebug && msg.role === 'assistant' && msg.metadata && (
                    <button 
                      onClick={() => setSelectedTrace(msg.metadata)}
                      className="btn btn-sm mt-2" 
                      style={{ 
                        background: 'rgba(255,255,255,0.05)', 
                        border: '1px solid var(--border)', 
                        color: 'var(--text-muted)', 
                        fontSize: '0.8rem',
                        display: 'flex', alignItems: 'center', gap: '6px',
                        padding: '4px 10px'
                      }}>
                      <Search size={12} className="text-accent" /> 
                      Ver Logs de Processamento
                    </button>
                  )}
                </div>
              </div>
            ))}

            {/* Streaming */}
            {(isStreaming || streamingText) && (
              <div className="message-wrapper assistant">
                <div className="message-avatar" style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)' }}>
                  {streamingAgent?.emoji || '🤖'}
                </div>
                <div>
                  {streamingAgent && (
                    <div className="message-agent-tag" style={{ color: '#A3A3A3' }}>
                      {streamingAgent.name}
                    </div>
                  )}
                  <div className="message-bubble assistant">
                    {streamingText || <div className="typing-indicator"><div className="typing-dot" /><div className="typing-dot" /><div className="typing-dot" /></div>}
                  </div>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>
        )}

        {/* Input */}
        <div className="chat-input-area">
          <div className="chat-input-wrapper">
            <textarea
              ref={textareaRef}
              className="chat-input"
              placeholder="Digite sua mensagem... (Enter para enviar, Shift+Enter para nova linha)"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              rows={1}
              disabled={isStreaming}
            />
            <button className="chat-send-btn" onClick={sendMessage} disabled={isStreaming || !input.trim()}>
              <Send size={17} />
            </button>
          </div>
        </div>
      </div>
      
      {/* Modal de Detalhes de Handoff/Trace */}
      <TraceModal 
        isOpen={selectedTrace !== null} 
        onClose={() => setSelectedTrace(null)} 
        trace={selectedTrace} 
      />
    </div>
  )
}
