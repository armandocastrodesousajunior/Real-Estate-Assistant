import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Search, Plus, Bed, Bath, Car, MapPin, Edit, Trash2, Filter } from 'lucide-react'
import { propertiesAPI } from '../services/api'

const STATUS_BADGE: Record<string, string> = { disponivel: 'badge-success', reservado: 'badge-warning', vendido: 'badge-muted', alugado: 'badge-info', inativo: 'badge-error' }
const STATUS_LABEL: Record<string, string> = { disponivel: 'Disponível', reservado: 'Reservado', vendido: 'Vendido', alugado: 'Alugado', inativo: 'Inativo' }
const TYPE_LABEL: Record<string, string> = { apartamento: 'Apartamento', casa: 'Casa', comercial: 'Comercial', terreno: 'Terreno', rural: 'Rural', kitnet_studio: 'Kitnet/Studio' }

export default function Properties() {
  const navigate = useNavigate()
  const [properties, setProperties] = useState<any[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [typeFilter, setTypeFilter] = useState('')
  const [purposeFilter, setPurposeFilter] = useState('')

  const load = async () => {
    setLoading(true)
    try {
      const { data } = await propertiesAPI.list({ q: search || undefined, type: typeFilter || undefined, purpose: purposeFilter || undefined, page, page_size: 12 })
      setProperties(data.items)
      setTotal(data.total)
    } finally { setLoading(false) }
  }

  useEffect(() => { load() }, [page, typeFilter, purposeFilter])
  useEffect(() => { const t = setTimeout(load, 400); return () => clearTimeout(t) }, [search])

  const handleDelete = async (id: number) => {
    if (!confirm('Remover este imóvel permanentemente?')) return
    await propertiesAPI.delete(id)
    load()
  }

  const totalPages = Math.ceil(total / 12)

  return (
    <div className="page-container">
      <div className="page-header">
        <div>
          <h1 className="page-header-title">Imóveis</h1>
          <p className="page-header-sub">{total} propriedade{total !== 1 ? 's' : ''} cadastrada{total !== 1 ? 's' : ''}</p>
        </div>
        <button className="btn btn-primary" onClick={() => navigate('/properties/new')}>
          <Plus size={16} /> Novo Imóvel
        </button>
      </div>

      <div className="filters-bar">
        <div className="search-input-wrapper" style={{ flex: 1, minWidth: 200 }}>
          <Search className="search-icon" size={16} />
          <input className="form-input" placeholder="Buscar por título, bairro ou cidade..." value={search} onChange={(e) => setSearch(e.target.value)} style={{ paddingLeft: '36px' }} />
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--text-muted)' }}>
          <Filter size={14} />
        </div>
        <select className="form-select" style={{ width: 170 }} value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)}>
          <option value="">Todos os tipos</option>
          {Object.entries(TYPE_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
        <select className="form-select" style={{ width: 150 }} value={purposeFilter} onChange={(e) => setPurposeFilter(e.target.value)}>
          <option value="">Finalidade</option>
          <option value="venda">Venda</option>
          <option value="aluguel">Aluguel</option>
        </select>
      </div>

      {loading ? (
        <div className="loading-center"><div className="spinner-lg spinner" /></div>
      ) : properties.length === 0 ? (
        <div className="empty-state">
          <div className="empty-icon">🏘️</div>
          <h3>Nenhum imóvel encontrado</h3>
          <p>Cadastre seu primeiro imóvel para começar a usar o assistente de IA</p>
          <button className="btn btn-primary" onClick={() => navigate('/properties/new')}>
            <Plus size={16} /> Cadastrar Imóvel
          </button>
        </div>
      ) : (
        <>
          <div className="property-grid">
            {properties.map((p) => (
              <div key={p.id} className="property-card">
                <div className="property-card-img">
                  {p.cover_photo
                    ? <img src={`/uploads${p.cover_photo.replace('/uploads', '')}`} alt={p.title} />
                    : <div className="no-photo">🏠</div>}
                  <div className="property-badge">
                    <span className={`badge ${STATUS_BADGE[p.status] || 'badge-muted'}`}>{STATUS_LABEL[p.status] || p.status}</span>
                  </div>
                  {p.featured ? <div className="property-featured-badge">⭐ Destaque</div> : null}
                </div>
                <div className="property-card-body">
                  <div className="property-price">{p.price?.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</div>
                  <div className="property-title">{p.title}</div>
                  <div className="property-location"><MapPin size={12} />{[p.neighborhood, p.city, p.state].filter(Boolean).join(', ')}</div>
                  <div className="property-specs">
                    {p.bedrooms > 0 && <div className="property-spec"><Bed size={13} />{p.bedrooms} qto{p.bedrooms !== 1 ? 's' : ''}</div>}
                    {p.bathrooms > 0 && <div className="property-spec"><Bath size={13} />{p.bathrooms}</div>}
                    {p.parking_spaces > 0 && <div className="property-spec"><Car size={13} />{p.parking_spaces}</div>}
                    {p.area && <div className="property-spec">{p.area}m²</div>}
                  </div>
                  <div style={{ display: 'flex', gap: '8px', marginTop: '14px' }}>
                    <button className="btn btn-secondary btn-sm" style={{ flex: 1 }} onClick={() => navigate(`/properties/${p.id}/edit`)}>
                      <Edit size={13} /> Editar
                    </button>
                    <button className="btn btn-danger btn-sm" onClick={() => handleDelete(p.id)}>
                      <Trash2 size={13} />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {total > 12 && (
            <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '8px', marginTop: '28px' }}>
              <button className="btn btn-secondary btn-sm" onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}>← Anterior</button>
              <span style={{ padding: '6px 16px', background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                {page} / {totalPages}
              </span>
              <button className="btn btn-secondary btn-sm" onClick={() => setPage(p => p + 1)} disabled={page >= totalPages}>Próxima →</button>
            </div>
          )}
        </>
      )}
    </div>
  )
}
