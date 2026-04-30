import { useEffect, useState, useRef } from 'react'
import {
  MessageCircle, Search, RefreshCw, Bot, User,
  MessagesSquare, Clock, Hash, ChevronRight, Loader2,
  Inbox, Send, Lock
} from 'lucide-react'
import { chatAPI } from '../services/api'

// ─── Helpers ─────────────────────────────────────────────────────────────────

function timeAgo(dateStr: string) {
  const diff = Date.now() - new Date(dateStr).getTime()
  const m = Math.floor(diff / 60000)
  const h = Math.floor(diff / 3600000)
  const d = Math.floor(diff / 86400000)
  if (m < 1) return 'agora'
  if (m < 60) return `${m}m`
  if (h < 24) return `${h}h`
  if (d < 7) return `${d}d`
  return new Date(dateStr).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })
}

function formatDateTime(dateStr: string) {
  return new Date(dateStr).toLocaleString('pt-BR', {
    day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit'
  })
}

function getInitials(title: string) {
  const words = (title || 'Lead').split(' ').filter(Boolean)
  return words.slice(0, 2).map(w => w[0]?.toUpperCase()).join('')
}

function avatarColor(session_id: string) {
  const colors = [
    '#6366f1', '#8b5cf6', '#ec4899', '#14b8a6',
    '#f59e0b', '#10b981', '#3b82f6', '#ef4444',
  ]
  let hash = 0
  for (const ch of session_id) hash = ch.charCodeAt(0) + ((hash << 5) - hash)
  return colors[Math.abs(hash) % colors.length]
}

// ─── Types ────────────────────────────────────────────────────────────────────

interface Conversation {
  id: number
  session_id: string
  title: string | null
  last_agent_name: string | null
  last_agent_emoji: string | null
  last_message_preview: string | null
  last_message_role: string | null
  message_count: number
  total_tokens: number
  is_test: boolean
  created_at: string
  updated_at: string
}

interface Message {
  id: number
  role: string
  content: string
  agent_name: string | null
  agent_emoji: string | null
  created_at: string
}

// ─── Subcomponents ────────────────────────────────────────────────────────────

