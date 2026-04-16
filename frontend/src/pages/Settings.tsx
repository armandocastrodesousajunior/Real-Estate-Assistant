import { useState, useEffect } from 'react'
import { usersAPI } from '../services/api'
import { Save, User, Key, CheckCircle } from 'lucide-react'

export default function Settings() {
  const [profile, setProfile] = useState({ full_name: '', email: '', openrouter_key: '' })
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [success, setSuccess] = useState(false)

  useEffect(() => {
    loadProfile()
  }, [])

  const loadProfile = async () => {
    try {
      const { data } = await usersAPI.me()
      setProfile({
        full_name: data.full_name,
        email: data.email,
        openrouter_key: data.openrouter_key || ''
      })
    } catch (err) {
      console.error('Failed to load profile', err)
    } finally {
      setLoading(false)
    }
  }

  const handleUpdateProfile = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    setSuccess(false)
    try {
      await usersAPI.updateProfile({
        full_name: profile.full_name,
        openrouter_key: profile.openrouter_key
      })
      setSuccess(true)
      setTimeout(() => setSuccess(false), 3000)
    } catch (err) {
      console.error('Failed to update profile', err)
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <div className="loading-center"><div className="spinner spinner-lg"></div></div>

  return (
    <>
      <div className="page-header">
        <div>
          <h1 className="page-header-title">Configurações do Perfil</h1>
          <p className="page-header-sub">Gerencie suas informações pessoais e chaves de API.</p>
        </div>
      </div>

      <div className="card" style={{ maxWidth: '600px' }}>
        <div className="card-header">
          <div className="card-title">Seu Perfil</div>
        </div>
        <div className="card-body" style={{ padding: '32px' }}>
          <form onSubmit={handleUpdateProfile} className="space-y-6">
            <div className="form-group">
              <label className="form-label">Nome Completo</label>
              <div style={{ position: 'relative' }}>
                <User size={16} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                <input
                  className="form-input"
                  value={profile.full_name}
                  onChange={(e) => setProfile({ ...profile, full_name: e.target.value })}
                  style={{ paddingLeft: '38px' }}
                />
              </div>
            </div>

            <div className="form-group">
              <label className="form-label">Email (Não editável)</label>
              <input
                className="form-input opacity-50"
                value={profile.email}
                disabled
              />
            </div>

            <div className="form-group">
              <label className="form-label">API Key OpenRouter (Privada)</label>
              <div style={{ position: 'relative' }}>
                <Key size={16} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                <input
                  type="password"
                  className="form-input"
                  value={profile.openrouter_key}
                  onChange={(e) => setProfile({ ...profile, openrouter_key: e.target.value })}
                  placeholder="sk-or-v1-..."
                  style={{ paddingLeft: '38px' }}
                />
              </div>
              <p className="text-xs text-muted mt-2">
                Sua chave é usada para realizar chamadas aos modelos de IA em seu nome.
              </p>
            </div>

            <div className="form-actions border-top pt-6" style={{ marginTop: '32px' }}>
              {success && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--success)', fontSize: '0.85rem', marginRight: 'auto' }}>
                  <CheckCircle size={16} /> Salvo com sucesso!
                </div>
              )}
              <button type="submit" className="btn btn-primary" disabled={saving}>
                {saving ? <div className="spinner" /> : <><Save size={16} /> Salvar Alterações</>}
              </button>
            </div>
          </form>
        </div>
      </div>
    </>
  )
}
