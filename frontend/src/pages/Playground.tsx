import { useEffect, useRef, useState } from 'react'
import { 
  Plus, Send, Trash2, Activity, Search, Home, 
  MessageSquare, Bot, Save, History as HistoryIcon, 
  RotateCcw, Sliders, ChevronRight, X, Pencil, Wrench, Link, Link2Off, Search as SearchIcon, Check
} from 'lucide-react'
import { chatAPI, agentsAPI, promptsAPI, toolsAPI } from '../services/api'
import TraceModal from '../components/TraceModal/TraceModal'

interface Message { 
  role: string; 
  content: string; 
  agentSlug?: string; 
  agentName?: string; 
  agentEmoji?: string; 
  agentColor?: string; 
  metadata?: any 
  appearance?: string;
}

interface Conversation { 
  id: number; 
  session_id: string; 
  title?: string; 
  message_count: number; 
  updated_at: string 
}

interface Agent { 
  slug: string; 
  name: string; 
  emoji: string; 
  color: string; 
  description: string;
  model: string;
  temperature: number;
  max_tokens: number;
  is_active: boolean;
  is_system: boolean;
}

const MODELS_COMMON = [
  'openai/gpt-4o', 'openai/gpt-4o-mini', 'openai/gpt-4-turbo',
  'anthropic/claude-3.5-sonnet', 'anthropic/claude-3-haiku',
  'google/gemini-pro-1.5', 'mistralai/mistral-large',
  'meta-llama/llama-3.1-70b-instruct',
]

