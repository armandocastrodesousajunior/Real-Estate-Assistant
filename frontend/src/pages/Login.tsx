import { useState } from 'react'
import { authAPI } from '../services/api'
import { Home } from 'lucide-react'

interface Props { onLogin: () => void }

export default function Login({ onLogin }: Props) {
  const [email, setEmail] = useState('admin@realestateassistant.com')
  const [password, setPassword] = useState('rea2024')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')
    try {
      const { data } = await authAPI.login(email, password)
      localStorage.setItem('rea_token', data.access_token)
      onLogin()
    } catch {
      setError('Email ou senha inválidos.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="login-page">
      <div className="login-card">
        <div className="login-logo">
          <div className="icon">
            <Home size={24} strokeWidth={2.5} color="#000" />
          </div>
          <div className="logo-text" style={{ fontSize: '1.5rem' }}>Real<span>Estate</span></div>
        </div>

        <div className="login-title">Bem-vindo de volta</div>
        <div className="login-subtitle">Entre com suas credenciais para acessar o painel</div>

        {error && <div className="login-error">{error}</div>}

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <div className="form-group">
            <label className="form-label">Email</label>
            <input
              id="login-email"
              type="email"
              className="form-input"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="seu@email.com"
              required
            />
          </div>
          <div className="form-group">
            <label className="form-label">Senha</label>
            <input
              id="login-password"
              type="password"
              className="form-input"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              required
            />
          </div>
          <button
            id="login-submit"
            type="submit"
            className="btn btn-primary"
            disabled={loading}
            style={{ width: '100%', justifyContent: 'center', marginTop: '6px', padding: '12px' }}
          >
            {loading ? <div className="spinner" /> : 'Entrar'}
          </button>
        </form>

        <div style={{ marginTop: '24px', padding: '14px', background: 'var(--bg-elevated)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border)' }}>
          <div className="text-xs text-muted" style={{ marginBottom: '6px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Credenciais padrão</div>
          <div className="text-sm font-mono" style={{ color: 'var(--text-secondary)' }}>📧 admin@realestateassistant.com</div>
          <div className="text-sm font-mono" style={{ color: 'var(--text-secondary)' }}>🔑 rea2024</div>
        </div>
      </div>
    </div>
  )
}
