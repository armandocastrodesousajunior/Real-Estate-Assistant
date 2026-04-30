import { useState, useEffect } from 'react'
import { workspacesAPI } from '../services/api'
import {
  Key, Copy, RefreshCw, AlertTriangle, CheckCircle, Shield,
  Terminal, Lock, Globe, Zap, Eye, EyeOff, Info, ExternalLink, X
} from 'lucide-react'

export default function TokenSettings() {
  const [workspace, setWorkspace] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [copied, setCopied] = useState(false)
  const [isRegenerating, setIsRegenerating] = useState(false)
  const [revealed, setRevealed] = useState(false)
  const [showModal, setShowModal] = useState(false)

  const workspaceId = localStorage.getItem('rea_workspace_id')

  useEffect(() => {
    loadWorkspace()
  }, [])

  const loadWorkspace = async () => {
    if (!workspaceId) {
      setError('Nenhum workspace selecionado.')
      setLoading(false)
      return
    }
    try {
      setLoading(true)
      const res = await workspacesAPI.get(Number(workspaceId))
      setWorkspace(res.data)
      setError('')
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Erro ao carregar detalhes do workspace.')
    } finally {
      setLoading(false)
    }
  }

  const handleCopy = () => {
    if (workspace?.api_token) {
      navigator.clipboard.writeText(workspace.api_token)
      setCopied(true)
      setTimeout(() => setCopied(false), 2500)
    }
  }

  const handleRegenerate = async () => {
    try {
      setIsRegenerating(true)
      const res = await workspacesAPI.regenerateToken(Number(workspaceId))
      setWorkspace(res.data)
      setRevealed(false)
      setShowModal(false)
    } catch (err: any) {
      alert(err.response?.data?.detail || 'Erro ao gerar novo token. Apenas o dono do workspace pode fazer isso.')
    } finally {
      setIsRegenerating(false)
    }
  }

  const token = workspace?.api_token || ''
  const maskedToken = token.length > 8
    ? `${token.substring(0, 4)}${'•'.repeat(Math.max(0, token.length - 8))}${token.substring(token.length - 4)}`
    : '••••••••••••••••••••••••••••••••'

  if (loading) return (
    <div className="loading-center">
      <div className="spinner spinner-lg" />
    </div>
  )

  if (error) return (
    <div className="space-y-4 pb-20">
      <div className="card" style={{ borderColor: 'var(--danger)' }}>
        <div className="card-body" style={{ padding: '24px' }}>
          <div className="flex items-center gap-3">
            <AlertTriangle size={20} className="text-danger" />
            <p style={{ color: 'var(--danger)', fontWeight: 500 }}>{error}</p>
          </div>
        </div>
      </div>
    </div>
  )

  return (
    <>
      {/* ── Revoke Confirmation Modal ─────────────────────────────────────── */}
      {showModal && (
        <div
          onClick={() => !isRegenerating && setShowModal(false)}
          style={{
            position: 'fixed', inset: 0, zIndex: 9999,
            background: 'rgba(0,0,0,0.6)',
            backdropFilter: 'blur(6px)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: '24px'
          }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{
              background: 'var(--bg-card)',
              border: '1px solid rgba(239,68,68,0.35)',
              borderRadius: '16px',
              padding: '32px',
              maxWidth: '440px',
              width: '100%',
              boxShadow: '0 24px 60px rgba(0,0,0,0.4), 0 0 0 1px rgba(239,68,68,0.1)',
              animation: 'fadeIn 0.15s ease'
            }}
          >
            {/* Icon */}
            <div style={{
              width: 56, height: 56, borderRadius: '14px',
              background: 'rgba(239,68,68,0.12)',
              border: '1px solid rgba(239,68,68,0.25)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              marginBottom: '20px'
            }}>
              <AlertTriangle size={26} style={{ color: 'var(--danger)' }} />
            </div>

            <h3 style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--text)', marginBottom: '10px' }}>
              Revogar Token Atual?
            </h3>
            <p style={{ fontSize: '0.85rem', color: 'var(--muted)', lineHeight: 1.7, marginBottom: '24px' }}>
              O token atual será <strong style={{ color: 'var(--danger)' }}>invalidado instantaneamente</strong>.
              Todos os sistemas externos que o utilizam vão parar de funcionar até você atualizar o novo token neles.
              <br /><br />
              Esta ação <strong>não pode ser desfeita</strong>.
            </p>

            <div style={{ display: 'flex', gap: '10px' }}>
              <button
                onClick={handleRegenerate}
                disabled={isRegenerating}
                style={{
                  flex: 1,
                  background: 'var(--danger)',
                  color: '#fff',
                  border: 'none',
                  borderRadius: '10px',
                  padding: '11px 20px',
                  fontSize: '0.88rem',
                  fontWeight: 700,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px',
                  cursor: isRegenerating ? 'not-allowed' : 'pointer',
                  opacity: isRegenerating ? 0.7 : 1,
                  transition: 'all 0.2s'
                }}
              >
                <RefreshCw size={15} style={{ animation: isRegenerating ? 'spin 1s linear infinite' : 'none' }} />
                {isRegenerating ? 'Revogando...' : 'Sim, Revogar'}
              </button>
              <button
                onClick={() => setShowModal(false)}
                disabled={isRegenerating}
                style={{
                  flex: 1,
                  background: 'var(--bg-elevated)',
                  color: 'var(--text)',
                  border: '1px solid var(--border)',
                  borderRadius: '10px',
                  padding: '11px 20px',
                  fontSize: '0.88rem',
                  fontWeight: 600,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px',
                  cursor: 'pointer',
                  transition: 'all 0.2s'
                }}
              >
                <X size={15} />
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Page Content ─────────────────────────────────────────────────── */}
      <div className="space-y-8 pb-20">

        {/* Page Header */}
        <div className="page-header">
          <div>
            <h1 className="page-header-title">Token de API</h1>
            <p className="page-header-sub">
              Autentique integrações externas com o workspace <strong>{workspace?.name}</strong>.
            </p>
          </div>
          <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
            {/* Docs link button */}
            <a
              href="http://localhost:8000/public/docs"
              target="_blank"
              rel="noopener noreferrer"
              className="btn"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '7px',
                padding: '9px 16px',
                background: 'var(--bg-elevated)',
                border: '1px solid var(--border)',
                borderRadius: '10px',
                color: 'var(--text)',
                fontSize: '0.82rem',
                fontWeight: 600,
                textDecoration: 'none',
                height: 'auto',
                minWidth: 'auto',
                transition: 'all 0.2s'
              }}
            >
              <ExternalLink size={14} style={{ color: 'var(--primary)' }} />
              Documentação da API
            </a>
            <div className="badge badge-primary" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <div style={{ width: 6, height: 6, borderRadius: '50%', backgroundColor: 'var(--success)', boxShadow: '0 0 6px var(--success)' }} />
              Token Ativo
            </div>
          </div>
        </div>

        {/* Main Token Card */}
        <div className="card premium-card-gradient">
          <div className="card-header">
            <div className="card-title flex items-center gap-2">
              <Key size={17} className="text-accent" />
              API Token do Workspace
            </div>
            <div className="badge badge-muted text-[10px]">SOMENTE LEITURA</div>
          </div>

          <div className="card-body" style={{ padding: '24px' }}>
            {/* Token Display */}
            <div style={{
              background: 'var(--bg-base)',
              border: '1px solid var(--border)',
              borderRadius: '12px',
              overflow: 'hidden'
            }}>
              {/* Terminal-style header bar */}
              <div style={{
                padding: '10px 16px',
                borderBottom: '1px solid var(--border)',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                background: 'var(--bg-elevated)'
              }}>
                <Terminal size={13} style={{ color: 'var(--muted)' }} />
                <span style={{ fontSize: '0.7rem', color: 'var(--muted)', fontFamily: 'monospace', letterSpacing: '0.05em' }}>
                  X-API-Key
                </span>
                <div style={{ marginLeft: 'auto', display: 'flex', gap: '6px' }}>
                  <div style={{ width: 10, height: 10, borderRadius: '50%', background: '#ff5f57' }} />
                  <div style={{ width: 10, height: 10, borderRadius: '50%', background: '#febc2e' }} />
                  <div style={{ width: 10, height: 10, borderRadius: '50%', background: '#28c840' }} />
                </div>
              </div>

              {/* Token value row */}
              <div style={{ padding: '16px', display: 'flex', alignItems: 'center', gap: '12px' }}>
                <code style={{
                  flex: 1,
                  fontFamily: 'monospace',
                  fontSize: '0.85rem',
                  letterSpacing: '0.05em',
                  color: revealed ? 'var(--primary)' : 'var(--text)',
                  wordBreak: 'break-all',
                  lineHeight: 1.6,
                  transition: 'color 0.2s'
                }}>
                  {revealed ? token : maskedToken}
                </code>

                <div style={{ display: 'flex', gap: '8px', flexShrink: 0 }}>
                  <button
                    onClick={() => setRevealed(r => !r)}
                    title={revealed ? 'Ocultar token' : 'Revelar token'}
                    style={{
                      padding: '8px',
                      background: 'var(--bg-elevated)',
                      border: '1px solid var(--border)',
                      borderRadius: '8px',
                      color: 'var(--muted)',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      transition: 'all 0.2s'
                    }}
                  >
                    {revealed ? <EyeOff size={15} /> : <Eye size={15} />}
                  </button>

                  <button
                    onClick={handleCopy}
                    disabled={!token}
                    style={{
                      padding: '8px 14px',
                      background: copied ? 'var(--success-dim)' : 'var(--bg-elevated)',
                      border: `1px solid ${copied ? 'var(--success)' : 'var(--border)'}`,
                      borderRadius: '8px',
                      color: copied ? 'var(--success)' : 'var(--text)',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px',
                      fontSize: '0.8rem',
                      fontWeight: 600,
                      cursor: 'pointer',
                      transition: 'all 0.2s'
                    }}
                  >
                    {copied ? <CheckCircle size={14} /> : <Copy size={14} />}
                    {copied ? 'Copiado!' : 'Copiar'}
                  </button>
                </div>
              </div>
            </div>

            {/* Info hint */}
            <div style={{
              marginTop: '16px',
              padding: '12px 16px',
              background: 'rgba(59,130,246,0.06)',
              border: '1px solid rgba(59,130,246,0.18)',
              borderRadius: '10px',
              display: 'flex',
              alignItems: 'flex-start',
              gap: '10px'
            }}>
              <Info size={15} style={{ color: 'var(--info)', marginTop: '1px', flexShrink: 0 }} />
              <p style={{ fontSize: '0.78rem', color: 'var(--muted)', lineHeight: 1.6 }}>
                Inclua este token no cabeçalho de cada requisição à API:{' '}
                <code style={{
                  background: 'var(--bg-elevated)',
                  padding: '1px 7px',
                  borderRadius: '4px',
                  color: 'var(--primary)',
                  fontSize: '0.75rem'
                }}>
                  X-API-Key: seu_token
                </code>
                . Acesse a{' '}
                <a
                  href="http://localhost:8000/public/docs"
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ color: 'var(--primary)', fontWeight: 600, textDecoration: 'underline' }}
                >
                  documentação interativa
                </a>
                {' '}para explorar todos os endpoints disponíveis.
              </p>
            </div>
          </div>
        </div>

        {/* Info Cards Grid */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: '16px' }}>
          {[
            {
              icon: Shield,
              color: 'var(--primary)',
              colorDim: 'var(--primary-dim, rgba(99,102,241,0.1))',
              title: 'Autenticação',
              desc: 'Substitui o login do usuário para acesso programático a partir de servidores externos.'
            },
            {
              icon: Globe,
              color: 'var(--success)',
              colorDim: 'var(--success-dim)',
              title: 'Integrações',
              desc: 'Conecte webhooks, CRMs, plataformas de atendimento e automações ao seu workspace.'
            },
            {
              icon: Zap,
              color: 'var(--warning)',
              colorDim: 'var(--warning-dim)',
              title: 'Escopo Total',
              desc: 'O token concede acesso completo ao workspace. Mantenha-o seguro como uma senha.'
            },
            {
              icon: Lock,
              color: 'var(--danger)',
              colorDim: 'rgba(239,68,68,0.08)',
              title: 'Sigilo Obrigatório',
              desc: 'Nunca exponha o token em código frontend, repositórios públicos ou logs de aplicação.'
            }
          ].map(({ icon: Icon, color, colorDim, title, desc }) => (
            <div key={title} className="card" style={{ padding: 0 }}>
              <div style={{ padding: '20px' }}>
                <div style={{
                  width: 40, height: 40, borderRadius: '10px',
                  background: colorDim,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  marginBottom: '14px'
                }}>
                  <Icon size={20} style={{ color }} />
                </div>
                <h4 style={{ fontWeight: 700, fontSize: '0.88rem', marginBottom: '6px', color: 'var(--text)' }}>{title}</h4>
                <p style={{ fontSize: '0.76rem', color: 'var(--muted)', lineHeight: 1.6 }}>{desc}</p>
              </div>
            </div>
          ))}
        </div>

        {/* Danger Zone */}
        <div className="card" style={{ border: '1px solid rgba(239,68,68,0.3)' }}>
          <div className="card-header" style={{ borderBottomColor: 'rgba(239,68,68,0.2)' }}>
            <div className="card-title flex items-center gap-2" style={{ color: 'var(--danger)' }}>
              <AlertTriangle size={17} />
              Zona de Perigo
            </div>
          </div>
          <div className="card-body" style={{ padding: '24px' }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '24px', flexWrap: 'wrap' }}>
              <div style={{ flex: 1, minWidth: '240px' }}>
                <h4 style={{ fontWeight: 700, fontSize: '0.9rem', marginBottom: '8px', color: 'var(--text)' }}>
                  Revogar e Gerar Novo Token
                </h4>
                <p style={{ fontSize: '0.8rem', color: 'var(--muted)', lineHeight: 1.7 }}>
                  Se o seu token foi comprometido ou exposto, revogue-o imediatamente. O token atual será{' '}
                  <strong style={{ color: 'var(--danger)' }}>invalidado instantaneamente</strong> e
                  todas as integrações que o utilizam pararão de funcionar até serem atualizadas.
                </p>
              </div>
              <button
                onClick={() => setShowModal(true)}
                style={{
                  background: 'rgba(239,68,68,0.08)',
                  border: '1px solid rgba(239,68,68,0.4)',
                  color: 'var(--danger)',
                  padding: '10px 20px',
                  borderRadius: '10px',
                  fontWeight: 600,
                  fontSize: '0.85rem',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  whiteSpace: 'nowrap',
                  flexShrink: 0,
                  cursor: 'pointer',
                  transition: 'all 0.2s'
                }}
              >
                <RefreshCw size={15} />
                Revogar Token
              </button>
            </div>
          </div>
        </div>

      </div>
    </>
  )
}