export default function Playground() {
  // --- States ---
  const [agents, setAgents] = useState<Agent[]>([])
  const [selectedAgentSlug, setSelectedAgentSlug] = useState<string | null>(null) // null = Geral
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [activeSession, setActiveSession] = useState<string | null>(null)
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  
  // Streaming
  const [isStreaming, setIsStreaming] = useState(false)
  const [streamingAgent, setStreamingAgent] = useState<{ name: string; emoji: string; color: string } | null>(null)
  const [streamingText, setStreamingText] = useState('')
  
  // UI Panels
  const [showConfig, setShowConfig] = useState(false)
  const [showDebug, setShowDebug] = useState(false)
  const [selectedTrace, setSelectedTrace] = useState<any>(null)
  
  // Agent Config Form
  const [editedPrompt, setEditedPrompt] = useState('')
  const [editedParams, setEditedParams] = useState({ model: '', temperature: 0.7, max_tokens: 2048 })
  const [promptHistory, setPromptHistory] = useState<any[]>([])
  const [isSaving, setIsSaving] = useState(false)
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false)
  
  // New Agent Modal
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false)
  const [newAgentData, setNewAgentData] = useState({ slug: '', name: '', emoji: '🤖', description: '' })
  const [isCreatingAgent, setIsCreatingAgent] = useState(false)
  
  const [allTools, setAllTools] = useState<any[]>([])
  const [agentToolsSlugs, setAgentToolsSlugs] = useState<string[]>([])
  const [isUpdatingTools, setIsUpdatingTools] = useState(false)
  const [toolSearchTerm, setToolSearchTerm] = useState('')
  const [isToolDropdownOpen, setIsToolDropdownOpen] = useState(false)

  // --- Refs ---
  const streamingTextRef = useRef('')
  const streamingAgentRef = useRef<{ name: string; emoji: string; color: string } | null>(null)
  const streamingTraceRef = useRef<any>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  // --- Initial Load ---
  useEffect(() => {
    loadInitialData()
  }, [])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, streamingText])

  const loadInitialData = async () => {
    const [agentsRes, convsRes] = await Promise.all([
      agentsAPI.list(),
      chatAPI.listConversations({ is_test: true })
    ])
    // Mostramos todos os agentes especialistas (ativos e inativos) para permitir a ativação no Playground
    const allAgents = agentsRes.data.filter((a: Agent) => a.slug !== 'supervisor')
    setAgents(allAgents)
    setConversations(convsRes.data)
  }

  // --- Chat Logic ---
  const loadConversation = async (sessionId: string) => {
    setActiveSession(sessionId)
    setIsStreaming(false)
    setStreamingText('')
    setStreamingAgent(null)
    streamingTextRef.current = ''
    streamingAgentRef.current = null
    streamingTraceRef.current = null
    setMessages([])

    try {
      const { data } = await chatAPI.getConversation(sessionId)
      if (!data || !data.messages) {
        console.error('Resposta inválida ao carregar conversa:', data)
        return
      }
      setMessages(data.messages.map((m: any) => ({
        role: m.role,
        content: m.content,
        agentSlug: m.agent_slug,
        agentName: m.agent_name,
        agentEmoji: m.agent_emoji,
        agentColor: m.agent_color,
        metadata: m.metadata || m.metadata_,
      })))
    } catch (err) {
      console.error('Erro ao carregar conversa:', err)
      setActiveSession(null)
    }
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
    loadConversationsList()
  }

  const loadConversationsList = async () => {
    const { data } = await chatAPI.listConversations({ is_test: true })
    setConversations(data)
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
      const response = await chatAPI.streamChat(
        text, 
        activeSession || undefined, 
        selectedAgentSlug || undefined,
        true
      )
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

      setMessages(prev => [...prev, {
        role: 'assistant',
        content: streamingTextRef.current,
        agentName: streamingAgentRef.current?.name,
        agentEmoji: streamingAgentRef.current?.emoji,
        agentColor: streamingAgentRef.current?.color,
        metadata: streamingTraceRef.current
      }])
      setStreamingText('')
      setStreamingAgent(null)
      loadConversationsList()
    } catch {
      setMessages(prev => [...prev, {
        role: 'assistant', content: '❌ Erro ao conectar com a IA.',
      }])
    } finally {
      setIsStreaming(false)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage() }
  }

  // --- Agent Config Logic ---
  useEffect(() => {
    if (selectedAgentSlug) {
      loadAgentConfig(selectedAgentSlug)
    } else {
      setEditedPrompt('')
      setEditedParams({ model: '', temperature: 0.7, max_tokens: 2048 })
      setHasUnsavedChanges(false)
    }
  }, [selectedAgentSlug])

  const loadAgentConfig = async (slug: string) => {
    const [agentRes, promptRes, historyRes] = await Promise.all([
      agentsAPI.get(slug),
      promptsAPI.get(slug),
      promptsAPI.history(slug)
    ])
    const agent = agentRes.data
    const prompt = promptRes.data
    
    setEditedPrompt(prompt.system_prompt)
    setEditedParams({ 
      model: agent.model, 
      temperature: agent.temperature, 
      max_tokens: agent.max_tokens 
    })
    setPromptHistory(historyRes.data)
    setHasUnsavedChanges(false)
    
    // Load Tools for this agent
    try {
      const [allToolsRes, agentToolsRes] = await Promise.all([
        toolsAPI.list(),
        toolsAPI.listAgentTools(slug)
      ])
      setAllTools(allToolsRes.data)
      setAgentToolsSlugs(agentToolsRes.data)
    } catch (err) {
      console.error('Erro ao carregar ferramentas do agente:', err)
    }
  }

  const toggleToolLink = async (toolSlug: string) => {
    if (!selectedAgentSlug) return
    setIsUpdatingTools(true)
    const isLinked = agentToolsSlugs.includes(toolSlug)
    try {
      if (isLinked) {
        await toolsAPI.unlink(selectedAgentSlug, toolSlug)
        setAgentToolsSlugs(prev => prev.filter(s => s !== toolSlug))
      } else {
        await toolsAPI.link(selectedAgentSlug, toolSlug)
        setAgentToolsSlugs(prev => [...prev, toolSlug])
      }
    } catch (err) {
      alert('Erro ao alterar vínculo da ferramenta.')
    } finally {
      setIsUpdatingTools(false)
    }
  }

  const saveConfig = async () => {
    if (!selectedAgentSlug) return
    setIsSaving(true)
    try {
      await Promise.all([
        agentsAPI.update(selectedAgentSlug, editedParams),
        promptsAPI.update(selectedAgentSlug, { system_prompt: editedPrompt })
      ])
      await loadAgentConfig(selectedAgentSlug)
      await loadInitialData() // refresh agents list info
      setHasUnsavedChanges(false)
    } catch (err) {
      alert('Erro ao salvar configurações.')
    } finally {
      setIsSaving(false)
    }
  }

  const restoreVersion = (p: any) => {
    setEditedPrompt(p.system_prompt)
    setHasUnsavedChanges(true)
  }
  
  const handleCreateAgent = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newAgentData.slug || !newAgentData.name) return
    setIsCreatingAgent(true)
    try {
      await agentsAPI.create(newAgentData)
      await loadInitialData()
      setIsCreateModalOpen(false)
      setNewAgentData({ slug: '', name: '', emoji: '🤖', description: '' })
      alert('Agente criado com sucesso!')
    } catch (err: any) {
      alert(err.response?.data?.detail || 'Erro ao criar agente.')
    } finally {
      setIsCreatingAgent(false)
    }
  }

  const handleDeleteAgent = async (slug?: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    const targetSlug = slug || selectedAgentSlug;
    if (!targetSlug) return;
    
    const agent = agents.find(a => a.slug === targetSlug);
    if (!agent) return;
    
    if (!confirm(`Tem certeza que deseja excluir o agente "${agent.name}"? Esta ação não pode ser desfeita.`)) return
    
    try {
      await agentsAPI.delete(targetSlug);
      if (selectedAgentSlug === targetSlug) {
        setSelectedAgentSlug(null);
        newChat();
      }
      await loadInitialData();
    } catch (err) {
      alert('Erro ao excluir agente.');
    }
  }

  const currentAgent = selectedAgentSlug ? agents.find(a => a.slug === selectedAgentSlug) : null

  return (
    <div className="playground-layout">
      {/* 
        ESQUEMA DE 3 COLUNAS:
        1. Sidebar: Conversas e Seleção de Agente
        2. Main: Chat
        3. Config (Opcional): Ajustes do Agente
      */}

      {/* --- C1: Sidebar Seleção --- */}
      <div className="playground-sidebar">
        <div className="playground-sidebar-section">
          <div className="section-header">
            <Activity size={14} /> <span>Playground</span>
          </div>
          <button 
            className={`selection-item ${selectedAgentSlug === null ? 'active' : ''}`}
            onClick={() => setSelectedAgentSlug(null)}
          >
            <div className="selection-icon geral"><Sliders size={16} /></div>
            <div className="selection-info">
              <div className="name">Geral (Multi-Agente)</div>
              <div className="desc">Orchestrator Inteligente</div>
            </div>
          </button>
        </div>

        <div className="playground-sidebar-section">
          <div className="section-header">
            <Bot size={14} /> <span>Especialistas</span>
          </div>
          <div className="agents-list">
            {agents.map(a => (
              <div 
                key={a.slug}
                className={`selection-item ${selectedAgentSlug === a.slug ? 'active' : ''} ${!a.is_active ? 'inactive' : ''}`}
                onClick={() => setSelectedAgentSlug(a.slug)}
              >
                <div className="selection-icon">{a.emoji}</div>
                <div className="selection-info">
                  <div className="name">{a.name} {!a.is_active && <span className="opacity-30 text-[10px] ml-1">(OFF)</span>}</div>
                  <div className="desc">{a.slug}</div>
                </div>
                <button 
                  className="agent-config-btn" 
                  onClick={(e) => {
                    e.stopPropagation();
                    setSelectedAgentSlug(a.slug);
                    setShowConfig(true);
                  }}
                  title="Ajustes do Agente"
                >
                  <Pencil size={12} />
                </button>
              </div>
            ))}
          </div>
        </div>

        <div className="playground-sidebar-section conversations">
          <div className="section-header">
            <MessageSquare size={14} /> <span>Conversas Recentes</span>
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
          </div>
        </div>

        <div className="p-4 border-t border-white/5 mt-auto">
          <button 
            className="btn btn-secondary w-full gap-2 border-dashed border-white/10 hover:border-white/30"
            onClick={() => setIsCreateModalOpen(true)}
          >
            <Plus size={14} /> <span>Novo Agente</span>
          </button>
        </div>
      </div>

      {/* --- C2: Main Chat AREA --- */}
      <div className="playground-main">
        {/* Header */}
        <header className="playground-header">
          <div className="header-agent-info">
            {currentAgent ? (
              <>
                <div className="agent-emoji-active">{currentAgent.emoji}</div>
                <div>
                  <div className="agent-name-active">{currentAgent.name}</div>
                  <div className="agent-status-active">Modo Especialista Direto</div>
                </div>
              </>
            ) : (
              <>
                <div className="agent-emoji-active geral"><Activity size={20} /></div>
                <div>
                  <div className="agent-name-active">Orquestrador Geral</div>
                  <div className="agent-status-active">Roteamento Supervisor Ativado</div>
                </div>
              </>
            )}
          </div>
          
          <div className="agent-actions">
            <button 
              className={`btn btn-sm ${showDebug ? 'btn-primary' : 'btn-secondary'}`} 
              onClick={() => setShowDebug(!showDebug)} 
              title="Debug Trace"
            >
              <Activity size={14} />
            </button>
          </div>
        </header>

        {/* Messages */}
        <div className="playground-chat-area">
          {messages.length === 0 && !streamingText ? (
            <div className="playground-welcome">
              <div className="welcome-icon">
                {currentAgent ? currentAgent.emoji : <Home size={40} />}
              </div>
              <h2>{currentAgent ? `Chat com ${currentAgent.name}` : 'Bem-vindo ao Playground'}</h2>
              <p>
                {currentAgent 
                  ? `Você está enviando mensagens diretamente para o agente ${currentAgent.slug}. O supervisor não interferirá neste chat.`
                  : 'Fale com nosso sistema multi-agente. A IA decidirá automaticamente qual especialista é melhor para você.'}
              </p>
              {!currentAgent && (
                <div className="playground-hints">
                  <div className="hint">"Busque casas de 2 quartos em SP"</div>
                  <div className="hint">"Como funciona o contrato de locação?"</div>
                </div>
              )}
            </div>
          ) : (
            <div className="messages-list">
              {messages.map((msg, i) => (
                <div key={i} className={`msg-wrapper ${msg.role}`}>
                  <div className={`msg-avatar ${msg.role === 'user' ? 'user' : 'bot'}`}>
                    {msg.role === 'user' ? 'U' : (msg.agentEmoji || '🤖')}
                  </div>
                  <div className="msg-content-container">
                    {msg.role === 'assistant' && msg.agentName && (
                      <div className="msg-agent-name">{msg.agentName}</div>
                    )}
                    <div className={`msg-bubble ${msg.role}`}>
                      <div className="markdown" dangerouslySetInnerHTML={{
                        __html: msg.content
                          .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
                          .replace(/\*(.*?)\*/g, '<em>$1</em>')
                          .replace(/`(.*?)`/g, '<code>$1</code>')
                          .replace(/\n/g, '<br>')
                      }} />
                    </div>
                    {showDebug && msg.role === 'assistant' && msg.metadata && (
                      <button className="btn-trace" onClick={() => setSelectedTrace(msg.metadata)}>
                        <Search size={10} /> Ver processamento
                      </button>
                    )}
                  </div>
                </div>
              ))}

              {/* Streaming */}
              {(isStreaming || streamingText) && (
                <div className="msg-wrapper assistant">
                  <div className="msg-avatar bot">
                    {streamingAgent?.emoji || '🤖'}
                  </div>
                  <div className="msg-content-container">
                    {streamingAgent && <div className="msg-agent-name">{streamingAgent.name}</div>}
                    <div className="msg-bubble assistant">
                      {streamingText || <div className="typing-dot-loading" />}
                    </div>
                  </div>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>
          )}
        </div>

        {/* Input */}
        <div className="playground-input-footer">
          <div className="input-box-container">
            <textarea 
              ref={textareaRef}
              placeholder="Digite sua mensagem..."
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              rows={1}
              disabled={isStreaming}
            />
            <button 
              className="btn-send" 
              onClick={sendMessage} 
              disabled={isStreaming || !input.trim()}
            >
              <Send size={18} />
            </button>
          </div>
        </div>
      </div>

      {/* --- C3: Config Panel (Right) --- */}
      {selectedAgentSlug && showConfig && (
        <div className="playground-config-panel">
          <div className="config-header">
            <div className="flex items-center gap-2">
              <Pencil size={16} />
              <span>Configurações do Agente</span>
            </div>
            <button className="btn-icon-sm" onClick={() => setShowConfig(false)}><ChevronRight size={18} /></button>
          </div>

          <div className="config-scroll-area">
            {/* System Prompt */}
            <div className="config-section">
              <label className="config-label">System Prompt</label>
              <div className="prompt-editor-wrapper">
                <textarea 
                  className="prompt-editor"
                  value={editedPrompt}
                  onChange={(e) => { setEditedPrompt(e.target.value); setHasUnsavedChanges(true); }}
                  placeholder="Defina o comportamento do agente aqui..."
                />
              </div>
            </div>

            {/* Model & Params */}
            <div className="config-section">
              <label className="config-label">Modelo LLM (OpenRouter)</label>
              <select 
                className="form-select"
                value={editedParams.model}
                onChange={(e) => { setEditedParams({...editedParams, model: e.target.value}); setHasUnsavedChanges(true); }}
              >
                {MODELS_COMMON.map(m => <option key={m} value={m}>{m}</option>)}
              </select>
            </div>

            <div className="config-section">
              <div className="flex justify-between items-center mb-2">
                <label className="config-label m-0">Temperatura</label>
                <span className="value-badge">{editedParams.temperature}</span>
              </div>
              <input 
                type="range" min="0" max="1.5" step="0.1" 
                value={editedParams.temperature}
                onChange={(e) => { setEditedParams({...editedParams, temperature: Number(e.target.value)}); setHasUnsavedChanges(true); }}
              />
            </div>

            <div className="config-section">
              <div className="flex justify-between items-center mb-2">
                <label className="config-label m-0">Max Tokens</label>
                <span className="value-badge">{editedParams.max_tokens}</span>
              </div>
              <input 
                type="range" min="256" max="8192" step="256" 
                value={editedParams.max_tokens}
                onChange={(e) => { setEditedParams({...editedParams, max_tokens: Number(e.target.value)}); setHasUnsavedChanges(true); }}
              />
            </div>

            {/* Tools Section - Professional Searchable Select */}
            <div className="config-section">
              <label className="config-label flex items-center gap-2">
                <Wrench size={13} /> Ferramentas do Agente
              </label>
              
              <div className="mt-3 space-y-3">
                {/* Linked Tools Chips */}
                <div className="flex flex-wrap gap-2">
                  {agentToolsSlugs.map(slug => {
                    const tool = allTools.find(t => t.slug === slug)
                    if (!tool) return null
                    return (
                      <div key={slug} className="flex items-center gap-1.5 bg-primary/10 border border-primary/20 text-primary text-[11px] font-bold px-2 py-1 rounded-md">
                        <span>{tool.name}</span>
                        <button 
                          onClick={() => toggleToolLink(slug)}
                          className="hover:text-white transition-colors"
                        >
                          <X size={12} />
                        </button>
                      </div>
                    )
                  })}
                  {agentToolsSlugs.length === 0 && (
                    <div className="text-[10px] text-muted italic">Nenhuma ferramenta vinculada.</div>
                  )}
                </div>

                {/* Searchable Select */}
                <div className="relative">
                  <div 
                    className={`flex items-center justify-between bg-white/5 border ${isToolDropdownOpen ? 'border-primary' : 'border-white/10'} rounded-lg p-2.5 cursor-pointer hover:bg-white/10 transition-all`}
                    onClick={() => setIsToolDropdownOpen(!isToolDropdownOpen)}
                  >
                    <span className="text-xs text-muted">Vincular nova ferramenta...</span>
                    <Plus size={14} className="text-muted" />
                  </div>

                  {isToolDropdownOpen && (
                    <div className="absolute top-full left-0 right-0 mt-2 bg-[#1A1A1A] border border-white/10 rounded-xl shadow-2xl z-[60] overflow-hidden animate-in fade-in slide-in-from-top-2 duration-200">
                      <div className="p-3 border-bottom border-white/5 bg-white/5 flex items-center gap-2">
                        <SearchIcon size={14} className="text-muted" />
                        <input 
                          type="text" 
                          autoFocus
                          placeholder="Pesquisar ferramenta..." 
                          className="bg-transparent border-none text-xs text-white focus:outline-none w-full"
                          value={toolSearchTerm}
                          onChange={(e) => setToolSearchTerm(e.target.value)}
                          onClick={(e) => e.stopPropagation()}
                        />
                      </div>
                      <div className="max-h-[200px] overflow-y-auto p-1 custom-scrollbar">
                        {allTools
                          .filter(t => !agentToolsSlugs.includes(t.slug))
                          .filter(t => 
                            t.name.toLowerCase().includes(toolSearchTerm.toLowerCase()) || 
                            t.slug.toLowerCase().includes(toolSearchTerm.toLowerCase())
                          ).map(tool => (
                            <div 
                              key={tool.slug}
                              className="flex items-center justify-between p-2.5 rounded-lg hover:bg-white/5 cursor-pointer group transition-colors"
                              onClick={(e) => {
                                e.stopPropagation()
                                toggleToolLink(tool.slug)
                                setToolSearchTerm('')
                              }}
                            >
                              <div className="flex flex-col">
                                <span className="text-[11px] font-bold text-white group-hover:text-primary transition-colors">{tool.name}</span>
                                <span className="text-[9px] text-muted font-mono">{tool.slug}</span>
                              </div>
                              <Plus size={12} className="text-muted group-hover:text-primary" />
                            </div>
                          ))}
                        {allTools.filter(t => !agentToolsSlugs.includes(t.slug)).length === 0 && (
                          <div className="p-4 text-center text-[10px] text-muted italic">Todas as ferramentas já vinculadas.</div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* History */}
            <div className="config-section">
              <label className="config-label flex items-center gap-1">
                <HistoryIcon size={13} /> Histórico de Prompts
              </label>
              <div className="history-compact-list">
                {promptHistory.map((h) => (
                  <div key={h.id} className="history-mini-item">
                    <div>
                      <span className="v-tag">v{h.version}</span>
                      <span className="date">{new Date(h.updated_at).toLocaleDateString('pt-BR')}</span>
                    </div>
                    {!h.is_active && (
                      <button onClick={() => restoreVersion(h)} className="btn-restore" title="Restaurar versão">
                        <RotateCcw size={12} />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="config-footer">
            <div className="flex items-center justify-between mb-4 p-3 bg-white/5 rounded-lg border border-white/10">
              <div className="flex flex-col">
                <span className="text-xs font-bold text-white">Status do Agente</span>
                <span className="text-[10px] text-muted uppercase tracking-wider">
                  {currentAgent?.is_active ? 'Ativo no Sistema' : 'Desativado'}
                </span>
              </div>
              <button 
                onClick={async () => {
                  if (!selectedAgentSlug) return
                  const newStatus = !currentAgent?.is_active
                  await agentsAPI.toggle(selectedAgentSlug, newStatus)
                  loadInitialData() // Atualiza a lista lateral
                }}
                className={`toggle-btn ${currentAgent?.is_active ? 'active' : ''}`}
              >
                <div className="toggle-slider" />
              </button>
            </div>

            {hasUnsavedChanges && (
              <div className="unsaved-warning">⚠️ Alterações não salvas</div>
            )}
            <button 
              className="btn btn-primary w-full" 
              onClick={saveConfig} 
              disabled={isSaving || !hasUnsavedChanges}
            >
              {isSaving ? <div className="spinner" /> : <><Save size={16} /> Salvar Ajustes</>}
            </button>

            {currentAgent && (
              <button 
                className="btn btn-danger w-full mt-2 bg-red-500/10 text-red-500 border-red-500/20 hover:bg-red-500/20" 
                onClick={(e) => handleDeleteAgent(undefined, e)}
              >
                <Trash2 size={14} /> Excluir Agente
              </button>
            )}
          </div>
        </div>
      )}

      {/* New Agent Modal */}
      {isCreateModalOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
          <div className="bg-[#111111] border border-white/10 rounded-2xl w-full max-w-md shadow-2xl overflow-hidden p-6 animate-in fade-in zoom-in duration-200">
            <div className="flex justify-between items-center mb-6">
              <div className="flex items-center gap-3">
                <div className="bg-primary/20 p-2 rounded-lg text-primary"><Bot size={20} /></div>
                <h2 className="text-xl font-bold text-white">Criar Novo Agente</h2>
              </div>
              <button onClick={() => setIsCreateModalOpen(false)} className="text-muted hover:text-white transition-colors">
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleCreateAgent} className="space-y-4">
              <div>
                <label className="text-xs font-bold text-muted uppercase mb-1 block">Nome do Agente</label>
                <input 
                  type="text" 
                  className="form-input w-full" 
                  placeholder="Ex: Consultor Jurídico"
                  value={newAgentData.name}
                  onChange={e => setNewAgentData({...newAgentData, name: e.target.value})}
                  required
                />
              </div>

              <div>
                <label className="text-xs font-bold text-muted uppercase mb-1 block">Slug (ID único)</label>
                <input 
                  type="text" 
                  className="form-input w-full" 
                  placeholder="ex: consultor_jurudico"
                  value={newAgentData.slug}
                  onChange={e => setNewAgentData({...newAgentData, slug: e.target.value.toLowerCase().replace(/\s+/g, '_')})}
                  required
                />
              </div>

              <div className="flex gap-4">
                <div className="w-20">
                  <label className="text-xs font-bold text-muted uppercase mb-1 block">Emoji</label>
                  <input 
                    type="text" 
                    className="form-input w-full text-center" 
                    value={newAgentData.emoji}
                    onChange={e => setNewAgentData({...newAgentData, emoji: e.target.value})}
                  />
                </div>
                <div className="flex-1">
                  <label className="text-xs font-bold text-muted uppercase mb-1 block">Descrição Simples</label>
                  <input 
                    type="text" 
                    className="form-input w-full" 
                    placeholder="O que este agente faz?"
                    value={newAgentData.description}
                    onChange={e => setNewAgentData({...newAgentData, description: e.target.value})}
                  />
                </div>
              </div>

              <div className="pt-4 flex gap-3">
                <button 
                  type="button"
                  className="btn btn-secondary flex-1"
                  onClick={() => setIsCreateModalOpen(false)}
                >
                  Cancelar
                </button>
                <button 
                  type="submit"
                  className="btn btn-primary flex-1"
                  disabled={isCreatingAgent || !newAgentData.slug || !newAgentData.name}
                >
                  {isCreatingAgent ? <div className="spinner" /> : 'Criar Agente'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Trace Modal */}
      <TraceModal 
        isOpen={selectedTrace !== null} 
        onClose={() => setSelectedTrace(null)} 
        trace={selectedTrace} 
      />
    </div>
  )
}