function ConversationItem({
  conv, selected, onClick
}: { conv: Conversation; selected: boolean; onClick: () => void }) {
  const color = avatarColor(conv.session_id)
  const title = conv.title || 'Conversa sem título'
  const preview = conv.last_message_preview || 'Sem mensagens'
  const isAI = conv.last_message_role === 'assistant'

  return (
    <div
      id={`conv-item-${conv.id}`}
      onClick={onClick}
      style={{
        display: 'flex',
        gap: '12px',
        padding: '14px 16px',
        cursor: 'pointer',
        borderBottom: '1px solid var(--border)',
        background: selected ? 'rgba(99,102,241,0.08)' : 'transparent',
        borderLeft: selected ? '3px solid var(--primary)' : '3px solid transparent',
        transition: 'background 0.15s',
        position: 'relative',
      }}
      onMouseEnter={e => { if (!selected) (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.03)' }}
      onMouseLeave={e => { if (!selected) (e.currentTarget as HTMLElement).style.background = 'transparent' }}
    >
      {/* Avatar */}
      <div style={{
        width: 40, height: 40, borderRadius: '50%', flexShrink: 0,
        background: color, display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: '0.8rem', fontWeight: 700, color: '#fff', letterSpacing: '0.02em'
      }}>
        {getInitials(title)}
      </div>

      {/* Content */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '8px', marginBottom: '3px' }}>
          <span style={{
            fontSize: '0.85rem', fontWeight: 600,
            color: selected ? 'var(--primary)' : 'var(--text)',
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1
          }}>
            {title}
          </span>
          <span style={{ fontSize: '0.7rem', color: 'var(--muted)', flexShrink: 0 }}>
            {timeAgo(conv.updated_at)}
          </span>
        </div>

        <div style={{
          fontSize: '0.75rem', color: 'var(--muted)',
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          display: 'flex', alignItems: 'center', gap: '4px'
        }}>
          {isAI && conv.last_agent_emoji && (
            <span style={{ fontSize: '0.8em', flexShrink: 0 }}>{conv.last_agent_emoji}</span>
          )}
          {!isAI && conv.last_message_role === 'user' && (
            <User size={10} style={{ flexShrink: 0, color: 'var(--muted)' }} />
          )}
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {preview}
          </span>
        </div>

        {/* Footer */}
        <div style={{ display: 'flex', gap: '10px', marginTop: '5px', alignItems: 'center' }}>
          <span style={{ fontSize: '0.68rem', color: 'var(--muted)', display: 'flex', alignItems: 'center', gap: '3px' }}>
            <Hash size={9} />
            {conv.message_count} msgs
          </span>
          {conv.last_agent_name && (
            <span style={{
              fontSize: '0.65rem', padding: '1px 6px', borderRadius: '4px',
              background: 'rgba(99,102,241,0.12)', color: 'var(--primary)', fontWeight: 500
            }}>
              {conv.last_agent_name}
            </span>
          )}
        </div>
      </div>
    </div>
  )
}

function MessageBubble({ msg }: { msg: Message }) {
  const isUser = msg.role === 'user'
  const isSystem = msg.role === 'system'

  if (isSystem) return null

  return (
    <div style={{
      display: 'flex',
      flexDirection: isUser ? 'row' : 'row-reverse',
      gap: '10px',
      alignItems: 'flex-end',
      marginBottom: '16px',
    }}>
      {/* Avatar */}
      <div style={{
        width: 30, height: 30, borderRadius: '50%', flexShrink: 0,
        background: isUser ? 'var(--bg-elevated)' : 'rgba(99,102,241,0.15)',
        border: '1px solid var(--border)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: '0.7rem',
      }}>
        {isUser
          ? <User size={14} style={{ color: 'var(--muted)' }} />
          : <span style={{ fontSize: '0.85em' }}>{msg.agent_emoji || '🤖'}</span>
        }
      </div>

      {/* Bubble */}
      <div style={{ maxWidth: '72%', minWidth: 0 }}>
        {!isUser && msg.agent_name && (
          <div style={{ fontSize: '0.68rem', color: 'var(--muted)', marginBottom: '4px', paddingRight: '2px', display: 'flex', alignItems: 'center', gap: '4px', justifyContent: 'flex-end' }}>
            <span>{formatDateTime(msg.created_at)}</span>
            <span>·</span>
            <span style={{ fontWeight: 600, color: 'var(--primary)' }}>{msg.agent_name}</span>
          </div>
        )}

        <div style={{
          padding: '10px 14px',
          borderRadius: isUser ? '16px 16px 16px 4px' : '16px 16px 4px 16px',
          background: isUser ? 'var(--bg-elevated)' : 'rgba(99,102,241,0.15)',
          border: `1px solid ${isUser ? 'var(--border)' : 'rgba(99,102,241,0.25)'}`,
          fontSize: '0.875rem',
          lineHeight: '1.6',
          color: 'var(--text)',
          wordBreak: 'break-word',
          whiteSpace: 'pre-wrap',
        }}>
          {msg.content}
        </div>

        {isUser && (
          <div style={{ fontSize: '0.68rem', color: 'var(--muted)', marginTop: '4px', paddingLeft: '2px', textAlign: 'left' }}>
            {formatDateTime(msg.created_at)}
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function Conversations() {
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [filtered, setFiltered] = useState<Conversation[]>([])
  const [selected, setSelected] = useState<Conversation | null>(null)
  const [messages, setMessages] = useState<Message[]>([])
  const [search, setSearch] = useState('')
  const [loadingList, setLoadingList] = useState(true)
  const [loadingMsgs, setLoadingMsgs] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)

  useEffect(() => { loadConversations() }, [])

  useEffect(() => {
    const q = search.toLowerCase()
    setFiltered(
      q
        ? conversations.filter(c =>
            (c.title || '').toLowerCase().includes(q) ||
            (c.last_message_preview || '').toLowerCase().includes(q)
          )
        : conversations
    )
  }, [search, conversations])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const loadConversations = async (silent = false) => {
    if (!silent) setLoadingList(true)
    else setRefreshing(true)
    try {
      const { data } = await chatAPI.listConversations({ is_test: false, page_size: 100 })
      setConversations(data)
      setFiltered(data)
    } finally {
      setLoadingList(false)
      setRefreshing(false)
    }
  }

  const selectConversation = async (conv: Conversation) => {
    setSelected(conv)
    setMessages([])
    setLoadingMsgs(true)
    try {
      const { data } = await chatAPI.getConversation(conv.session_id)
      setMessages(data.messages || [])
    } finally {
      setLoadingMsgs(false)
    }
  }

  return (
    <div style={{
      display: 'flex',
      height: '100vh',
      width: '100%',
      overflow: 'hidden',
      background: 'var(--bg-base)',
    }}>

      {/* ── Left Panel: Conversation List ───────────────────────────────── */}
      <div style={{
        width: 340,
        minWidth: 300,
        maxWidth: 380,
        borderRight: '1px solid var(--border)',
        display: 'flex',
        flexDirection: 'column',
        background: 'var(--bg-surface)',
        flexShrink: 0,
      }}>
        {/* Header */}
        <div style={{
          padding: '18px 16px 12px',
          borderBottom: '1px solid var(--border)',
          display: 'flex',
          alignItems: 'center',
          gap: '10px',
        }}>
          <MessageCircle size={18} style={{ color: 'var(--primary)' }} />
          <span style={{ fontWeight: 700, fontSize: '1rem', color: 'var(--text)', flex: 1 }}>
            Conversas
          </span>
          <span style={{
            fontSize: '0.72rem', fontWeight: 600, padding: '2px 8px',
            borderRadius: '999px', background: 'rgba(99,102,241,0.12)',
            color: 'var(--primary)',
          }}>
            {filtered.length}
          </span>
          <button
            id="refresh-conversations-btn"
            onClick={() => loadConversations(true)}
            title="Atualizar"
            style={{
              padding: '6px', background: 'transparent', border: 'none', cursor: 'pointer',
              color: 'var(--muted)', borderRadius: '8px', display: 'flex', alignItems: 'center',
            }}
          >
            <RefreshCw size={14} className={refreshing ? 'spin' : ''} />
          </button>
        </div>

        {/* Search */}
        <div style={{ padding: '10px 12px', borderBottom: '1px solid var(--border)' }}>
          <div style={{ position: 'relative' }}>
            <Search size={14} style={{
              position: 'absolute', left: '10px', top: '50%',
              transform: 'translateY(-50%)', color: 'var(--muted)', pointerEvents: 'none'
            }} />
            <input
              id="conversations-search"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Buscar conversas..."
              style={{
                width: '100%', boxSizing: 'border-box',
                padding: '8px 10px 8px 32px',
                background: 'var(--bg-base)', border: '1px solid var(--border)',
                borderRadius: '8px', fontSize: '0.82rem', color: 'var(--text)',
                outline: 'none',
              }}
            />
          </div>
        </div>

        {/* Tab pills */}
        <div style={{ padding: '8px 12px 4px', display: 'flex', gap: '6px' }}>
          <span style={{
            fontSize: '0.72rem', padding: '3px 10px', borderRadius: '999px',
            background: 'rgba(99,102,241,0.15)', color: 'var(--primary)', fontWeight: 600
          }}>
            Todas
          </span>
        </div>

        {/* List */}
        <div style={{ flex: 1, overflowY: 'auto' }}>
          {loadingList ? (
            <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '200px', flexDirection: 'column', gap: '12px' }}>
              <Loader2 size={24} style={{ color: 'var(--primary)', animation: 'spin 1s linear infinite' }} />
              <span style={{ fontSize: '0.8rem', color: 'var(--muted)' }}>Carregando...</span>
            </div>
          ) : filtered.length === 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '200px', gap: '12px', padding: '20px' }}>
              <Inbox size={36} style={{ color: 'var(--muted)', opacity: 0.5 }} />
              <div style={{ textAlign: 'center' }}>
                <p style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text)', marginBottom: '4px' }}>Nenhuma conversa</p>
                <p style={{ fontSize: '0.75rem', color: 'var(--muted)' }}>As conversas via API aparecerão aqui</p>
              </div>
            </div>
          ) : filtered.map(conv => (
            <ConversationItem
              key={conv.session_id}
              conv={conv}
              selected={selected?.session_id === conv.session_id}
              onClick={() => selectConversation(conv)}
            />
          ))}
        </div>
      </div>

      {/* ── Right Panel: Chat View ──────────────────────────────────────── */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, overflow: 'hidden' }}>

        {!selected ? (
          /* Empty state */
          <div style={{
            flex: 1, display: 'flex', flexDirection: 'column',
            alignItems: 'center', justifyContent: 'center', gap: '20px',
            color: 'var(--muted)', padding: '40px'
          }}>
            <div style={{
              width: 80, height: 80, borderRadius: '50%',
              background: 'rgba(99,102,241,0.08)', border: '1px solid rgba(99,102,241,0.15)',
              display: 'flex', alignItems: 'center', justifyContent: 'center'
            }}>
              <MessagesSquare size={36} style={{ color: 'var(--primary)', opacity: 0.6 }} />
            </div>
            <div style={{ textAlign: 'center' }}>
              <p style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--text)', marginBottom: '8px' }}>
                Selecione uma conversa
              </p>
              <p style={{ fontSize: '0.83rem', color: 'var(--muted)', maxWidth: '320px', lineHeight: 1.6 }}>
                Escolha uma conversa na lista ao lado para visualizar as mensagens trocadas entre a IA e o lead.
              </p>
            </div>
            <div style={{
              padding: '10px 20px', borderRadius: '8px',
              background: 'var(--bg-elevated)', border: '1px solid var(--border)',
              fontSize: '0.78rem', color: 'var(--muted)', display: 'flex', alignItems: 'center', gap: '8px'
            }}>
              <ChevronRight size={14} style={{ color: 'var(--primary)' }} />
              {conversations.length} conversa{conversations.length !== 1 ? 's' : ''} disponív{conversations.length !== 1 ? 'eis' : 'el'}
            </div>
          </div>
        ) : (
          <>
            {/* Chat header */}
            <div style={{
              padding: '14px 20px',
              borderBottom: '1px solid var(--border)',
              background: 'var(--bg-surface)',
              display: 'flex',
              alignItems: 'center',
              gap: '12px',
              flexShrink: 0,
            }}>
              <div style={{
                width: 38, height: 38, borderRadius: '50%',
                background: avatarColor(selected.session_id),
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: '0.8rem', fontWeight: 700, color: '#fff', flexShrink: 0,
              }}>
                {getInitials(selected.title || 'Lead')}
              </div>

              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 700, fontSize: '0.95rem', color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {selected.title || 'Conversa sem título'}
                </div>
                <div style={{ fontSize: '0.73rem', color: 'var(--muted)', display: 'flex', alignItems: 'center', gap: '8px', marginTop: '2px' }}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <Clock size={10} />
                    Iniciada {formatDateTime(selected.created_at)}
                  </span>
                  <span>·</span>
                  <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <Hash size={10} />
                    {selected.message_count} mensagens
                  </span>
                  {selected.last_agent_name && (
                    <>
                      <span>·</span>
                      <span style={{
                        padding: '1px 7px', borderRadius: '4px',
                        background: 'rgba(99,102,241,0.12)', color: 'var(--primary)',
                        fontWeight: 600, fontSize: '0.68rem'
                      }}>
                        {selected.last_agent_emoji} {selected.last_agent_name}
                      </span>
                    </>
                  )}
                </div>
              </div>

              {/* Session badge */}
              <div style={{
                fontSize: '0.65rem', fontFamily: 'monospace',
                padding: '4px 8px', borderRadius: '6px',
                background: 'var(--bg-base)', border: '1px solid var(--border)',
                color: 'var(--muted)', flexShrink: 0, maxWidth: '180px',
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              }}>
                {selected.session_id}
              </div>
            </div>

            {/* Messages area */}
            <div style={{
              flex: 1, overflowY: 'auto', padding: '24px 24px 8px',
              display: 'flex', flexDirection: 'column',
            }}>
              {loadingMsgs ? (
                <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '200px', gap: '12px', flexDirection: 'column' }}>
                  <Loader2 size={24} style={{ color: 'var(--primary)', animation: 'spin 1s linear infinite' }} />
                  <span style={{ fontSize: '0.8rem', color: 'var(--muted)' }}>Carregando mensagens...</span>
                </div>
              ) : messages.length === 0 ? (
                <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '200px', flexDirection: 'column', gap: '12px' }}>
                  <Bot size={36} style={{ color: 'var(--muted)', opacity: 0.4 }} />
                  <p style={{ fontSize: '0.83rem', color: 'var(--muted)' }}>Sem mensagens nesta conversa</p>
                </div>
              ) : (
                <>
                  {/* Date separator */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '24px' }}>
                    <div style={{ flex: 1, height: '1px', background: 'var(--border)' }} />
                    <span style={{
                      fontSize: '0.68rem', color: 'var(--muted)',
                      padding: '3px 10px', borderRadius: '999px',
                      background: 'var(--bg-elevated)', border: '1px solid var(--border)',
                    }}>
                      Início da conversa — {formatDateTime(selected.created_at)}
                    </span>
                    <div style={{ flex: 1, height: '1px', background: 'var(--border)' }} />
                  </div>

                  {messages.map(msg => <MessageBubble key={msg.id} msg={msg} />)}
                  <div ref={messagesEndRef} />
                </>
              )}
            </div>

            {/* Input (disabled / read-only) */}
            <div style={{
              padding: '12px 20px 16px',
              borderTop: '1px solid var(--border)',
              background: 'var(--bg-surface)',
              flexShrink: 0,
            }}>
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
                padding: '10px 14px',
                borderRadius: '12px',
                background: 'var(--bg-base)',
                border: '1px solid var(--border)',
                opacity: 0.6,
              }}>
                <Lock size={14} style={{ color: 'var(--muted)', flexShrink: 0 }} />
                <span style={{ flex: 1, fontSize: '0.82rem', color: 'var(--muted)', fontStyle: 'italic' }}>
                  Modo visualização — o envio de mensagens pelo painel estará disponível em breve.
                </span>
                <div style={{
                  padding: '6px 14px', borderRadius: '8px',
                  background: 'var(--bg-elevated)', border: '1px solid var(--border)',
                  display: 'flex', alignItems: 'center', gap: '6px',
                  fontSize: '0.78rem', color: 'var(--muted)', cursor: 'not-allowed',
                }}>
                  <Send size={13} />
                  Enviar
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
