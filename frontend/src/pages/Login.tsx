import { useState } from 'react'
import { authAPI } from '../services/api'
import { Home, Mail, Lock, Eye, EyeOff } from 'lucide-react'

interface Props { onLogin: () => void }

export default function Login({ onLogin }: Props) {
  const [email, setEmail] = useState('admin@realestateassistant.com')
  const [password, setPassword] = useState('rea2024')
  const [showPassword, setShowPassword] = useState(false)
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
      setError('Email ou senha inválidos. Verifique suas credenciais.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="login-page">
      <div className="login-card">
        <div className="login-logo">
          <div className="icon">
            <Home size={26} strokeWidth={2.5} color="#fff" />
          </div>
          <div>
            <div className="logo-text" style={{ fontSize: '1.6rem', textAlign: 'center' }}>
              Realty<span>AI</span>
            </div>
            <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', textAlign: 'center', letterSpacing: '0.12em', textTransform: 'uppercase', marginTop: '2px' }}>
              Real Estate Assistant
            </div>
          </div>
        </div>

        <div className="login-title">Bem-vindo de volta</div>
        <div className="login-subtitle">Entre com suas credenciais para acessar o painel de controle.</div>

        {error && <div className="login-error">⚠️ {error}</div>}

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <div className="form-group">
            <label className="form-label">Email</label>
            <div style={{ position: 'relative' }}>
              <Mail size={15} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)', pointerEvents: 'none' }} />
              <input
                id="login-email"
                type="email"
                className="form-input"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="seu@email.com"
                required
                style={{ paddingLeft: '36px' }}
              />
            </div>
          </div>

          <div className="form-group">
            <label className="form-label">Senha</label>
            <div style={{ position: 'relative' }}>
              <Lock size={15} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)', pointerEvents: 'none' }} />
              <input
                id="login-password"
                type={showPassword ? 'text' : 'password'}
                className="form-input"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                required
                style={{ paddingLeft: '36px', paddingRight: '40px' }}
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: 0, display: 'flex' }}
              >
                {showPassword ? <EyeOff size={15} /> : <Eye size={15} />}
              </button>
            </div>
          </div>

          <button
            id="login-submit"
            type="submit"
            className="btn btn-primary"
            disabled={loading}
            style={{ width: '100%', justifyContent: 'center', marginTop: '6px', padding: '13px' }}
          >
            {loading ? <div className="spinner" /> : 'Entrar no Sistema'}
          </button>
        </form>

        <div className="login-hint-box" style={{ marginTop: '24px' }}>
          <div style={{ fontSize: '0.68rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-muted)', marginBottom: '8px' }}>
            🔑 Credenciais de Demo
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            <div style={{ fontSize: '0.78rem', fontFamily: 'var(--font-mono)', color: 'var(--text-secondary)' }}>admin@realestateassistant.com</div>
            <div style={{ fontSize: '0.78rem', fontFamily: 'var(--font-mono)', color: 'var(--text-secondary)' }}>rea2024</div>
          </div>
        </div>
      </div>
    </div>
  )
}
