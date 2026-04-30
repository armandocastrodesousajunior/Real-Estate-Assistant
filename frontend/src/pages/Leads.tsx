import { useEffect, useState } from 'react'
import { Search, Plus, Edit, Trash2, Users } from 'lucide-react'
import { leadsAPI } from '../services/api'

const STATUS_OPTIONS = [
  { value: 'new', label: 'Novo', badge: 'badge-info' },
  { value: 'contacted', label: 'Contatado', badge: 'badge-muted' },
  { value: 'qualified', label: 'Qualificado', badge: 'badge-success' },
  { value: 'proposal', label: 'Proposta', badge: 'badge-warning' },
  { value: 'negotiating', label: 'Negociando', badge: 'badge-primary' },
  { value: 'closed', label: 'Fechado ✓', badge: 'badge-success' },
  { value: 'lost', label: 'Perdido', badge: 'badge-error' },
]

const SOURCE_LABEL: Record<string, string> = {
  website: 'Website', chat_ia: '🤖 Chat IA', whatsapp: 'WhatsApp',
  telefone: 'Telefone', indicacao: 'Indicação', portal_imovel: 'Portal',
  redes_sociais: 'Redes Sociais', outro: 'Outro',
}

const EMPTY_FORM = {
  full_name: '', email: '', phone: '', country: '', state: '', city: '', document: '',
  status: 'new', source: 'chat_ia', notes: ''
}

