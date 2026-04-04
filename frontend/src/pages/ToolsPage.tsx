import { useEffect, useRef, useState } from 'react'
import {
  Wrench, Plus, Trash2, Link, Link2Off, Search, ShieldCheck, Zap,
  Play, X, Send, RotateCcw, ChevronRight, ChevronDown,
  Bot, Terminal, Clock, Hash, AlertCircle, Eye, EyeOff, Cpu
} from 'lucide-react'
import { toolsAPI, agentsAPI } from '../services/api'

interface Tool { slug: string; name: string; description: string; prompt: string; type: string; is_active: boolean }
interface Agent { slug: string; name: string; emoji: string }
interface SandboxMessage { role: 'user' | 'assistant'; content: string }
interface SandboxMeta { model: string; injected_prompt_length: number; history_turns: number; system_prompt: string; tool_name: string }
interface SandboxDone { elapsed_ms: number; approx_tokens: number; response_length: number; model: string }

export default function ToolsPage() {
  const [tools, setTools] = useState<Tool[]>([])
  const [agents, setAgents] = useState<Agent[]>([])
  const [searchTerm, setSearchTerm] = useState('')
  const [selectedTool, setSelectedTool] = useState<Tool | null>(null)
  const [linkedAgents, setLinkedAgents] = useState<string[]>([])
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false)
  const [newTool, setNewTool] = useState({ slug: '', name: '', description: '', prompt: '', type: 'external' })
  const [isLinking, setIsLinking] = useState(false)

  // Sandbox state
  const [sandboxMessages, setSandboxMessages] = useState<SandboxMessage[]>([])
  const [sandboxInput, setSandboxInput] = useState('')
  const [isStreaming, setIsStreaming] = useState(false)
  const [streamingText, setStreamingText] = useState('')
  const [sandboxMeta, setSandboxMeta] = useState<SandboxMeta | null>(null)
  const [lastDone, setLastDone] = useState<SandboxDone | null>(null)
  const [showSystemPrompt, setShowSystemPrompt] = useState(false)
  const [showLogsPanel, setShowLogsPanel] = useState(true)
  const [activeTab, setActiveTab] = useState<'chat' | 'details' | 'agents'>('chat')

  const streamingRef = useRef('')
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => { loadData() }, [])
  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [sandboxMessages, streamingText])
  useEffect(() => {
    if (selectedTool) {
      setSandboxMessages([])
      setStreamingText('')
      setSandboxMeta(null)
      setLastDone(null)
      setShowSystemPrompt(false)
      initSandbox(selectedTool)
    }
  }, [selectedTool?.slug])

  const loadData = async () => {
    try {
      const [toolsRes, agentsRes] = await Promise.all([toolsAPI.list(), agentsAPI.list()])
      setTools(toolsRes.data)
      setAgents(agentsRes.data.filter((a: any) => a.slug !== 'supervisor'))
    } catch {}
  }

  const handleSelectTool = async (tool: Tool) => {
    setSelectedTool(tool)
    setLinkedAgents([])
    const links: string[] = []
    for (const agent of agents) {
      try {
        const res = await toolsAPI.listAgentTools(agent.slug)
        if (res.data.includes(tool.slug)) links.push(agent.slug)
      } catch {}
    }
    setLinkedAgents(links)
  }

  const initSandbox = async (tool: Tool) => {
    // Envia mensagem de inicialização para a IA apresentar a ferramenta
    await streamSandboxMessage('Olá! Por favor, se apresente e explique o que você pode testar com esta ferramenta.', [], tool.slug)
  }

  const streamSandboxMessage = async (
    message: string,
    history: SandboxMessage[],
    toolSlug: string
  ) => {
    setIsStreaming(true)
    streamingRef.current = ''
    setStreamingText('')

    try {
      const response = await toolsAPI.streamSandbox(toolSlug, message, history)
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
            if (event.type === 'sandbox_meta') {
              setSandboxMeta(event as SandboxMeta)
            } else if (event.type === 'token') {
              streamingRef.current += event.content
              setStreamingText(streamingRef.current)
            } else if (event.type === 'sandbox_done') {
              setLastDone(event as SandboxDone)
            } else if (event.type === 'sandbox_error') {
              streamingRef.current = `❌ Erro: ${event.message}`
              setStreamingText(streamingRef.current)
            }
          } catch {}
        }
      }

      const finalText = streamingRef.current
      setSandboxMessages(prev => [...prev, { role: 'assistant', content: finalText }])
      setStreamingText('')
    } catch (e: any) {
      setSandboxMessages(prev => [...prev, { role: 'assistant', content: `❌ Erro de conexão: ${e.message}` }])
    } finally {
      setIsStreaming(false)
    }
  }

  const sendSandboxMessage = async () => {
    const text = sandboxInput.trim()
    if (!text || isStreaming || !selectedTool) return
    setSandboxInput('')
    const newUserMsg: SandboxMessage = { role: 'user', content: text }
    setSandboxMessages(prev => {
      const next = [...prev, newUserMsg]
      streamSandboxMessage(text, next.slice(0, -1), selectedTool.slug)
      return next
    })
  }

  const handleSandboxKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendSandboxMessage() }
  }

  const clearSandbox = () => {
    setSandboxMessages([])
    setSandboxMeta(null)
    setLastDone(null)
    setStreamingText('')
    if (selectedTool) initSandbox(selectedTool)
  }

  const toggleLink = async (agentSlug: string) => {
    if (!selectedTool) return
    setIsLinking(true)
    const isLinked = linkedAgents.includes(agentSlug)
    try {
      if (isLinked) {
        await toolsAPI.unlink(agentSlug, selectedTool.slug)
        setLinkedAgents(prev => prev.filter(s => s !== agentSlug))
      } else {
        await toolsAPI.link(agentSlug, selectedTool.slug)
        setLinkedAgents(prev => [...prev, agentSlug])
      }
    } catch { alert('Erro ao alterar vínculo.') } finally { setIsLinking(false) }
  }

  const handleCreateTool = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      await toolsAPI.create(newTool)
      setIsCreateModalOpen(false)
      setNewTool({ slug: '', name: '', description: '', prompt: '', type: 'external' })
      loadData()
    } catch (err: any) { alert(err.response?.data?.detail || 'Erro ao criar ferramenta.') }
  }

  const handleDeleteTool = async (slug: string) => {
    if (!confirm('Excluir esta ferramenta permanentemente?')) return
    try {
      await toolsAPI.delete(slug)
      if (selectedTool?.slug === slug) setSelectedTool(null)
      loadData()
    } catch { alert('Erro ao excluir.') }
  }

  const filteredTools = tools.filter(t =>
    t.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    t.slug.toLowerCase().includes(searchTerm.toLowerCase())
  )
  const internal = filteredTools.filter(t => t.type === 'internal')
  const external = filteredTools.filter(t => t.type === 'external')

  const renderMarkdown = (text: string) => text
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.*?)\*/g, '<em>$1</em>')
    .replace(/`(.*?)`/g, '<code style="background:var(--bg-elevated);padding:1px 5px;border-radius:3px;font-family:var(--font-mono);font-size:0.82em;color:var(--primary)">$1</code>')
    .replace(/```[\w]*\n?([\s\S]*?)```/g, '<pre style="background:var(--bg-elevated);border:1px solid var(--border);border-radius:var(--radius-md);padding:12px 14px;font-family:var(--font-mono);font-size:0.8rem;line-height:1.6;color:var(--text-secondary);overflow-x:auto;white-space:pre-wrap;margin:8px 0">$1</pre>')
    .replace(/^### (.*)/gm, '<h3 style="color:var(--text-primary);font-size:0.95rem;font-weight:700;margin:12px 0 6px">$1</h3>')
    .replace(/^## (.*)/gm, '<h2 style="color:var(--text-primary);font-size:1.1rem;font-weight:800;margin:14px 0 8px">$1</h2>')
    .replace(/^# (.*)/gm, '<h1 style="color:var(--text-primary);font-size:1.2rem;font-weight:800;margin:16px 0 10px">$1</h1>')
    .replace(/\n/g, '<br>')

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '260px 1fr', height: '100vh', overflow: 'hidden' }}>
      {/* ── SIDEBAR ── */}
      <div style={{ background: 'var(--bg-surface)', borderRight: '1px solid var(--border)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <div style={{ padding: '18px 14px 14px', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '14px' }}>
            <div style={{ width: 34, height: 34, borderRadius: 'var(--radius-md)', background: 'linear-gradient(135deg,var(--accent-dim),var(--primary-dim))', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Wrench size={17} style={{ color: 'var(--accent)' }} />
            </div>
            <div style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: '1rem', color: 'var(--text-primary)' }}>Ferramentas</div>
          </div>

          <div style={{ position: 'relative', marginBottom: '10px' }}>
            <Search size={13} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)', pointerEvents: 'none' }} />
            <input style={{ width: '100%', background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', color: 'var(--text-primary)', fontSize: '0.82rem', padding: '8px 10px 8px 30px', outline: 'none', transition: 'var(--transition)' }} placeholder="Pesquisar ferramenta..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} onFocus={e => (e.target as HTMLElement).style.borderColor = 'var(--accent)'} onBlur={e => (e.target as HTMLElement).style.borderColor = 'var(--border)'} />
          </div>

          <button className="btn btn-primary" style={{ width: '100%', justifyContent: 'center', gap: '6px' }} onClick={() => setIsCreateModalOpen(true)}>
            <Plus size={14} /> Nova Ferramenta
          </button>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: '8px' }}>
          {[{ cat: 'internal' as const, label: '🛡️ Nativas (MCP)', items: internal }, { cat: 'external' as const, label: '⚡ Externas', items: external }].map(({ cat, label, items }) => (
            <div key={cat} style={{ marginBottom: '4px' }}>
              <div style={{ fontSize: '0.62rem', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--text-muted)', padding: '10px 8px 5px' }}>{label}</div>
              {items.map(t => (
                <div
                  key={t.slug}
                  onClick={() => handleSelectTool(t)}
                  style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '9px 10px', borderRadius: 'var(--radius-md)', cursor: 'pointer', transition: 'var(--transition)', border: `1px solid ${selectedTool?.slug === t.slug ? 'rgba(16,185,129,0.3)' : 'transparent'}`, background: selectedTool?.slug === t.slug ? 'var(--accent-dim)' : 'transparent', marginBottom: '2px' }}
                  onMouseEnter={e => { if (selectedTool?.slug !== t.slug) (e.currentTarget as HTMLElement).style.background = 'var(--bg-elevated)' }}
                  onMouseLeave={e => { if (selectedTool?.slug !== t.slug) (e.currentTarget as HTMLElement).style.background = 'transparent' }}
                >
                  <div style={{ width: 28, height: 28, borderRadius: 'var(--radius-sm)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, background: cat === 'internal' ? 'var(--primary-dim)' : 'var(--warning-dim)', color: cat === 'internal' ? 'var(--primary)' : 'var(--warning)' }}>
                    {cat === 'internal' ? <ShieldCheck size={12} /> : <Zap size={12} />}
                  </div>
                  <div style={{ flex: 1, overflow: 'hidden' }}>
                    <div style={{ fontSize: '0.82rem', fontWeight: 600, color: selectedTool?.slug === t.slug ? 'var(--accent)' : 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{t.name}</div>
                    <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>{t.slug}</div>
                  </div>
                </div>
              ))}
              {items.length === 0 && <div style={{ padding: '8px 10px', fontSize: '0.72rem', color: 'var(--text-muted)', fontStyle: 'italic' }}>Nenhuma</div>}
            </div>
          ))}
        </div>
      </div>

      {/* ── MAIN ── */}
      {!selectedTool ? (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '16px', textAlign: 'center', color: 'var(--text-muted)' }}>
          <div style={{ width: 72, height: 72, borderRadius: 'var(--radius-xl)', background: 'var(--bg-card)', border: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center', animation: 'float 3s ease-in-out infinite' }}>
            <Bot size={32} style={{ color: 'var(--text-muted)' }} />
          </div>
          <div style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: '1.1rem', color: 'var(--text-secondary)' }}>Selecione uma Ferramenta</div>
          <p style={{ fontSize: '0.85rem', maxWidth: '320px' }}>Escolha uma ferramenta na sidebar para testar com IA e gerenciar vínculos com agentes.</p>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 320px', overflow: 'hidden', height: '100vh' }}>
          {/* ── CENTER: SANDBOX ── */}
          <div style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden', background: 'var(--bg-base)' }}>
            {/* Tabs header */}
            <div style={{ background: 'var(--bg-surface)', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', padding: '14px 20px 0', gap: '4px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flex: 1, paddingBottom: '14px' }}>
                  <div style={{ fontSize: '1rem', fontWeight: 800, fontFamily: 'var(--font-display)', color: 'var(--text-primary)' }}>
                    {selectedTool.name}
                  </div>
                  <span style={{ padding: '2px 8px', borderRadius: 'var(--radius-sm)', fontSize: '0.65rem', fontWeight: 800, letterSpacing: '0.08em', background: selectedTool.type === 'internal' ? 'var(--primary-dim)' : 'var(--warning-dim)', color: selectedTool.type === 'internal' ? 'var(--primary)' : 'var(--warning)' }}>
                    {selectedTool.type === 'internal' ? 'INTERNA' : 'EXTERNA'}
                  </span>
                </div>
                <div style={{ display: 'flex', gap: '6px', paddingBottom: '14px' }}>
                  <button className="btn btn-ghost btn-sm" onClick={clearSandbox} title="Reiniciar sessão" style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                    <RotateCcw size={13} /> Reiniciar
                  </button>
                  {selectedTool.type === 'external' && (
                    <button className="btn btn-danger btn-sm" onClick={() => handleDeleteTool(selectedTool.slug)} style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                      <Trash2 size={13} /> Excluir
                    </button>
                  )}
                </div>
              </div>
              <div style={{ display: 'flex', gap: '0' }}>
                {(['chat', 'details', 'agents'] as const).map((tab) => {
                  const labels = { chat: '🤖 Sandbox IA', details: '📋 Detalhes', agents: '🔗 Agentes' }
                  return (
                    <button
                      key={tab}
                      onClick={() => setActiveTab(tab)}
                      style={{
                        padding: '10px 18px', border: 'none', background: 'transparent', cursor: 'pointer',
                        fontSize: '0.82rem', fontWeight: activeTab === tab ? 700 : 500,
                        color: activeTab === tab ? 'var(--accent)' : 'var(--text-muted)',
                        borderBottom: activeTab === tab ? '2px solid var(--accent)' : '2px solid transparent',
                        transition: 'var(--transition)',
                      }}
                    >{labels[tab]}</button>
                  )
                })}
              </div>
            </div>

            {/* TAB: Chat */}
            {activeTab === 'chat' && (
              <>
                <div style={{ flex: 1, overflowY: 'auto', padding: '20px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
                  {sandboxMessages.map((msg, i) => (
                    <div key={i} style={{ display: 'flex', gap: '10px', flexDirection: msg.role === 'user' ? 'row-reverse' : 'row', animation: 'fadeIn 0.25s ease' }}>
                      <div style={{ width: 32, height: 32, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontWeight: 700, fontSize: '13px', background: msg.role === 'user' ? 'linear-gradient(135deg,var(--primary),#4338CA)' : 'linear-gradient(135deg,var(--accent),var(--accent-hover))', color: '#fff' }}>
                        {msg.role === 'user' ? 'U' : '🤖'}
                      </div>
                      <div style={{ maxWidth: '78%', display: 'flex', flexDirection: 'column', gap: '4px', alignItems: msg.role === 'user' ? 'flex-end' : 'flex-start' }}>
                        {msg.role === 'assistant' && (
                          <div style={{ fontSize: '0.65rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--accent)', padding: '0 4px' }}>
                            Tool Sandbox AI
                          </div>
                        )}
                        <div style={{
                          padding: '12px 16px', borderRadius: msg.role === 'user' ? '14px 14px 4px 14px' : '14px 14px 14px 4px',
                          background: msg.role === 'user' ? 'linear-gradient(135deg,var(--primary),var(--primary-hover))' : 'var(--bg-card)',
                          border: msg.role === 'assistant' ? '1px solid var(--border)' : 'none',
                          color: msg.role === 'user' ? '#fff' : 'var(--text-primary)',
                          fontSize: '0.875rem', lineHeight: 1.65,
                        }}>
                          {msg.role === 'assistant'
                            ? <div dangerouslySetInnerHTML={{ __html: renderMarkdown(msg.content) }} />
                            : msg.content
                          }
                        </div>
                      </div>
                    </div>
                  ))}

                  {(isStreaming || streamingText) && (
                    <div style={{ display: 'flex', gap: '10px', animation: 'fadeIn 0.25s ease' }}>
                      <div style={{ width: 32, height: 32, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, background: 'linear-gradient(135deg,var(--accent),var(--accent-hover))', color: '#fff', fontSize: '16px' }}>🤖</div>
                      <div style={{ maxWidth: '78%' }}>
                        <div style={{ fontSize: '0.65rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--accent)', padding: '0 4px', marginBottom: '4px' }}>Tool Sandbox AI</div>
                        <div style={{ padding: '12px 16px', borderRadius: '14px 14px 14px 4px', background: 'var(--bg-card)', border: '1px solid var(--border)', color: 'var(--text-primary)', fontSize: '0.875rem', lineHeight: 1.65 }}>
                          {streamingText
                            ? <div dangerouslySetInnerHTML={{ __html: renderMarkdown(streamingText) }} />
                            : <div style={{ display: 'flex', gap: '5px', alignItems: 'center' }}>
                              <span style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--accent)', animation: 'pulse 1.2s ease-in-out infinite' }} />
                              <span style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--accent)', animation: 'pulse 1.2s ease-in-out 0.2s infinite' }} />
                              <span style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--accent)', animation: 'pulse 1.2s ease-in-out 0.4s infinite' }} />
                            </div>
                          }
                        </div>
                      </div>
                    </div>
                  )}
                  <div ref={messagesEndRef} />
                </div>

                <div style={{ padding: '14px 20px', borderTop: '1px solid var(--border)', background: 'var(--bg-surface)', flexShrink: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'flex-end', gap: '10px', background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', padding: '10px 14px', transition: 'var(--transition)' }} onFocusCapture={e => (e.currentTarget as HTMLElement).style.borderColor = 'var(--accent)'} onBlurCapture={e => (e.currentTarget as HTMLElement).style.borderColor = 'var(--border)'}>
                    <textarea
                      ref={inputRef}
                      placeholder={isStreaming ? 'Aguardando resposta da IA...' : 'Descreva o que quer testar... (Enter para enviar)'}
                      value={sandboxInput}
                      onChange={e => setSandboxInput(e.target.value)}
                      onKeyDown={handleSandboxKeyDown}
                      rows={1}
                      disabled={isStreaming}
                      style={{ flex: 1, background: 'transparent', border: 'none', outline: 'none', color: 'var(--text-primary)', fontSize: '0.875rem', lineHeight: 1.5, resize: 'none', maxHeight: '120px', fontFamily: 'var(--font-body)' }}
                    />
                    <button
                      onClick={sendSandboxMessage}
                      disabled={isStreaming || !sandboxInput.trim()}
                      style={{ width: 36, height: 36, borderRadius: 'var(--radius-md)', background: 'linear-gradient(135deg,var(--accent),var(--accent-hover))', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', border: 'none', cursor: 'pointer', flexShrink: 0, transition: 'var(--transition)', opacity: (isStreaming || !sandboxInput.trim()) ? 0.3 : 1 }}
                    >
                      <Send size={17} />
                    </button>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '8px' }}>
                    <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <Cpu size={11} /> {sandboxMeta?.model || 'Aguardando...'}
                    </div>
                    {lastDone && (
                      <div style={{ display: 'flex', gap: '12px', fontSize: '0.68rem', color: 'var(--text-muted)' }}>
                        <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}><Clock size={10} /> {lastDone.elapsed_ms}ms</span>
                        <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}><Hash size={10} /> ~{lastDone.approx_tokens} tokens</span>
                      </div>
                    )}
                  </div>
                </div>
              </>
            )}

            {/* TAB: Details */}
            {activeTab === 'details' && (
              <div style={{ flex: 1, overflowY: 'auto', padding: '24px' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                  <div>
                    <div style={{ fontSize: '0.68rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-muted)', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <AlertCircle size={12} /> Descrição
                    </div>
                    <p style={{ fontSize: '0.875rem', color: 'var(--text-secondary)', lineHeight: 1.7, background: 'var(--bg-card)', padding: '14px', borderRadius: 'var(--radius-md)', border: '1px solid var(--border)' }}>
                      {selectedTool.description || 'Sem descrição.'}
                    </p>
                  </div>

                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                      <div style={{ fontSize: '0.68rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <Terminal size={12} /> Prompt Injetado na IA
                      </div>
                      <button
                        onClick={() => setShowSystemPrompt(!showSystemPrompt)}
                        style={{ display: 'flex', alignItems: 'center', gap: '5px', padding: '4px 10px', borderRadius: 'var(--radius-sm)', background: 'var(--bg-elevated)', border: '1px solid var(--border)', color: 'var(--text-muted)', cursor: 'pointer', fontSize: '0.72rem' }}
                      >
                        {showSystemPrompt ? <EyeOff size={12} /> : <Eye size={12} />}
                        {showSystemPrompt ? 'Ocultar' : 'Ver completo'}
                      </button>
                    </div>
                    {showSystemPrompt && sandboxMeta ? (
                      <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.75rem', lineHeight: 1.7, color: 'var(--text-secondary)', background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', padding: '16px', whiteSpace: 'pre-wrap', maxHeight: '400px', overflowY: 'auto' }}>
                        {sandboxMeta.system_prompt}
                      </div>
                    ) : (
                      <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', padding: '14px 16px' }}>
                        <pre style={{ fontFamily: 'var(--font-mono)', fontSize: '0.8rem', lineHeight: 1.65, color: 'var(--text-secondary)', whiteSpace: 'pre-wrap', wordBreak: 'break-word', margin: 0 }}>
                          {selectedTool.prompt || 'Sem prompt definido.'}
                        </pre>
                      </div>
                    )}
                  </div>

                  {sandboxMeta && (
                    <div>
                      <div style={{ fontSize: '0.68rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-muted)', marginBottom: '10px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <Cpu size={12} /> Metadados da Sessão
                      </div>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,1fr)', gap: '10px' }}>
                        {[
                          { label: 'Modelo', value: sandboxMeta.model },
                          { label: 'Tamanho do Prompt', value: `${sandboxMeta.injected_prompt_length} chars` },
                          { label: 'Turnos de Histórico', value: `${sandboxMeta.history_turns}` },
                          { label: 'Ferramenta', value: sandboxMeta.tool_name },
                        ].map(({ label, value }) => (
                          <div key={label} style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', padding: '12px 14px' }}>
                            <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{label}</div>
                            <div style={{ fontSize: '0.85rem', fontFamily: 'var(--font-mono)', color: 'var(--text-primary)', marginTop: '4px', fontWeight: 600 }}>{value}</div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {lastDone && (
                    <div>
                      <div style={{ fontSize: '0.68rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-muted)', marginBottom: '10px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <Clock size={12} /> Última Execução
                      </div>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: '10px' }}>
                        {[
                          { label: 'Tempo', value: `${lastDone.elapsed_ms}ms`, color: lastDone.elapsed_ms > 3000 ? 'var(--warning)' : 'var(--success)' },
                          { label: 'Tokens (est.)', value: `~${lastDone.approx_tokens}`, color: 'var(--primary)' },
                          { label: 'Tamanho', value: `${lastDone.response_length} chars`, color: 'var(--info)' },
                        ].map(({ label, value, color }) => (
                          <div key={label} style={{ background: 'var(--bg-card)', border: `1px solid ${color}33`, borderRadius: 'var(--radius-md)', padding: '12px 14px', textAlign: 'center' }}>
                            <div style={{ fontFamily: 'var(--font-display)', fontSize: '1.2rem', fontWeight: 800, color }}>{value}</div>
                            <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: '3px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* TAB: Agents */}
            {activeTab === 'agents' && (
              <div style={{ flex: 1, overflowY: 'auto', padding: '24px' }}>
                <div style={{ marginBottom: '16px' }}>
                  <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: '0.9rem', color: 'var(--text-primary)', marginBottom: '6px' }}>Vínculos com Agentes</div>
                  <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', lineHeight: 1.6 }}>
                    Agentes vinculados terão esta ferramenta disponível em seu contexto durante as conversas no Playground.
                  </p>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {agents.map(a => {
                    const isLinked = linkedAgents.includes(a.slug)
                    return (
                      <div key={a.slug} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 16px', borderRadius: 'var(--radius-lg)', border: `1px solid ${isLinked ? 'rgba(16,185,129,0.3)' : 'var(--border)'}`, background: isLinked ? 'var(--accent-dim)' : 'var(--bg-card)', transition: 'var(--transition)' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                          <div style={{ width: 38, height: 38, borderRadius: 'var(--radius-md)', background: 'var(--bg-elevated)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '20px', border: '1px solid var(--border)' }}>{a.emoji}</div>
                          <div>
                            <div style={{ fontWeight: 700, fontSize: '0.9rem', color: 'var(--text-primary)' }}>{a.name}</div>
                            <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>{a.slug}</div>
                          </div>
                        </div>
                        <button
                          onClick={() => toggleLink(a.slug)}
                          disabled={isLinking}
                          style={{
                            display: 'flex', alignItems: 'center', gap: '6px',
                            padding: '7px 14px', borderRadius: 'var(--radius-md)', cursor: 'pointer', transition: 'var(--transition)',
                            fontSize: '0.8rem', fontWeight: 600,
                            background: isLinked ? 'var(--error-dim)' : 'var(--bg-elevated)',
                            border: `1px solid ${isLinked ? 'rgba(239,68,68,0.3)' : 'var(--border)'}`,
                            color: isLinked ? 'var(--error)' : 'var(--text-secondary)',
                          }}
                        >
                          {isLinked ? <Link2Off size={14} /> : <Link size={14} />}
                          {isLinked ? 'Desvincular' : 'Vincular'}
                        </button>
                      </div>
                    )
                  })}
                  {agents.length === 0 && (
                    <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                      Nenhum agente cadastrado no sistema.
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* ── RIGHT: LOGS PANEL ── */}
          <div style={{ background: 'var(--bg-surface)', borderLeft: '1px solid var(--border)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Terminal size={15} style={{ color: 'var(--primary)' }} />
                <span style={{ fontWeight: 700, fontSize: '0.875rem', color: 'var(--text-primary)' }}>Log de Execução</span>
              </div>
              <button onClick={() => setShowLogsPanel(!showLogsPanel)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', display: 'flex' }}>
                {showLogsPanel ? <ChevronRight size={16} /> : <ChevronDown size={16} />}
              </button>
            </div>

            {showLogsPanel && (
              <div style={{ flex: 1, overflowY: 'auto', padding: '12px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {/* Tool Info Box */}
                <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', padding: '12px', fontSize: '0.75rem' }}>
                  <div style={{ fontWeight: 700, color: 'var(--text-secondary)', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.07em', fontSize: '0.65rem' }}>Ferramenta Ativa</div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ color: 'var(--text-muted)' }}>Slug</span>
                      <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--accent)', fontWeight: 600 }}>{selectedTool.slug}</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ color: 'var(--text-muted)' }}>Tipo</span>
                      <span style={{ color: selectedTool.type === 'internal' ? 'var(--primary)' : 'var(--warning)', fontWeight: 600 }}>
                        {selectedTool.type === 'internal' ? '🛡️ Interna' : '⚡ Externa'}
                      </span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ color: 'var(--text-muted)' }}>Prompt</span>
                      <span style={{ color: 'var(--text-secondary)' }}>{selectedTool.prompt?.length || 0} chars</span>
                    </div>
                  </div>
                </div>

                {/* Sandbox meta */}
                {sandboxMeta && (
                  <div style={{ background: 'var(--bg-card)', border: '1px solid rgba(99,102,241,0.2)', borderRadius: 'var(--radius-md)', padding: '12px', fontSize: '0.75rem' }}>
                    <div style={{ fontWeight: 700, color: 'var(--primary)', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.07em', fontSize: '0.65rem' }}>🧠 Sessão Sandbox</div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span style={{ color: 'var(--text-muted)' }}>Modelo</span>
                        <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-secondary)', fontSize: '0.65rem' }}>{sandboxMeta.model.split('/')[1] || sandboxMeta.model}</span>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span style={{ color: 'var(--text-muted)' }}>Prompt injetado</span>
                        <span style={{ color: 'var(--text-secondary)' }}>{sandboxMeta.injected_prompt_length} chars</span>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span style={{ color: 'var(--text-muted)' }}>Turns</span>
                        <span style={{ color: 'var(--text-secondary)' }}>{sandboxMessages.filter(m => m.role === 'user').length}</span>
                      </div>
                    </div>
                  </div>
                )}

                {/* Per-message logs */}
                {sandboxMessages.length > 0 && (
                  <div>
                    <div style={{ fontSize: '0.65rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--text-muted)', marginBottom: '6px', padding: '0 2px' }}>📨 Mensagens da Sessão</div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                      {sandboxMessages.map((m, i) => (
                        <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', padding: '8px 10px', borderRadius: 'var(--radius-sm)', background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
                          <div style={{ width: 20, height: 20, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '10px', flexShrink: 0, fontWeight: 700, background: m.role === 'user' ? 'var(--primary-dim)' : 'var(--accent-dim)', color: m.role === 'user' ? 'var(--primary)' : 'var(--accent)' }}>
                            {m.role === 'user' ? 'U' : '🤖'}
                          </div>
                          <div style={{ flex: 1, overflow: 'hidden' }}>
                            <div style={{ fontSize: '0.65rem', fontWeight: 700, color: m.role === 'user' ? 'var(--primary)' : 'var(--accent)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                              {m.role === 'user' ? 'user' : 'sandbox_ai'}
                            </div>
                            <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '2px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {m.content.replace(/<[^>]+>/g, '').slice(0, 60)}{m.content.length > 60 ? '...' : ''}
                            </div>
                            <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', marginTop: '2px' }}>
                              {m.content.length} chars
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Timing */}
                {lastDone && (
                  <div style={{ background: 'var(--bg-card)', border: '1px solid rgba(16,185,129,0.2)', borderRadius: 'var(--radius-md)', padding: '12px', fontSize: '0.75rem' }}>
                    <div style={{ fontWeight: 700, color: 'var(--success)', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.07em', fontSize: '0.65rem' }}>⚡ Última Execução</div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span style={{ color: 'var(--text-muted)' }}>Resposta em</span>
                        <span style={{ fontWeight: 700, color: lastDone.elapsed_ms > 3000 ? 'var(--warning)' : 'var(--success)' }}>{lastDone.elapsed_ms}ms</span>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span style={{ color: 'var(--text-muted)' }}>Tokens (est.)</span>
                        <span style={{ color: 'var(--text-secondary)' }}>~{lastDone.approx_tokens}</span>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span style={{ color: 'var(--text-muted)' }}>Resp. length</span>
                        <span style={{ color: 'var(--text-secondary)' }}>{lastDone.response_length} chars</span>
                      </div>
                    </div>
                  </div>
                )}

                {sandboxMessages.length === 0 && !sandboxMeta && (
                  <div style={{ textAlign: 'center', padding: '24px 12px', color: 'var(--text-muted)', fontSize: '0.75rem' }}>
                    <Bot size={24} style={{ margin: '0 auto 8px', opacity: 0.4 }} />
                    <p>Os logs da sessão aparecerão aqui conforme você interagir com o Sandbox AI.</p>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── CREATE MODAL ── */}
      {isCreateModalOpen && (
        <div className="modal-overlay" onClick={() => setIsCreateModalOpen(false)}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '24px' }}>
              <div>
                <h2 style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: '1.2rem', color: 'var(--text-primary)' }}>Cadastrar Ferramenta Externa</h2>
                <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: '3px' }}>O prompt é injetado no contexto do agente e pode ser testado via Sandbox IA</p>
              </div>
              <button className="btn btn-ghost btn-sm" onClick={() => setIsCreateModalOpen(false)} style={{ padding: '6px' }}><X size={18} /></button>
            </div>

            <form onSubmit={handleCreateTool} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div className="form-group">
                <label className="form-label">Nome</label>
                <input className="form-input" placeholder="Ex: Calculadora de Financiamento" value={newTool.name} onChange={e => setNewTool({ ...newTool, name: e.target.value })} required />
              </div>
              <div className="form-group">
                <label className="form-label">Slug (identificador único)</label>
                <input className="form-input" placeholder="ex: calc_financiamento" value={newTool.slug} onChange={e => setNewTool({ ...newTool, slug: e.target.value.toLowerCase().replace(/\s+/g, '_') })} required style={{ fontFamily: 'var(--font-mono)' }} />
              </div>
              <div className="form-group">
                <label className="form-label">Descrição (para humanos)</label>
                <textarea className="form-textarea" style={{ minHeight: '60px' }} placeholder="O que esta ferramenta faz?" value={newTool.description} onChange={e => setNewTool({ ...newTool, description: e.target.value })} />
              </div>
              <div className="form-group">
                <label className="form-label" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <Terminal size={12} /> Prompt de Uso (injetado na IA)
                </label>
                <textarea className="form-textarea" style={{ minHeight: '120px', fontFamily: 'var(--font-mono)', fontSize: '0.78rem' }} placeholder="Ex: Quando o usuário precisar calcular financiamentos, utilize as fórmulas SAC e Price. Para calcular, você precisa de: valor do imóvel, entrada, prazo e taxa de juros..." value={newTool.prompt} onChange={e => setNewTool({ ...newTool, prompt: e.target.value })} required />
              </div>
              <div style={{ display: 'flex', gap: '10px', marginTop: '8px' }}>
                <button type="button" className="btn btn-ghost" style={{ flex: 1, justifyContent: 'center' }} onClick={() => setIsCreateModalOpen(false)}>Cancelar</button>
                <button type="submit" className="btn btn-primary" style={{ flex: 1, justifyContent: 'center' }}>
                  <Play size={14} /> Criar e Testar
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
