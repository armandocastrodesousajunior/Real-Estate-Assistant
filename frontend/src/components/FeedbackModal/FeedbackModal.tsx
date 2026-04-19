import { useState } from 'react'
import { ThumbsDown, X, Send } from 'lucide-react'

interface FeedbackModalProps {
  isOpen: boolean
  onClose: () => void
  onSubmit: (correction: string) => void
  aiResponse: string
  agentName?: string
  isLoading?: boolean
}

export default function FeedbackModal({
  isOpen,
  onClose,
  onSubmit,
  aiResponse,
  agentName,
  isLoading,
}: FeedbackModalProps) {
  const [correction, setCorrection] = useState('')

  if (!isOpen) return null

  const handleSubmit = () => {
    if (correction.trim().length < 5) return
    onSubmit(correction.trim())
    setCorrection('')
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') onClose()
  }

  return (
    <div
      className="modal-overlay"
      onClick={onClose}
      onKeyDown={handleKeyDown}
    >
      <div
        className="modal-content"
        style={{
          maxWidth: '540px',
          width: '100%',
          background: 'rgba(17, 30, 53, 0.97)',
          backdropFilter: 'blur(20px)',
          border: '1px solid rgba(239,68,68,0.25)',
          boxShadow: '0 25px 60px rgba(0,0,0,0.6), 0 0 0 1px rgba(239,68,68,0.1)',
          borderRadius: '18px',
          padding: '28px',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div style={{
              width: '40px', height: '40px', borderRadius: '10px',
              background: 'var(--error-dim)', border: '1px solid rgba(239,68,68,0.3)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: 'var(--error)',
            }}>
              <ThumbsDown size={18} />
            </div>
            <div>
              <div style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: '1rem', color: 'var(--text-primary)' }}>
                Melhorar Resposta
              </div>
              <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', marginTop: '2px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                {agentName ? `Agente: ${agentName}` : 'Feedback de Treinamento'}
              </div>
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              width: '30px', height: '30px', borderRadius: '8px',
              background: 'transparent', border: '1px solid var(--border)',
              color: 'var(--text-muted)', cursor: 'pointer', display: 'flex',
              alignItems: 'center', justifyContent: 'center', transition: 'var(--transition)',
            }}
            onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = 'var(--bg-elevated)'}
            onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = 'transparent'}
          >
            <X size={15} />
          </button>
        </div>

        {/* Preview da resposta ruim */}
        <div style={{
          background: 'rgba(239,68,68,0.05)',
          border: '1px solid rgba(239,68,68,0.15)',
          borderRadius: '10px',
          padding: '12px 14px',
          marginBottom: '18px',
        }}>
          <div style={{ fontSize: '0.65rem', fontWeight: 700, color: 'var(--error)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: '6px' }}>
            Resposta Avaliada Negativamente
          </div>
          <div style={{
            fontSize: '0.8rem', color: 'var(--text-secondary)', lineHeight: 1.6,
            maxHeight: '80px', overflowY: 'auto',
          }}>
            {aiResponse.length > 200 ? aiResponse.slice(0, 200) + '...' : aiResponse}
          </div>
        </div>

        {/* Campo de correção */}
        <div style={{ marginBottom: '18px' }}>
          <label style={{
            display: 'block', fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-secondary)',
            marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.05em',
          }}>
            Como o agente deveria ter respondido? *
          </label>
          <textarea
            autoFocus
            value={correction}
            onChange={e => setCorrection(e.target.value)}
            placeholder="Ex: O agente deveria ter chamado a ferramenta 'listar_imoveis' antes de responder, e apresentado pelo menos 3 opções com preços e localizações reais..."
            rows={4}
            style={{
              width: '100%', background: 'var(--bg-input)', border: '1px solid var(--border)',
              borderRadius: '10px', color: 'var(--text-primary)', fontSize: '0.875rem',
              padding: '12px 14px', outline: 'none', resize: 'vertical',
              fontFamily: 'var(--font-body)', lineHeight: 1.6, transition: 'var(--transition)',
              boxSizing: 'border-box',
            }}
            onFocus={e => (e.target.style.borderColor = 'var(--error)')}
            onBlur={e => (e.target.style.borderColor = 'var(--border)')}
          />
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '6px' }}>
            <div style={{ fontSize: '0.68rem', color: correction.trim().length < 5 ? 'var(--error)' : 'var(--text-muted)' }}>
              {correction.trim().length < 5 ? 'Mínimo 5 caracteres' : `${correction.length} caracteres`}
            </div>
            <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>
              Este feedback será usado para treinar o agente
            </div>
          </div>
        </div>

        {/* Botões */}
        <div style={{ display: 'flex', gap: '10px' }}>
          <button
            onClick={onClose}
            style={{
              flex: 1, padding: '10px', borderRadius: '10px',
              background: 'transparent', border: '1px solid var(--border)',
              color: 'var(--text-secondary)', cursor: 'pointer', fontSize: '0.875rem',
              fontWeight: 600, fontFamily: 'var(--font-body)', transition: 'var(--transition)',
            }}
            onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = 'var(--bg-elevated)'}
            onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = 'transparent'}
          >
            Cancelar
          </button>
          <button
            onClick={handleSubmit}
            disabled={isLoading || correction.trim().length < 5}
            style={{
              flex: 1, padding: '10px', borderRadius: '10px',
              background: correction.trim().length < 5 ? 'var(--bg-elevated)' : 'var(--error)',
              border: 'none', color: correction.trim().length < 5 ? 'var(--text-muted)' : '#fff',
              cursor: correction.trim().length < 5 ? 'not-allowed' : 'pointer',
              fontSize: '0.875rem', fontWeight: 700, fontFamily: 'var(--font-body)',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
              transition: 'var(--transition)',
            }}
          >
            {isLoading ? (
              <div className="spinner" style={{ borderTopColor: '#fff' }} />
            ) : (
              <><Send size={15} /> Salvar Feedback</>
            )}
          </button>
        </div>
      </div>
    </div>
  )
}