export default function Leads() {
  const [leads, setLeads] = useState<any[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [editingLead, setEditingLead] = useState<any>(null)
  const [form, setForm] = useState(EMPTY_FORM)
  const [saving, setSaving] = useState(false)

  useEffect(() => { load() }, [statusFilter])
  useEffect(() => { const t = setTimeout(load, 400); return () => clearTimeout(t) }, [search])

  const load = async () => {
    setLoading(true)
    try {
      const { data } = await leadsAPI.list({ q: search || undefined, status: statusFilter || undefined })
      setLeads(data.items)
      setTotal(data.total)
    } finally { setLoading(false) }
  }

  const openNew = () => { setEditingLead(null); setForm(EMPTY_FORM); setShowForm(true) }
  const openEdit = (lead: any) => {
    setEditingLead(lead)
    setForm({
      full_name: lead.full_name,
      email: lead.email || '',
      phone: lead.phone || '',
      country: lead.country || '',
      state: lead.state || '',
      city: lead.city || '',
      document: lead.document || '',
      status: lead.status,
      source: lead.source,
      notes: lead.notes || '',
    })
    setShowForm(true)
  }

  const handleSave = async () => {
    setSaving(true)
    try {
      if (editingLead) await leadsAPI.update(editingLead.id, form)
      else await leadsAPI.create(form)
      setShowForm(false)
      load()
    } finally { setSaving(false) }
  }

  const handleDelete = async (id: number) => {
    if (!confirm('Remover este lead?')) return
    await leadsAPI.delete(id)
    load()
  }

  return (
    <div className="page-container">
      <div className="page-header">
        <div>
          <h1 className="page-header-title">Leads</h1>
          <p className="page-header-sub">{total} lead{total !== 1 ? 's' : ''} no sistema</p>
        </div>
        <button className="btn btn-primary" onClick={openNew}><Plus size={16} /> Novo Lead</button>
      </div>

      {/* Status Pills */}
      <div style={{ display: 'flex', gap: '6px', marginBottom: '20px', flexWrap: 'wrap' }}>
        <button
          className={`btn btn-sm ${!statusFilter ? 'btn-primary' : 'btn-ghost'}`}
          style={{ borderRadius: 'var(--radius-full)' }}
          onClick={() => setStatusFilter('')}
        >Todos ({total})</button>
        {STATUS_OPTIONS.slice(0, 5).map(s => (
          <button
            key={s.value}
            className={`btn btn-sm ${statusFilter === s.value ? 'btn-secondary' : 'btn-ghost'}`}
            style={{ borderRadius: 'var(--radius-full)', borderColor: statusFilter === s.value ? 'var(--accent)' : 'transparent', color: statusFilter === s.value ? 'var(--accent)' : 'var(--text-muted)' }}
            onClick={() => setStatusFilter(s.value)}
          >{s.label}</button>
        ))}
      </div>

      {/* Search */}
      <div className="filters-bar">
        <div className="search-input-wrapper" style={{ flex: 1 }}>
          <Search className="search-icon" size={16} />
          <input className="form-input" placeholder="Buscar por nome, email ou telefone..." value={search} onChange={e => setSearch(e.target.value)} style={{ paddingLeft: '36px' }} />
        </div>
      </div>

      {/* Table */}
      <div className="table-wrapper">
        <table>
          <thead>
            <tr>
              <th>Nome</th>
              <th>Contato</th>
              <th>Status</th>
              <th>Origem</th>
              <th>Localização</th>
              <th>Documento</th>
              <th>Ações</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={7} style={{ textAlign: 'center', padding: '48px' }}><div className="spinner" style={{ margin: '0 auto' }} /></td></tr>
            ) : leads.length === 0 ? (
              <tr><td colSpan={7}>
                <div className="empty-state">
                  <div className="empty-icon"><Users size={36} style={{ color: 'var(--text-muted)' }} /></div>
                  <h3>Nenhum lead encontrado</h3>
                  <p>Leads são criados automaticamente via chat ou manualmente</p>
                  <button className="btn btn-primary btn-sm" onClick={openNew}><Plus size={14} /> Novo Lead</button>
                </div>
              </td></tr>
            ) : leads.map(lead => (
              <tr key={lead.id}>
                <td style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{lead.full_name}</td>
                <td>
                  <div style={{ fontSize: '0.83rem' }}>{lead.email || '—'}</div>
                  <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '2px' }}>{lead.phone || ''}</div>
                </td>
                <td>
                  <select
                    className="form-select"
                    style={{ width: 'auto', fontSize: '0.78rem', padding: '4px 28px 4px 8px', minWidth: '120px' }}
                    value={lead.status}
                    onChange={async e => { await leadsAPI.update(lead.id, { status: e.target.value }); load() }}
                  >
                    {STATUS_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                </td>
                <td><span className="badge badge-muted">{SOURCE_LABEL[lead.source] || lead.source}</span></td>
                <td style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
                  {lead.city && lead.state ? `${lead.city}/${lead.state}` : lead.city || lead.state || lead.country || '—'}
                </td>
                <td style={{ fontSize: '0.85rem', fontFamily: 'var(--font-mono)', color: lead.document ? 'var(--text-primary)' : 'var(--text-muted)' }}>
                  {lead.document || '—'}
                </td>
                <td>
                  <div style={{ display: 'flex', gap: '6px' }}>
                    <button className="btn btn-secondary btn-sm" onClick={() => openEdit(lead)}><Edit size={13} /></button>
                    <button className="btn btn-danger btn-sm" onClick={() => handleDelete(lead.id)}><Trash2 size={13} /></button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Modal */}
      {showForm && (
        <div className="modal-overlay" onClick={() => setShowForm(false)}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '24px' }}>
              <div>
                <h2 style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: '1.2rem', color: 'var(--text-primary)' }}>
                  {editingLead ? 'Editar Lead' : 'Novo Lead'}
                </h2>
                <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: '3px' }}>Preencha os dados do potencial cliente</p>
              </div>
              <button className="btn btn-ghost btn-sm" onClick={() => setShowForm(false)} style={{ padding: '6px' }}>✕</button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div className="form-group">
                <label className="form-label">Nome Completo *</label>
                <input className="form-input" value={form.full_name} onChange={e => setForm(f => ({ ...f, full_name: e.target.value }))} required placeholder="Nome completo do lead" />
              </div>
              
              <div className="form-grid">
                <div className="form-group">
                  <label className="form-label">Email</label>
                  <input type="email" className="form-input" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} placeholder="email@exemplo.com" />
                </div>
                <div className="form-group">
                  <label className="form-label">Telefone / WhatsApp</label>
                  <input className="form-input" value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} placeholder="+55 11 99999-9999" />
                </div>
                <div className="form-group">
                  <label className="form-label">Documento (CPF/CNPJ)</label>
                  <input className="form-input" value={form.document} onChange={e => setForm(f => ({ ...f, document: e.target.value }))} placeholder="000.000.000-00" />
                </div>
                <div className="form-group">
                  <label className="form-label">País</label>
                  <input className="form-input" value={form.country} onChange={e => setForm(f => ({ ...f, country: e.target.value }))} placeholder="Brasil" />
                </div>
                <div className="form-group">
                  <label className="form-label">Estado (UF)</label>
                  <input className="form-input" value={form.state} onChange={e => setForm(f => ({ ...f, state: e.target.value }))} placeholder="SP" />
                </div>
                <div className="form-group">
                  <label className="form-label">Cidade</label>
                  <input className="form-input" value={form.city} onChange={e => setForm(f => ({ ...f, city: e.target.value }))} placeholder="São Paulo" />
                </div>
                <div className="form-group">
                  <label className="form-label">Status</label>
                  <select className="form-select" value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value }))}>
                    {STATUS_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">Origem</label>
                  <select className="form-select" value={form.source} onChange={e => setForm(f => ({ ...f, source: e.target.value }))}>
                    {Object.entries(SOURCE_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                  </select>
                </div>
              </div>
              
              <div className="form-group">
                <label className="form-label">Observações Livres</label>
                <textarea className="form-textarea" value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} rows={3} placeholder="Anotações, preferências ou histórico rápido..." />
              </div>
              <div style={{ display: 'flex', gap: '10px', marginTop: '8px' }}>
                <button className="btn btn-ghost" style={{ flex: 1, justifyContent: 'center' }} onClick={() => setShowForm(false)}>Cancelar</button>
                <button className="btn btn-primary" style={{ flex: 1, justifyContent: 'center' }} onClick={handleSave} disabled={saving || !form.full_name}>
                  {saving ? <div className="spinner" /> : '💾 Salvar Lead'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
