import { useEffect, useState } from 'react'
import { Search, Plus, Edit, Trash2 } from 'lucide-react'
import { leadsAPI } from '../services/api'

const STATUS_OPTIONS = [
  { value: 'novo', label: 'Novo', badge: 'badge-info' },
  { value: 'contatado', label: 'Contatado', badge: 'badge-muted' },
  { value: 'qualificado', label: 'Qualificado', badge: 'badge-success' },
  { value: 'proposta', label: 'Proposta', badge: 'badge-warning' },
  { value: 'negociando', label: 'Negociando', badge: 'badge-info' },
  { value: 'fechado_ganho', label: 'Fechado', badge: 'badge-success' },
  { value: 'fechado_perdido', label: 'Perdido', badge: 'badge-error' },
]

const SOURCE_LABEL: Record<string, string> = {
  website: 'Website', chat_ia: 'Chat IA', whatsapp: 'WhatsApp',
  telefone: 'Telefone', indicacao: 'Indicação', portal_imovel: 'Portal',
  redes_sociais: 'Redes Sociais', outro: 'Outro',
}

export default function Leads() {
  const [leads, setLeads] = useState<any[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [editingLead, setEditingLead] = useState<any>(null)
  const [form, setForm] = useState({ name: '', email: '', phone: '', status: 'novo', source: 'chat_ia', notes: '', desired_city: '', max_price: '' })
  const [saving, setSaving] = useState(false)

  useEffect(() => { load() }, [statusFilter])
  useEffect(() => { const t = setTimeout(load, 400); return () => clearTimeout(t) }, [search])

  const load = async () => {
    setLoading(true)
    const { data } = await leadsAPI.list({ q: search || undefined, status: statusFilter || undefined })
    setLeads(data.items)
    setTotal(data.total)
    setLoading(false)
  }

  const openNew = () => { setEditingLead(null); setForm({ name: '', email: '', phone: '', status: 'novo', source: 'chat_ia', notes: '', desired_city: '', max_price: '' }); setShowForm(true) }
  const openEdit = (lead: any) => { setEditingLead(lead); setForm({ name: lead.name, email: lead.email || '', phone: lead.phone || '', status: lead.status, source: lead.source, notes: lead.notes || '', desired_city: lead.desired_city || '', max_price: lead.max_price || '' }); setShowForm(true) }

  const handleSave = async () => {
    setSaving(true)
    if (editingLead) await leadsAPI.update(editingLead.id, form)
    else await leadsAPI.create(form)
    setShowForm(false)
    load()
    setSaving(false)
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
          <p className="page-header-sub">{total} leads no sistema</p>
        </div>
        <button className="btn btn-primary" onClick={openNew}><Plus size={16} /> Novo Lead</button>
      </div>

      {/* Funil rápido */}
      <div style={{ display: 'flex', gap: '8px', marginBottom: '20px', flexWrap: 'wrap' }}>
        <button className={`btn btn-sm ${!statusFilter ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setStatusFilter('')}>Todos ({total})</button>
        {STATUS_OPTIONS.slice(0, 5).map(s => (
          <button key={s.value} className={`btn btn-sm ${statusFilter === s.value ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setStatusFilter(s.value)}>{s.label}</button>
        ))}
      </div>

      {/* Filters */}
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
              <th>Nome</th><th>Contato</th><th>Status</th><th>Origem</th><th>Cidade</th><th>Orçamento</th><th>Ações</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={7} style={{ textAlign: 'center', padding: '40px' }}><div className="spinner" style={{ margin: '0 auto' }} /></td></tr>
            ) : leads.length === 0 ? (
              <tr><td colSpan={7}>
                <div className="empty-state">
                  <div className="empty-icon">👤</div>
                  <h3>Nenhum lead encontrado</h3>
                  <p>Leads são criados automaticamente pelo chat</p>
                </div>
              </td></tr>
            ) : leads.map((lead) => {
              return (
                <tr key={lead.id}>
                  <td><div style={{ fontWeight: 600 }}>{lead.name}</div></td>
                  <td>
                    <div className="text-sm">{lead.email || '—'}</div>
                    <div className="text-xs text-muted">{lead.phone || ''}</div>
                  </td>
                  <td>
                    <select className="form-select" style={{ width: 'auto', fontSize: '0.78rem', padding: '4px 8px' }} value={lead.status}
                      onChange={async e => { await leadsAPI.update(lead.id, { status: e.target.value }); load() }}>
                      {STATUS_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                    </select>
                  </td>
                  <td><span className="badge badge-muted">{SOURCE_LABEL[lead.source] || lead.source}</span></td>
                  <td className="text-sm">{lead.desired_city || '—'}</td>
                  <td className="text-sm">
                    {lead.max_price ? `R$ ${Number(lead.max_price).toLocaleString('pt-BR')}` : '—'}
                  </td>
                  <td>
                    <div className="flex gap-2">
                      <button className="btn btn-secondary btn-sm" onClick={() => openEdit(lead)}><Edit size={13} /></button>
                      <button className="btn btn-danger btn-sm" onClick={() => handleDelete(lead.id)}><Trash2 size={13} /></button>
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* Modal form */}
      {showForm && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '20px' }}>
          <div className="card" style={{ width: '100%', maxWidth: '500px' }}>
            <div className="card-header">
              <span className="card-title">{editingLead ? 'Editar Lead' : 'Novo Lead'}</span>
              <button className="btn btn-ghost btn-sm" onClick={() => setShowForm(false)}>✕</button>
            </div>
            <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div className="form-group">
                <label className="form-label">Nome *</label>
                <input className="form-input" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} required />
              </div>
              <div className="form-grid">
                <div className="form-group">
                  <label className="form-label">Email</label>
                  <input type="email" className="form-input" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} />
                </div>
                <div className="form-group">
                  <label className="form-label">Telefone</label>
                  <input className="form-input" value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} />
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
              <div className="form-grid">
                <div className="form-group">
                  <label className="form-label">Cidade desejada</label>
                  <input className="form-input" value={form.desired_city} onChange={e => setForm(f => ({ ...f, desired_city: e.target.value }))} placeholder="São Paulo" />
                </div>
                <div className="form-group">
                  <label className="form-label">Orçamento máximo</label>
                  <input type="number" className="form-input" value={form.max_price} onChange={e => setForm(f => ({ ...f, max_price: e.target.value }))} />
                </div>
              </div>
              <div className="form-group">
                <label className="form-label">Observações</label>
                <textarea className="form-textarea" value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} rows={3} />
              </div>
              <div className="form-actions">
                <button className="btn btn-ghost" onClick={() => setShowForm(false)}>Cancelar</button>
                <button className="btn btn-primary" onClick={handleSave} disabled={saving || !form.name}>
                  {saving ? <div className="spinner" /> : '💾 Salvar'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
