import { useEffect, useRef, useState } from 'react'
import {
  Plus, Send, Trash2, Activity, Home, MessageSquare, Bot,
  Save, RotateCcw, Sliders, ChevronRight, X, Pencil, Wrench, Search as SearchIcon, History as HistoryIcon, Info,
  ThumbsUp, ThumbsDown
} from 'lucide-react'
import { chatAPI, agentsAPI, promptsAPI, toolsAPI, feedbackAPI } from '../services/api'
import TraceModal from '../components/TraceModal/TraceModal'
import FeedbackModal from '../components/FeedbackModal/FeedbackModal'
import AgentIcon from '../components/AgentIcon'
import PromptAssistant from '../components/PromptAssistant/PromptAssistant'
import type { AgentSpec } from '../types/agent'

interface Message { role: string; content: string; agentSlug?: string; agentName?: string; agentEmoji?: string; metadata?: any }
interface Conversation { id: number; session_id: string; title?: string; message_count: number; updated_at: string }
interface Agent { slug: string; name: string; emoji: string; color: string; description: string; model: string; temperature: number; max_tokens: number; is_active: boolean; is_system: boolean; feedback_limit: number }



export default function Playground() {
  const [agents, setAgents] = useState<Agent[]>([])
  const [selectedAgentSlug, setSelectedAgentSlug] = useState<string | null>(null)
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [activeSession, setActiveSession] = useState<string | null>(null)
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [isStreaming, setIsStreaming] = useState(false)
  const [streamingAgent, setStreamingAgent] = useState<{ name: string; emoji: string } | null>(null)
  const [streamingText, setStreamingText] = useState('')
  const [activeTool, setActiveTool] = useState<string | null>(null)
  const [showConfig, setShowConfig] = useState(false)
  const [selectedTrace, setSelectedTrace] = useState<any>(null)
  const [editedPrompt, setEditedPrompt] = useState('')
  const [editedParams, setEditedParams] = useState({ model: '', temperature: 0.7, max_tokens: 2048, feedback_limit: 15 })
  const [promptHistory, setPromptHistory] = useState<any[]>([])
  const [isSaving, setIsSaving] = useState(false)
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false)
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false)
  const [newAgentData, setNewAgentData] = useState({ slug: '', name: '', emoji: '🤖', description: '', system_prompt: '' })
  const [isCreatingAgent, setIsCreatingAgent] = useState(false)
  const [createError, setCreateError] = useState<string | null>(null)
  const [allTools, setAllTools] = useState<any[]>([])
  const [agentToolsSlugs, setAgentToolsSlugs] = useState<string[]>([])
  const [toolSearchTerm, setToolSearchTerm] = useState('')
  const [isToolDropdownOpen, setIsToolDropdownOpen] = useState(false)
  const [openRouterModels, setOpenRouterModels] = useState<any[]>([])
  const [modelSearchTerm, setModelSearchTerm] = useState('')
  const [isModelDropdownOpen, setIsModelDropdownOpen] = useState(false)
  
  const [isPromptAssistantOpen, setIsPromptAssistantOpen] = useState<boolean>(false)
  const [promptAssistantMode, setPromptAssistantMode] = useState<'edit' | 'create'>('edit')
  const [activeChatContext, setActiveChatContext] = useState<any>(null)

  // Feedback state — stores { rating, feedbackId } per message index
  const [feedbackStates, setFeedbackStates] = useState<Map<number, { rating: 'positive' | 'negative'; feedbackId: number }>>(new Map())
  const [feedbackModal, setFeedbackModal] = useState<{ open: boolean; msgIndex: number; msg: Message | null }>({
    open: false, msgIndex: -1, msg: null
  })
  const [feedbackLoading, setFeedbackLoading] = useState(false)

  const streamingTextRef = useRef('')
  const streamingAgentRef = useRef<{ name: string; emoji: string } | null>(null)
  const streamingTraceRef = useRef<any>(null)
  const activeToolRef = useRef<string | null>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => { loadInitialData() }, [])
  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages, streamingText])

  const loadInitialData = async () => {
    const [agentsRes, convsRes] = await Promise.all([agentsAPI.list(), chatAPI.listConversations({ is_test: true })])
    setAgents(agentsRes.data.filter((a: Agent) => a.slug !== 'supervisor'))
    setConversations(convsRes.data)
  }

  const loadConversation = async (sessionId: string) => {
    setActiveSession(sessionId); setIsStreaming(false); setStreamingText(''); setStreamingAgent(null); setActiveTool(null)
    streamingTextRef.current = ''; streamingAgentRef.current = null; streamingTraceRef.current = null; activeToolRef.current = null
    setMessages([]); setFeedbackStates(new Map())
    try {
      const { data } = await chatAPI.getConversation(sessionId)
      if (!data?.messages) return
      const loadedMessages = data.messages.map((m: any) => ({ role: m.role, content: m.content, agentSlug: m.agent_slug, agentName: m.agent_name, agentEmoji: m.agent_emoji, metadata: m.metadata || m.metadata_ }))
      setMessages(loadedMessages)

      // Restaura o estado de feedbacks existentes no banco para esta sessao
      try {
        const { data: fbData } = await feedbackAPI.listBySession(sessionId)
        if (fbData && fbData.length > 0) {
          const newStates = new Map<number, { rating: 'positive' | 'negative'; feedbackId: number }>()
          for (const fb of fbData) {
            // Encontra o indice da mensagem da IA que corresponde a este feedback
            const idx = loadedMessages.findIndex(
              (m: any, i: number) => m.role === 'assistant' && (m.content?.trim() === fb.ai_response?.trim())
                && loadedMessages.slice(0, i).reverse().some((prev: any) => prev.role === 'user')
            )
            if (idx !== -1) {
              // Se ja tem um feedback para este indice, mantem o mais recente (maior id)
              const existing = newStates.get(idx)
              if (!existing || fb.id > existing.feedbackId) {
                newStates.set(idx, { rating: fb.rating as 'positive' | 'negative', feedbackId: fb.id })
              }
            }
          }
          setFeedbackStates(newStates)
        }
      } catch {}
    } catch { setActiveSession(null) }
  }

  const newChat = () => { setActiveSession(null); setMessages([]); setStreamingText(''); setActiveTool(null); activeToolRef.current = null; setFeedbackStates(new Map()) }

  const deleteConversation = async (sessionId: string, e: React.MouseEvent) => {
    e.stopPropagation()
    await chatAPI.deleteConversation(sessionId)
    if (activeSession === sessionId) newChat()
    const { data } = await chatAPI.listConversations({ is_test: true })
    setConversations(data)
  }

  const sendMessage = async () => {
    const text = input.trim()
    if (!text || isStreaming) return
    setMessages(prev => [...prev, { role: 'user', content: text }])
    setInput(''); setIsStreaming(true); setStreamingText(''); setStreamingAgent(null); setActiveTool(null)
    streamingTextRef.current = ''; streamingAgentRef.current = null; activeToolRef.current = null
    try {
      const response = await chatAPI.streamChat(text, activeSession || undefined, selectedAgentSlug || undefined, true)
      const reader = response.body!.getReader()
      const decoder = new TextDecoder()
      let buffer = ''
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n'); buffer = lines.pop() || ''
        for (const line of lines) {
          if (!line.startsWith('data: ')) continue
          try {
            const event = JSON.parse(line.slice(6))
            if (event.type === 'agent_selected') {
              streamingAgentRef.current = { name: event.agent_name, emoji: event.agent_emoji }
              setStreamingAgent({ name: event.agent_name, emoji: event.agent_emoji })
              if (event.session_id) setActiveSession(event.session_id)
            } else if (event.type === 'token') {
              if (activeToolRef.current) {
                setActiveTool(null)
                activeToolRef.current = null
              }
              streamingTextRef.current += event.content
              setStreamingText(streamingTextRef.current)
            } else if (event.type === 'tool_call') {
              setActiveTool(event.tool_name)
              activeToolRef.current = event.tool_name
            } else if (event.type === 'debug_trace') {
              streamingTraceRef.current = event.trace
            } else if (event.type === 'error') {
              streamingTextRef.current = `❌ **Erro da IA:** ${event.message || 'Erro desconhecido'}`
              setStreamingText(streamingTextRef.current)
            }
          } catch {}
        }
      }
      setMessages(prev => [...prev, { role: 'assistant', content: streamingTextRef.current, agentName: streamingAgentRef.current?.name, agentEmoji: streamingAgentRef.current?.emoji, metadata: streamingTraceRef.current }])
      setStreamingText(''); setStreamingAgent(null); setActiveTool(null); activeToolRef.current = null
      const { data } = await chatAPI.listConversations({ is_test: true })
      setConversations(data)
    } catch (err: any) {
      const errorMsg = err.response?.data?.detail || err.message || 'Erro ao conectar com a IA.'
      setMessages(prev => [...prev, { role: 'assistant', content: `❌ **Falha na Conexão:** ${errorMsg}\n\nVerifique sua chave de API ou conexão com o servidor.` }])
    } finally { setIsStreaming(false) }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage() } }

  useEffect(() => {
    if (selectedAgentSlug) loadAgentConfig(selectedAgentSlug)
    else { setEditedPrompt(''); setEditedParams({ model: '', temperature: 0.7, max_tokens: 2048, feedback_limit: 15 }); setHasUnsavedChanges(false) }
  }, [selectedAgentSlug])

  const loadAgentConfig = async (slug: string) => {
    const [agentRes, promptRes, historyRes] = await Promise.all([agentsAPI.get(slug), promptsAPI.get(slug), promptsAPI.history(slug)])
    setEditedPrompt(promptRes.data.system_prompt)
    setEditedParams({ model: agentRes.data.model, temperature: agentRes.data.temperature, max_tokens: agentRes.data.max_tokens, feedback_limit: agentRes.data.feedback_limit ?? 15 })
    setPromptHistory(historyRes.data)
    setHasUnsavedChanges(false)
    try {
      const [allToolsRes, agentToolsRes] = await Promise.all([toolsAPI.list(), toolsAPI.listAgentTools(slug)])
      setAllTools(allToolsRes.data); setAgentToolsSlugs(agentToolsRes.data)
    } catch {}
  }

  const loadOpenRouterModels = async () => {
    try {
      const { data } = await agentsAPI.getModels()
      setOpenRouterModels(data.models || [])
    } catch { console.error('Erro ao listar modelos OpenRouter.') }
  }

  const toggleToolLink = async (toolSlug: string) => {
    if (!selectedAgentSlug) return
    const isLinked = agentToolsSlugs.includes(toolSlug)
    try {
      if (isLinked) { await toolsAPI.unlink(selectedAgentSlug, toolSlug); setAgentToolsSlugs(prev => prev.filter(s => s !== toolSlug)) }
      else { await toolsAPI.link(selectedAgentSlug, toolSlug); setAgentToolsSlugs(prev => [...prev, toolSlug]) }
    } catch { alert('Erro ao alterar vínculo.') }
  }

  const saveConfig = async () => {
    if (!selectedAgentSlug) return
    setIsSaving(true)
    try {
      await Promise.all([agentsAPI.update(selectedAgentSlug, editedParams), promptsAPI.update(selectedAgentSlug, { system_prompt: editedPrompt })])
      await loadAgentConfig(selectedAgentSlug)
      await loadInitialData()
      setHasUnsavedChanges(false)
    } catch { alert('Erro ao salvar.') } finally { setIsSaving(false) }
  }

  const handleCreateAgent = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newAgentData.slug || !newAgentData.name) return
    setIsCreatingAgent(true); setCreateError(null)
    try {
      await agentsAPI.create(newAgentData)
      await loadInitialData()
      setIsCreateModalOpen(false)
      setNewAgentData({ slug: '', name: '', emoji: '🤖', description: '', system_prompt: '' })
    } catch (err: any) { 
      const detail = err.response?.data?.detail
      if (Array.isArray(detail)) {
        const errorMsgs = detail.map((d: any) => `${d.loc[d.loc.length - 1]}: ${d.msg}`).join(', ')
        setCreateError(`Erro de validação: ${errorMsgs}`)
      } else {
        setCreateError(detail || 'Erro ao criar agente.') 
      }
    } finally { setIsCreatingAgent(false) }
  }

  const handleDeleteAgent = async (e?: React.MouseEvent) => {
    if (e) e.stopPropagation()
    if (!selectedAgentSlug) return
    const agent = agents.find(a => a.slug === selectedAgentSlug)
    if (!agent || !confirm(`Excluir o agente "${agent.name}"? Esta ação não pode ser desfeita.`)) return
    try {
      await agentsAPI.delete(selectedAgentSlug)
      setSelectedAgentSlug(null); newChat(); setShowConfig(false)
      await loadInitialData()
    } catch { alert('Erro ao excluir agente.') }
  }

  const handleMentionInEditor = async (index: number, msg: Message) => {
    const history = messages.map(m => ({
      role: m.role,
      content: m.content,
      agentName: m.agentName,
      metadata: m.metadata
    }));

    const targetSlug = msg.agentSlug || selectedAgentSlug;
    if (targetSlug && targetSlug !== selectedAgentSlug) {
      setSelectedAgentSlug(targetSlug);
      await loadAgentConfig(targetSlug);
      setShowConfig(true);
    } else if (!targetSlug) {
      alert("Não foi possível identificar o agente desta mensagem.");
      return;
    }

    setActiveChatContext({
      focusedIndex: index,
      history: history
    });

    setPromptAssistantMode('edit');
    setIsPromptAssistantOpen(true);
  }

  // ── Feedback handlers ────────────────────────────────────────────────────────

  const handlePositiveFeedback = async (index: number, msg: Message) => {
    const existing = feedbackStates.get(index)
    const prevUserMsg = messages.slice(0, index).reverse().find(m => m.role === 'user')
    const agentSlug = msg.agentSlug || selectedAgentSlug
    if (!agentSlug) return

    // Clicou no mesmo botão já ativo — desfaz o feedback (undo)
    if (existing?.rating === 'positive') {
      try {
        await feedbackAPI.remove(existing.feedbackId)
        setFeedbackStates(prev => { const m = new Map(prev); m.delete(index); return m })
      } catch (e) { console.error('Erro ao desfazer feedback', e) }
      return
    }

    // Se havia um dislike antes, deleta ele primeiro (troca de rating)
    if (existing?.rating === 'negative') {
      try { await feedbackAPI.remove(existing.feedbackId) } catch {}
    }

    try {
      const res = await feedbackAPI.submit({
        agent_slug: agentSlug,
        user_message: prevUserMsg?.content || '',
        ai_response: msg.content,
        rating: 'positive',
        model_used: msg.metadata?.supervisor?.model,
        session_id: activeSession || undefined,
      })
      setFeedbackStates(prev => new Map(prev).set(index, { rating: 'positive', feedbackId: res.data.id }))
    } catch (e) { console.error('Erro ao salvar feedback positivo', e) }
  }

  const handleNegativeFeedback = (index: number, msg: Message) => {
    // Permite abrir o modal mesmo que já haja um like (para trocar)
    // Se já é dislike, o clique desfaz
    const existing = feedbackStates.get(index)
    if (existing?.rating === 'negative') {
      // Clicou no mesmo — desfaz (undo)
      feedbackAPI.remove(existing.feedbackId).catch(() => {})
      setFeedbackStates(prev => { const m = new Map(prev); m.delete(index); return m })
      return
    }
    setFeedbackModal({ open: true, msgIndex: index, msg })
  }

  const handleDislikeSubmit = async (correction: string) => {
    const { msgIndex, msg } = feedbackModal
    if (!msg) return
    const prevUserMsg = messages.slice(0, msgIndex).reverse().find(m => m.role === 'user')
    const agentSlug = msg.agentSlug || selectedAgentSlug
    if (!agentSlug) return

    setFeedbackLoading(true)
    try {
      // Se havia um like antes, deleta ele primeiro
      const existing = feedbackStates.get(msgIndex)
      if (existing) {
        try { await feedbackAPI.remove(existing.feedbackId) } catch {}
      }

      const res = await feedbackAPI.submit({
        agent_slug: agentSlug,
        user_message: prevUserMsg?.content || '',
        ai_response: msg.content,
        rating: 'negative',
        correction,
        model_used: msg.metadata?.supervisor?.model,
        session_id: activeSession || undefined,
      })
      setFeedbackStates(prev => new Map(prev).set(msgIndex, { rating: 'negative', feedbackId: res.data.id }))
      setFeedbackModal({ open: false, msgIndex: -1, msg: null })
    } catch (e) { console.error('Erro ao salvar feedback negativo', e) }
    finally { setFeedbackLoading(false) }
  }

  const currentAgent = selectedAgentSlug ? agents.find(a => a.slug === selectedAgentSlug) : null

  const layoutCols = selectedAgentSlug && showConfig ? '260px 1fr 320px' : '260px 1fr'

  return (
    <div className="playground-layout" style={{ gridTemplateColumns: layoutCols }}>
      {/* C1: Sidebar */}
      <div className="playground-sidebar">
        <div className="playground-sidebar-section">
          <div className="section-header"><Activity size={14} /><span>Playground</span></div>
          <button
            className={`selection-item ${selectedAgentSlug === null ? 'active' : ''}`}
            onClick={() => setSelectedAgentSlug(null)}
          >
            <div className="selection-icon geral"><Sliders size={16} /></div>
            <div className="selection-info">
              <div className="name">Geral (Multi-Agente)</div>
              <div className="desc">Orquestrador Inteligente</div>
            </div>
          </button>
        </div>

        <div className="playground-sidebar-section">
          <div className="section-header">
            <Bot size={14} /><span>Especialistas</span>
            <button className="btn-icon-sm" onClick={() => setIsCreateModalOpen(true)} title="Criar Novo Agente">
              <Plus size={14} />
            </button>
          </div>
          <div className="agents-list">
            {agents.map(a => (
              <div
                key={a.slug}
                className={`selection-item ${selectedAgentSlug === a.slug ? 'active' : ''} ${!a.is_active ? 'inactive' : ''}`}
                onClick={() => setSelectedAgentSlug(a.slug)}
              >
                <AgentIcon name={a.name} emoji={a.emoji} size="sm" />
                <div className="selection-info">
                  <div className="name">{a.name}{!a.is_active && <span style={{ fontSize: '0.68rem', color: 'var(--text-muted)', marginLeft: '6px' }}>(OFF)</span>}</div>
                  <div className="desc">{a.slug}</div>
                </div>
                <button
                  className="agent-config-btn"
                  onClick={(e) => { e.stopPropagation(); setSelectedAgentSlug(a.slug); setShowConfig(true) }}
                  title="Configurar Agente"
                >
                  <Pencil size={12} />
                </button>
              </div>
            ))}
          </div>
        </div>

        <div className="playground-sidebar-section conversations">
          <div className="section-header">
            <MessageSquare size={14} /><span>Conversas</span>
            <button className="btn-icon-sm" onClick={newChat} title="Novo Chat"><Plus size={14} /></button>
          </div>
          <div className="conversation-mini-list">
            {conversations.map(c => (
              <div
                key={c.session_id}
                className={`conv-mini-item ${activeSession === c.session_id ? 'active' : ''}`}
                onClick={() => loadConversation(c.session_id)}
              >
                <div className="title">{c.title || 'Conversa sem título'}</div>
                <button className="delete-btn" onClick={(e) => deleteConversation(c.session_id, e)}><Trash2 size={10} /></button>
              </div>
            ))}
            {conversations.length === 0 && (
              <div style={{ padding: '12px', fontSize: '0.75rem', color: 'var(--text-muted)', textAlign: 'center', fontStyle: 'italic' }}>
                Nenhuma conversa ainda
              </div>
            )}
          </div>
        </div>

      </div>

      {/* C2: Chat */}
      <div className="playground-main">
        <header className="playground-header">
          <div className="header-agent-info">
            {currentAgent ? (
              <>
                <AgentIcon name={currentAgent.name} emoji={currentAgent.emoji} />
                <div>
                  <div className="agent-name-active">{currentAgent.name}</div>
                  <div className="agent-status-active">Modo Especialista · {currentAgent.is_active ? '🟢 Ativo' : '🔴 Inativo'}</div>
                </div>
              </>
            ) : (
              <>
                <div className="agent-emoji-active geral"><Activity size={20} /></div>
                <div>
                  <div className="agent-name-active">Orquestrador Geral</div>
                  <div className="agent-status-active">Roteamento Automático Ativado</div>
                </div>
              </>
            )}
          </div>
          <div className="agent-actions">
            {selectedAgentSlug && (
              <button
                className={`btn btn-sm ${showConfig ? 'btn-primary' : 'btn-secondary'}`}
                onClick={() => setShowConfig(!showConfig)}
                title="Configurar agente"
              >
                <Pencil size={14} /> Config
              </button>
            )}
          </div>
        </header>

        <div className="playground-chat-area">
          {messages.length === 0 && !streamingText ? (
            <div className="playground-welcome">
              <div className="welcome-icon">
                {currentAgent ? <AgentIcon name={currentAgent.name} emoji={currentAgent.emoji} size="xl" /> : <Home size={36} />}
              </div>
              <h2>{currentAgent ? `Chat com ${currentAgent.name}` : 'Bem-vindo ao Playground'}</h2>
              <p>
                {currentAgent
                  ? `Mensagens enviadas diretamente para ${currentAgent.slug}. O supervisor não interferirá.`
                  : 'Fale com nosso sistema multi-agente. A IA decidirá automaticamente qual especialista responderá.'}
              </p>
              {!currentAgent && (
                <div className="playground-hints">
                  <div className="hint">"Busque casas de 2 quartos em SP"</div>
                  <div className="hint">"Quanto custa um apê no Brooklin?"</div>
                  <div className="hint">"Crie um anúncio para este imóvel"</div>
                </div>
              )}
            </div>
          ) : (
            <div className="messages-list">
              {messages.map((msg, i) => (
                <div key={i} className={`msg-wrapper ${msg.role}`}>
                  <div className={`msg-avatar ${msg.role === 'user' ? 'user' : 'bot'}`}>
                    {msg.role === 'user' ? 'U' : <AgentIcon name={msg.agentName || 'IA'} emoji={msg.agentEmoji} size="xs" />}
                  </div>
                  <div className="msg-content-container">
                    {msg.role === 'assistant' && msg.agentName && (
                      <div className="msg-agent-name">{msg.agentName}</div>
                    )}
                    {/* Message bubble */}
                    <div className={`msg-bubble ${msg.role}`}>
                      <div dangerouslySetInnerHTML={{
                        __html: msg.content
                          .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
                          .replace(/\*(.*?)\*/g, '<em>$1</em>')
                          .replace(/`(.*?)`/g, '<code>$1</code>')
                          .replace(/\n/g, '<br>')
                      }} />
                    </div>
                    {msg.role === 'assistant' && (() => {
                      const state = feedbackStates.get(i)
                      return (
                        <div className="msg-actions">
                          {/* Esquerda: acoes de editor */}
                          <button className="msg-action-btn" data-tooltip="Mencionar no Editor" onClick={() => handleMentionInEditor(i, msg)}>
                            <Bot size={12} />
                          </button>
                          {msg.metadata && (
                            <button className="msg-action-btn" data-tooltip="Ver Rastreamento" onClick={() => setSelectedTrace(msg.metadata)}>
                              <Activity size={12} />
                            </button>
                          )}
                          {/* Separador */}
                          <div style={{ flex: 1 }} />
                          {/* Direita: feedback */}
                          <button
                            className="msg-action-btn"
                            data-tooltip={state?.rating === 'positive' ? 'Desfazer like' : 'Boa resposta'}
                            onClick={() => handlePositiveFeedback(i, msg)}
                            style={{
                              borderRadius: '8px',
                              background: state?.rating === 'positive' ? 'rgba(16,185,129,0.15)' : 'transparent',
                              borderColor: state?.rating === 'positive' ? 'rgba(16,185,129,0.4)' : 'transparent',
                              color: state?.rating === 'positive' ? 'var(--accent)' : 'var(--text-muted)',
                            }}
                          >
                            <ThumbsUp size={12} />
                          </button>
                          <button
                            className="msg-action-btn"
                            data-tooltip={state?.rating === 'negative' ? 'Desfazer dislike' : 'Resposta ruim — sugerir melhoria'}
                            onClick={() => handleNegativeFeedback(i, msg)}
                            style={{
                              borderRadius: '8px',
                              background: state?.rating === 'negative' ? 'var(--error-dim)' : 'transparent',
                              borderColor: state?.rating === 'negative' ? 'rgba(239,68,68,0.4)' : 'transparent',
                              color: state?.rating === 'negative' ? 'var(--error)' : 'var(--text-muted)',
                            }}
                          >
                            <ThumbsDown size={12} />
                          </button>
                        </div>
                      )
                    })()}

                  </div>
                </div>
              ))}

              {(isStreaming || streamingText || activeTool) && (
                <div className="msg-wrapper assistant">
                  <div className="msg-avatar bot" style={{ background: 'transparent' }}>
                    <AgentIcon name={streamingAgent?.name || 'IA'} emoji={streamingAgent?.emoji} size="xs" />
                  </div>
                  <div className="msg-content-container">
                    {streamingAgent && <div className="msg-agent-name">{streamingAgent.name}</div>}
                    <div className="msg-bubble assistant">
                      {streamingText && (
                        <div dangerouslySetInnerHTML={{
                          __html: streamingText
                            .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
                            .replace(/\*(.*?)\*/g, '<em>$1</em>')
                            .replace(/`(.*?)`/g, '<code>$1</code>')
                            .replace(/\n/g, '<br>')
                        }} />
                      )}
                      
                      {activeTool && (
                        <div style={{ 
                          display: 'flex', alignItems: 'center', gap: '8px', 
                          padding: '10px 14px', background: 'var(--bg-elevated)', border: '1px solid var(--accent)', 
                          borderRadius: '8px', fontSize: '0.82rem', color: 'var(--text-primary)', fontWeight: 600,
                          marginTop: streamingText ? '12px' : '0'
                        }}>
                          <Wrench size={16} className="animate-spin" style={{ color: 'var(--accent)', animationDuration: '3s' }} />
                          <span>Executando Ferramenta: <span style={{ color: 'var(--accent)', fontFamily: 'var(--font-mono)' }}>{activeTool}</span>...</span>
                          <div className="spinner" style={{ width: '14px', height: '14px', borderTopColor: 'var(--accent)', marginLeft: 'auto' }} />
                        </div>
                      )}

                      {(!streamingText && !activeTool) && <div className="typing-dot-loading"><span /></div>}
                      {(streamingText && !activeTool && isStreaming) && <div className="typing-dot-loading" style={{ marginTop: '8px' }}><span /></div>}
                    </div>
                  </div>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>
          )}
        </div>

        <div className="playground-input-footer">
          <div className="input-box-container">
            <textarea
              ref={textareaRef}
              placeholder={isStreaming ? 'Aguardando resposta...' : 'Digite sua mensagem... (Enter para enviar)'}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              rows={1}
              disabled={isStreaming}
            />
            <button className="btn-send" onClick={sendMessage} disabled={isStreaming || !input.trim()}>
              <Send size={17} />
            </button>
          </div>
        </div>
      </div>

      {/* C3: Config Panel */}
      {selectedAgentSlug && showConfig && (
        <div className="playground-config-panel">
          <div className="config-header">
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 700, fontSize: '0.875rem', color: 'var(--text-primary)' }}>
              <Pencil size={15} /> Configurações do Agente
            </div>
            <button className="btn-icon-sm" onClick={() => setShowConfig(false)}><ChevronRight size={17} /></button>
          </div>

          <div className="config-scroll-area">
            <div className="config-section">
              <div className="config-label" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                <span>System Prompt</span>
                <button 
                  className="btn btn-sm btn-ghost" 
                  style={{ color: 'var(--accent)', fontSize: '0.75rem', padding: '2px 8px', height: 'auto' }} 
                  onClick={() => { setPromptAssistantMode('edit'); setIsPromptAssistantOpen(true); }}
                >
                  <Bot size={13} style={{ marginRight: '4px' }}/> Usar IA
                </button>
              </div>
              <div className="prompt-editor-wrapper">
                <textarea
                  className="prompt-editor"
                  value={editedPrompt}
                  onChange={(e) => { setEditedPrompt(e.target.value); setHasUnsavedChanges(true) }}
                  placeholder="Defina o comportamento do agente aqui..."
                />
              </div>
            </div>

            <div className="config-section">
              <div className="config-label">Modelo LLM</div>
              <div style={{ position: 'relative' }}>
                <div
                  style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'var(--bg-elevated)', border: `1px solid ${isModelDropdownOpen ? 'var(--accent)' : 'var(--border)'}`, borderRadius: 'var(--radius-md)', padding: '8px 12px', cursor: 'pointer', transition: 'var(--transition)', fontSize: '0.8rem', color: 'var(--text-primary)' }}
                  onClick={() => { setIsModelDropdownOpen(!isModelDropdownOpen); if (!openRouterModels.length) loadOpenRouterModels(); }}
                >
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{editedParams.model || 'Selecione um modelo'}</span>
                  <ChevronRight size={14} style={{ transform: isModelDropdownOpen ? 'rotate(90deg)' : 'rotate(0deg)', transition: 'var(--transition)' }} />
                </div>
                {isModelDropdownOpen && (
                  <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, marginTop: '4px', background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', boxShadow: 'var(--shadow-lg)', zIndex: 60, overflow: 'hidden' }}>
                    <div style={{ padding: '8px', display: 'flex', alignItems: 'center', gap: '8px', borderBottom: '1px solid var(--border)' }}>
                      <SearchIcon size={13} style={{ color: 'var(--text-muted)' }} />
                      <input autoFocus type="text" placeholder="Pesquisar modelos (ex: claude, gpt)..." style={{ background: 'transparent', border: 'none', outline: 'none', fontSize: '0.78rem', color: 'var(--text-primary)', width: '100%' }} value={modelSearchTerm} onChange={e => setModelSearchTerm(e.target.value)} onClick={e => e.stopPropagation()} />
                    </div>
                    <div style={{ maxHeight: '200px', overflowY: 'auto', padding: '4px' }}>
                      {openRouterModels.length === 0 ? (
                        <div style={{ padding: '12px', textAlign: 'center', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                          Carregando modelos...
                        </div>
                      ) : (
                        openRouterModels.filter(m => m.id.toLowerCase().includes(modelSearchTerm.toLowerCase()) || (m.name && m.name.toLowerCase().includes(modelSearchTerm.toLowerCase()))).slice(0, 50).map(model => (
                          <div key={model.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 10px', borderRadius: 'var(--radius-sm)', cursor: 'pointer', transition: 'var(--transition)', background: editedParams.model === model.id ? 'var(--primary-dim)' : 'transparent' }}
                            onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = editedParams.model === model.id ? 'var(--primary-dim)' : 'var(--bg-elevated)'}
                            onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = editedParams.model === model.id ? 'var(--primary-dim)' : 'transparent'}
                            onClick={(e) => { e.stopPropagation(); setEditedParams({ ...editedParams, model: model.id }); setHasUnsavedChanges(true); setIsModelDropdownOpen(false); setModelSearchTerm(''); }}>
                            <div style={{ overflow: 'hidden' }}>
                              <div style={{ fontSize: '0.78rem', fontWeight: 700, color: editedParams.model === model.id ? 'var(--primary)' : 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{model.name || model.id}</div>
                              <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', display: 'flex', gap: '8px' }}>
                                <span>{model.id}</span>
                                {model.context_length && <span style={{ color: 'var(--accent)' }}>{(model.context_length / 1000).toFixed(0)}k ctx</span>}
                              </div>
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>

            <div className="config-section">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                <div className="config-label" style={{ marginBottom: 0 }}>Temperatura</div>
                <span className="value-badge">{editedParams.temperature}</span>
              </div>
              <input type="range" min="0" max="1.5" step="0.1" value={editedParams.temperature} onChange={(e) => { setEditedParams({ ...editedParams, temperature: Number(e.target.value) }); setHasUnsavedChanges(true) }} />
            </div>

            <div className="config-section">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                <div className="config-label" style={{ marginBottom: 0 }}>Max Tokens</div>
                <span className="value-badge">{editedParams.max_tokens}</span>
              </div>
              <input type="range" min="256" max="8192" step="256" value={editedParams.max_tokens} onChange={(e) => { setEditedParams({ ...editedParams, max_tokens: Number(e.target.value) }); setHasUnsavedChanges(true) }} />
            </div>

            <div className="config-section">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                <div className="config-label" style={{ marginBottom: 0 }}>Feedback Limit (RLHF)</div>
                <span className="value-badge">{editedParams.feedback_limit}</span>
              </div>
              <input type="range" min="0" max="50" step="1" value={editedParams.feedback_limit} onChange={(e) => { setEditedParams({ ...editedParams, feedback_limit: Number(e.target.value) }); setHasUnsavedChanges(true) }} />
              <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', marginTop: '6px', lineHeight: 1.4 }}>
                Quantidade de exemplos passados de feedback humano que serão injetados no contexto deste agente.
              </div>
            </div>

            <div className="config-section">
              <div className="config-label"><Wrench size={13} /> Ferramentas</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: '10px' }}>
                {agentToolsSlugs.map(slug => {
                  const tool = allTools.find(t => t.slug === slug)
                  if (!tool) return null
                  return (
                    <div key={slug} style={{ display: 'flex', alignItems: 'center', gap: '5px', background: 'var(--accent-dim)', border: '1px solid rgba(16,185,129,0.3)', color: 'var(--accent)', fontSize: '0.72rem', fontWeight: 700, padding: '3px 8px', borderRadius: 'var(--radius-full)' }}>
                      <span>{tool.name}</span>
                      <button onClick={() => toggleToolLink(slug)} style={{ background: 'none', border: 'none', color: 'inherit', cursor: 'pointer', padding: 0, display: 'flex' }}><X size={11} /></button>
                    </div>
                  )
                })}
                {agentToolsSlugs.length === 0 && <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontStyle: 'italic' }}>Nenhuma ferramenta vinculada.</div>}
              </div>
              <div style={{ position: 'relative' }}>
                <div
                  style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'var(--bg-elevated)', border: `1px solid ${isToolDropdownOpen ? 'var(--accent)' : 'var(--border)'}`, borderRadius: 'var(--radius-md)', padding: '8px 12px', cursor: 'pointer', transition: 'var(--transition)', fontSize: '0.78rem', color: 'var(--text-muted)' }}
                  onClick={() => setIsToolDropdownOpen(!isToolDropdownOpen)}
                >
                  <span>Vincular ferramenta...</span>
                  <Plus size={14} />
                </div>
                {isToolDropdownOpen && (
                  <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, marginTop: '4px', background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', boxShadow: 'var(--shadow-lg)', zIndex: 60, overflow: 'hidden' }}>
                    <div style={{ padding: '8px', display: 'flex', alignItems: 'center', gap: '8px', borderBottom: '1px solid var(--border)' }}>
                      <SearchIcon size={13} style={{ color: 'var(--text-muted)' }} />
                      <input autoFocus type="text" placeholder="Pesquisar..." style={{ background: 'transparent', border: 'none', outline: 'none', fontSize: '0.78rem', color: 'var(--text-primary)', width: '100%' }} value={toolSearchTerm} onChange={e => setToolSearchTerm(e.target.value)} onClick={e => e.stopPropagation()} />
                    </div>
                    <div style={{ maxHeight: '180px', overflowY: 'auto', padding: '4px' }}>
                      {allTools.filter(t => !agentToolsSlugs.includes(t.slug)).filter(t => t.name.toLowerCase().includes(toolSearchTerm.toLowerCase())).map(tool => (
                        <div key={tool.slug} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 10px', borderRadius: 'var(--radius-sm)', cursor: 'pointer', transition: 'var(--transition)' }}
                          onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = 'var(--bg-elevated)'}
                          onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = 'transparent'}
                          onClick={e => { e.stopPropagation(); toggleToolLink(tool.slug); setToolSearchTerm('') }}>
                          <div>
                            <div style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--text-primary)' }}>{tool.name}</div>
                            <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>{tool.slug}</div>
                          </div>
                          <Plus size={12} style={{ color: 'var(--text-muted)' }} />
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>

            <div className="config-section">
              <div className="config-label"><HistoryIcon size={13} /> Histórico de Prompts</div>
              <div className="history-compact-list">
                {promptHistory.map(h => (
                  <div key={h.id} className="history-mini-item">
                    <div>
                      <span className="v-tag">v{h.version}</span>
                      <span className="date">{new Date(h.updated_at).toLocaleDateString('pt-BR')}</span>
                    </div>
                    {!h.is_active && (
                      <button onClick={() => { setEditedPrompt(h.system_prompt); setHasUnsavedChanges(true) }} className="btn-restore" title="Restaurar versão">
                        <RotateCcw size={12} />
                      </button>
                    )}
                  </div>
                ))}
                {promptHistory.length === 0 && <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontStyle: 'italic', padding: '4px' }}>Nenhum histórico</div>}
              </div>
            </div>
          </div>

          <div className="config-footer">
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 12px', background: 'var(--bg-elevated)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border)' }}>
              <div>
                <div style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--text-primary)' }}>Status do Agente</div>
                <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', marginTop: '2px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  {currentAgent?.is_active ? '🟢 Ativo no Sistema' : '🔴 Desativado'}
                </div>
              </div>
              <button
                onClick={async () => {
                  if (!selectedAgentSlug) return
                  await agentsAPI.toggle(selectedAgentSlug, !currentAgent?.is_active)
                  loadInitialData()
                }}
                className={`toggle-btn ${currentAgent?.is_active ? 'active' : ''}`}
              >
                <div className="toggle-slider" />
              </button>
            </div>
            {hasUnsavedChanges && <div className="unsaved-warning">⚠️ Alterações não salvas</div>}
            <button className="btn btn-primary w-full" style={{ justifyContent: 'center' }} onClick={saveConfig} disabled={isSaving || !hasUnsavedChanges}>
              {isSaving ? <div className="spinner" /> : <><Save size={15} /> Salvar Ajustes</>}
            </button>
            {currentAgent && (
              <button className="btn btn-danger w-full" style={{ justifyContent: 'center' }} onClick={handleDeleteAgent}>
                <Trash2 size={14} /> Excluir Agente
              </button>
            )}
          </div>
        </div>
      )}

      {/* New Agent Modal */}
      {isCreateModalOpen && (
        <div className="modal-overlay" onClick={() => setIsCreateModalOpen(false)}>
          <div className="modal-content" style={{ maxWidth: '520px', maxHeight: '90vh', overflowY: 'auto' }} onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '24px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <div style={{ width: 42, height: 42, borderRadius: 'var(--radius-md)', background: 'var(--primary-dim)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--primary)' }}>
                  <Bot size={22} />
                </div>
                <div>
                  <h2 style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: '1.15rem', color: 'var(--text-primary)' }}>Novo Especialista</h2>
                  <p style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '2px', textTransform: 'uppercase', letterSpacing: '0.07em' }}>Configuração Inicial</p>
                </div>
              </div>
              <button className="btn-icon-sm" onClick={() => { setIsCreateModalOpen(false); setCreateError(null) }}><X size={18} /></button>
            </div>
            {createError && <div style={{ background: 'var(--error-dim)', border: '1px solid rgba(239,68,68,0.3)', color: 'var(--error)', padding: '10px 14px', borderRadius: 'var(--radius-md)', fontSize: '0.8rem', marginBottom: '16px' }}>⚠️ {createError}</div>}
            <form onSubmit={handleCreateAgent} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div className="form-grid">
                <div className="form-group">
                  <label className="form-label" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    Emoji
                    <div className="has-tooltip" data-explanation="O ícone que representará o agente nas conversas e no menu lateral.">
                      <Info size={13} style={{ color: 'var(--text-muted)', cursor: 'help' }} />
                    </div>
                  </label>
                  <input className="form-input" value={newAgentData.emoji} onChange={e => setNewAgentData({ ...newAgentData, emoji: e.target.value })} style={{ fontSize: '1.5rem', textAlign: 'center' }} />
                </div>
                <div className="form-group">
                  <label className="form-label" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    Slug (único) *
                    <div className="has-tooltip" data-explanation="Identificador único interno (ex: analista_fiscal). Use apenas letras, números e sublinhados.">
                      <Info size={13} style={{ color: 'var(--text-muted)', cursor: 'help' }} />
                    </div>
                  </label>
                  <input className="form-input" placeholder="ex: analista_fiscal" value={newAgentData.slug} onChange={e => setNewAgentData({ ...newAgentData, slug: e.target.value.toLowerCase().replace(/\s+/g, '_') })} required />
                </div>
              </div>
              <div className="form-group">
                <label className="form-label" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  Nome do Agente *
                  <div className="has-tooltip" data-explanation="O nome de exibição do especialista (ex: Analista Fiscal Imobiliário).">
                    <Info size={13} style={{ color: 'var(--text-muted)', cursor: 'help' }} />
                  </div>
                </label>
                <input className="form-input" placeholder="Ex: Analista Fiscal Imobiliário" value={newAgentData.name} onChange={e => setNewAgentData({ ...newAgentData, name: e.target.value })} required />
              </div>
              <div className="form-group">
                <label className="form-label" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  Descrição *
                  <div className="has-tooltip" data-explanation="⚠️ CAMPO CRÍTICO: Descreva detalhadamente as competências do agente. O Supervisor utiliza esta descrição para decidir se este é o agente mais adequado para responder ao usuário.">
                    <Info size={13} style={{ color: 'var(--accent)', cursor: 'help' }} />
                  </div>
                </label>
                <textarea 
                  className="form-textarea" 
                  style={{ minHeight: '80px', fontSize: '0.8rem', lineHeight: '1.5' }}
                  required
                  placeholder={`Porta de entrada da imobiliária. Identifica rapidamente a intenção do cliente, dá um "olá" humanizado e encaminha para o especialista correto.

✅ **O que FAZ:**
- Acolhimento e triagem inicial (Aluguel, Compra, Suporte).
- Identifica a dor do cliente para transferência ágil.

❌ **O que NÃO FAZ:**
- Pesquisa de imóveis ou recomendações.
- Coleta de documentos ou dados sensíveis.
- Detalhes burocráticos ou contratuais.`}
                  value={newAgentData.description} 
                  onChange={e => setNewAgentData({ ...newAgentData, description: e.target.value })} 
                />
              </div>
              <div className="form-group">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                  <label className="form-label" style={{ marginBottom: 0, display: 'flex', alignItems: 'center', gap: '6px' }}>
                    System Prompt Inicial
                    <div className="has-tooltip" data-explanation="As instruções fundamentais que definem a personalidade, tom de voz e regras de comportamento da IA.">
                      <Info size={13} style={{ color: 'var(--text-muted)', cursor: 'help' }} />
                    </div>
                  </label>
                  <button 
                    type="button"
                    className="btn btn-sm btn-ghost" 
                    style={{ color: 'var(--accent)', fontSize: '0.75rem', padding: '2px 8px', height: 'auto' }} 
                    onClick={() => { setPromptAssistantMode('create'); setIsPromptAssistantOpen(true); }}
                  >
                    <Bot size={13} style={{ marginRight: '4px' }}/> Gerar com IA
                  </button>
                </div>
                <textarea 
                  className="form-textarea" 
                  style={{ minHeight: '140px', fontFamily: 'var(--font-mono)', fontSize: '0.78rem', lineHeight: '1.6' }} 
                  placeholder={`# Atendimento e Triagem

**[Papel]**
Porta de entrada da imobiliária. Mapeia a intenção do cliente e identifica a dor para transferir ao especialista correto.

✅ **FAZ:**
- Acolhimento cordial e triagem (Aluguel, Compra, Suporte).
- Identifica a intenção principal para o handoff.

❌ **NÃO FAZ:**
- Pesquisa de imóveis ou recomendações.
- Coleta de dados sensíveis ou burocracia contratual.

**[Persona]**
- Eficiente (estilo WhatsApp) e Acolhedora.
- Profissional, sem pressão ou menus robóticos.

**[Objetivo]**
Triagem inteligente com no máximo uma pergunta objetiva por vez.

**[Diretrizes]**
1. Analise se a entrada traz contexto ou é saudação.
2. Decida rapidamente o destino do cliente no fluxo.

⚠️ **REGRAS:** Zero invenção de dados e limite de 1 pergunta por mensagem.`} 
                  value={newAgentData.system_prompt} 
                  onChange={e => setNewAgentData({ ...newAgentData, system_prompt: e.target.value })} 
                />
              </div>
              <div style={{ display: 'flex', gap: '10px', marginTop: '8px' }}>
                <button type="button" className="btn btn-ghost" style={{ flex: 1, justifyContent: 'center' }} onClick={() => { setIsCreateModalOpen(false); setCreateError(null) }}>Cancelar</button>
                <button type="submit" className="btn btn-primary" style={{ flex: 1, justifyContent: 'center' }} disabled={isCreatingAgent}>
                  {isCreatingAgent ? <div className="spinner" /> : '🤖 Criar Agente'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <TraceModal isOpen={selectedTrace !== null} onClose={() => setSelectedTrace(null)} trace={selectedTrace} />

      {/* Feedback Modal */}
      <FeedbackModal
        isOpen={feedbackModal.open}
        onClose={() => setFeedbackModal({ open: false, msgIndex: -1, msg: null })}
        onSubmit={handleDislikeSubmit}
        aiResponse={feedbackModal.msg?.content || ''}
        agentName={feedbackModal.msg?.agentName}
        isLoading={feedbackLoading}
      />
      
      <PromptAssistant 
        isOpen={isPromptAssistantOpen}
        onClose={() => { setIsPromptAssistantOpen(false); setActiveChatContext(null); }}
        mode={promptAssistantMode}
        agentSlug={selectedAgentSlug}
        currentPrompt={promptAssistantMode === 'edit' ? editedPrompt : newAgentData.system_prompt}
        chatContext={activeChatContext}
        onApply={(generatedData) => {
          if (promptAssistantMode === 'edit') {
            setEditedPrompt(generatedData as string);
            setHasUnsavedChanges(true);
          } else {
            const spec = generatedData as AgentSpec;
            setNewAgentData({
              ...newAgentData,
              name: spec.name || newAgentData.name,
              description: spec.description || newAgentData.description,
              emoji: spec.emoji || newAgentData.emoji,
              slug: spec.slug || newAgentData.slug,
              system_prompt: spec.system_prompt || newAgentData.system_prompt,
            });
          }
          setIsPromptAssistantOpen(false);
        }}
      />
    </div>
  )
}
