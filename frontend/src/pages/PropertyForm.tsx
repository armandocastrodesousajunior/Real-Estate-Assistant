import { useEffect, useState, useRef } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, Upload, X } from 'lucide-react'
import { propertiesAPI } from '../services/api'

const Field = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <div className="form-group">
    <label className="form-label">{label}</label>
    {children}
  </div>
)

export default function PropertyForm() {
  const { id } = useParams()
  const navigate = useNavigate()
  const isEdit = !!id
  const fileRef = useRef<HTMLInputElement>(null)
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [photos, setPhotos] = useState<string[]>([])
  const [form, setForm] = useState({
    title: '', type: 'apartamento', purpose: 'venda', status: 'disponivel',
    address: '', neighborhood: '', city: '', state: '', zip_code: '',
    area: '', built_area: '', bedrooms: '0', bathrooms: '0', suites: '0', parking_spaces: '0',
    floor: '', price: '', rent_price: '', condominium_fee: '0', iptu: '0',
    description: '', highlights: '', featured: false, tags: '', amenities: '',
  })

  useEffect(() => {
    if (isEdit) {
      setLoading(true)
      propertiesAPI.get(Number(id)).then(({ data }) => {
        setForm({
          title: data.title || '', type: data.type || 'apartamento', purpose: data.purpose || 'venda',
          status: data.status || 'disponivel', address: data.address || '', neighborhood: data.neighborhood || '',
          city: data.city || '', state: data.state || '', zip_code: data.zip_code || '',
          area: data.area || '', built_area: data.built_area || '', bedrooms: data.bedrooms || '0',
          bathrooms: data.bathrooms || '0', suites: data.suites || '0', parking_spaces: data.parking_spaces || '0',
          floor: data.floor || '', price: data.price || '', rent_price: data.rent_price || '',
          condominium_fee: data.condominium_fee || '0', iptu: data.iptu || '0',
          description: data.description || '', highlights: data.highlights || '',
          featured: data.featured || false, tags: (data.tags || []).join(', '),
          amenities: (data.amenities || []).join(', '),
        })
        setPhotos(data.photos || [])
      }).finally(() => setLoading(false))
    }
  }, [id])

  const set = (field: string, value: any) => setForm(f => ({ ...f, [field]: value }))

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    try {
      const payload = {
        ...form, area: form.area ? Number(form.area) : null, built_area: form.built_area ? Number(form.built_area) : null,
        bedrooms: Number(form.bedrooms), bathrooms: Number(form.bathrooms), suites: Number(form.suites),
        parking_spaces: Number(form.parking_spaces), floor: form.floor ? Number(form.floor) : null,
        price: Number(form.price), rent_price: form.rent_price ? Number(form.rent_price) : null,
        condominium_fee: Number(form.condominium_fee), iptu: Number(form.iptu), featured: form.featured ? 1 : 0,
        tags: form.tags.split(',').map(t => t.trim()).filter(Boolean),
        amenities: form.amenities.split(',').map(a => a.trim()).filter(Boolean),
      }
      if (isEdit) await propertiesAPI.update(Number(id), payload)
      else await propertiesAPI.create(payload)
      navigate('/properties')
    } finally { setSaving(false) }
  }

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || [])
    if (!files.length || !id) return
    const { data } = await propertiesAPI.uploadPhotos(Number(id), files)
    setPhotos(data.photos || [])
  }

  const handleDeletePhoto = async (idx: number) => {
    if (!id) return
    const { data } = await propertiesAPI.deletePhoto(Number(id), idx)
    setPhotos(data.photos || [])
  }

  if (loading) return <div className="loading-center"><div className="spinner-lg spinner" /></div>

  return (
    <div className="page-container">
      <div className="page-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <button className="btn btn-ghost btn-sm" onClick={() => navigate('/properties')}>
            <ArrowLeft size={16} />
          </button>
          <div>
            <h1 className="page-header-title">{isEdit ? 'Editar Imóvel' : 'Novo Imóvel'}</h1>
            <p className="page-header-sub">{isEdit ? 'Atualize os dados do imóvel' : 'Preencha os dados para cadastrar'}</p>
          </div>
        </div>
      </div>

      <form onSubmit={handleSubmit}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 340px', gap: '24px' }}>
          {/* Left column */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            <div className="card">
              <div className="card-header"><span className="card-title">📋 Informações Básicas</span></div>
              <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                <Field label="Título *">
                  <input className="form-input" value={form.title} onChange={e => set('title', e.target.value)} placeholder="Ex: Apartamento 3 quartos no Brooklin" required />
                </Field>
                <div className="form-grid">
                  <Field label="Tipo">
                    <select className="form-select" value={form.type} onChange={e => set('type', e.target.value)}>
                      <option value="apartamento">Apartamento</option>
                      <option value="casa">Casa</option>
                      <option value="comercial">Comercial</option>
                      <option value="terreno">Terreno</option>
                      <option value="rural">Rural</option>
                      <option value="kitnet_studio">Kitnet/Studio</option>
                    </select>
                  </Field>
                  <Field label="Finalidade">
                    <select className="form-select" value={form.purpose} onChange={e => set('purpose', e.target.value)}>
                      <option value="venda">Venda</option>
                      <option value="aluguel">Aluguel</option>
                      <option value="venda_aluguel">Venda e Aluguel</option>
                    </select>
                  </Field>
                  <Field label="Status">
                    <select className="form-select" value={form.status} onChange={e => set('status', e.target.value)}>
                      <option value="disponivel">Disponível</option>
                      <option value="reservado">Reservado</option>
                      <option value="vendido">Vendido</option>
                      <option value="alugado">Alugado</option>
                      <option value="inativo">Inativo</option>
                    </select>
                  </Field>
                </div>
                <Field label="Descrição">
                  <textarea className="form-textarea" value={form.description} onChange={e => set('description', e.target.value)} placeholder="Descreva o imóvel em detalhes..." style={{ minHeight: '110px' }} />
                </Field>
                <Field label="Destaques (resumo rápido)">
                  <input className="form-input" value={form.highlights} onChange={e => set('highlights', e.target.value)} placeholder="Ex: Lazer completo, próximo ao metrô, reformado" />
                </Field>
              </div>
            </div>

            <div className="card">
              <div className="card-header"><span className="card-title">📍 Endereço</span></div>
              <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                <Field label="Endereço">
                  <input className="form-input" value={form.address} onChange={e => set('address', e.target.value)} placeholder="Rua, número" />
                </Field>
                <div className="form-grid">
                  <Field label="Bairro"><input className="form-input" value={form.neighborhood} onChange={e => set('neighborhood', e.target.value)} /></Field>
                  <Field label="Cidade"><input className="form-input" value={form.city} onChange={e => set('city', e.target.value)} /></Field>
                  <Field label="UF"><input className="form-input" value={form.state} onChange={e => set('state', e.target.value)} maxLength={2} placeholder="SP" /></Field>
                  <Field label="CEP"><input className="form-input" value={form.zip_code} onChange={e => set('zip_code', e.target.value)} /></Field>
                </div>
              </div>
            </div>

            <div className="card">
              <div className="card-header"><span className="card-title">📐 Características</span></div>
              <div className="card-body">
                <div className="form-grid form-grid-3" style={{ gap: '14px' }}>
                  <Field label="Área total (m²)"><input type="number" className="form-input" value={form.area} onChange={e => set('area', e.target.value)} /></Field>
                  <Field label="Área construída (m²)"><input type="number" className="form-input" value={form.built_area} onChange={e => set('built_area', e.target.value)} /></Field>
                  <Field label="Quartos"><input type="number" className="form-input" value={form.bedrooms} onChange={e => set('bedrooms', e.target.value)} min="0" /></Field>
                  <Field label="Banheiros"><input type="number" className="form-input" value={form.bathrooms} onChange={e => set('bathrooms', e.target.value)} min="0" /></Field>
                  <Field label="Suítes"><input type="number" className="form-input" value={form.suites} onChange={e => set('suites', e.target.value)} min="0" /></Field>
                  <Field label="Vagas"><input type="number" className="form-input" value={form.parking_spaces} onChange={e => set('parking_spaces', e.target.value)} min="0" /></Field>
                  <Field label="Andar"><input type="number" className="form-input" value={form.floor} onChange={e => set('floor', e.target.value)} /></Field>
                </div>
                <div style={{ marginTop: '14px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
                  <Field label="Tags (separadas por vírgula)">
                    <input className="form-input" value={form.tags} onChange={e => set('tags', e.target.value)} placeholder="piscina, churrasqueira, academia" />
                  </Field>
                  <Field label="Amenidades do condomínio">
                    <input className="form-input" value={form.amenities} onChange={e => set('amenities', e.target.value)} placeholder="salão de festas, quadra, playground" />
                  </Field>
                </div>
              </div>
            </div>
          </div>

          {/* Right column */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            <div className="card">
              <div className="card-header"><span className="card-title">💰 Valores</span></div>
              <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                <Field label="Preço de venda (R$) *">
                  <input type="number" className="form-input" value={form.price} onChange={e => set('price', e.target.value)} placeholder="0.00" step="0.01" required />
                </Field>
                <Field label="Aluguel mensal (R$)">
                  <input type="number" className="form-input" value={form.rent_price} onChange={e => set('rent_price', e.target.value)} placeholder="0.00" step="0.01" />
                </Field>
                <Field label="Condomínio (R$/mês)">
                  <input type="number" className="form-input" value={form.condominium_fee} onChange={e => set('condominium_fee', e.target.value)} step="0.01" />
                </Field>
                <Field label="IPTU (R$/ano)">
                  <input type="number" className="form-input" value={form.iptu} onChange={e => set('iptu', e.target.value)} step="0.01" />
                </Field>
              </div>
            </div>

            <div className="card">
              <div className="card-body">
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: '0.9rem', color: 'var(--text-primary)' }}>⭐ Imóvel em Destaque</div>
                    <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: '3px' }}>Exibido em posição privilegiada</div>
                  </div>
                  <label className="toggle">
                    <input type="checkbox" checked={form.featured as boolean} onChange={e => set('featured', e.target.checked)} />
                    <div className="toggle-track" />
                    <div className="toggle-thumb" />
                  </label>
                </div>
              </div>
            </div>

            {isEdit && (
              <div className="card">
                <div className="card-header">
                  <span className="card-title">📷 Fotos</span>
                  <button type="button" className="btn btn-secondary btn-sm" onClick={() => fileRef.current?.click()}>
                    <Upload size={14} /> Upload
                  </button>
                  <input ref={fileRef} type="file" multiple accept="image/*" style={{ display: 'none' }} onChange={handlePhotoUpload} />
                </div>
                <div className="card-body">
                  {photos.length === 0 ? (
                    <div className="empty-state" style={{ padding: '28px' }}>
                      <div style={{ fontSize: '28px' }}>📷</div>
                      <p style={{ fontSize: '0.8rem' }}>Nenhuma foto ainda</p>
                    </div>
                  ) : (
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,1fr)', gap: '8px' }}>
                      {photos.map((photo, idx) => (
                        <div key={idx} style={{ position: 'relative', borderRadius: 'var(--radius-md)', overflow: 'hidden', aspectRatio: '4/3' }}>
                          <img src={`/uploads${photo.replace('/uploads', '')}`} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                          {idx === 0 && <div style={{ position: 'absolute', top: 4, left: 4, background: 'var(--accent)', borderRadius: 3, padding: '2px 6px', fontSize: '0.62rem', fontWeight: 800, color: '#fff' }}>CAPA</div>}
                          <button type="button" onClick={() => handleDeletePhoto(idx)} style={{ position: 'absolute', top: 4, right: 4, width: 22, height: 22, background: 'rgba(0,0,0,0.7)', border: 'none', borderRadius: '50%', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white' }}>
                            <X size={12} />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}
            {!isEdit && (
              <div className="card">
                <div className="card-body" style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.82rem', padding: '20px' }}>
                  💡 Salve o imóvel primeiro para fazer upload de fotos
                </div>
              </div>
            )}

            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <button type="submit" className="btn btn-primary" disabled={saving} style={{ width: '100%', justifyContent: 'center', padding: '13px' }}>
                {saving ? <div className="spinner" /> : (isEdit ? '💾 Salvar Alterações' : '➕ Cadastrar Imóvel')}
              </button>
              <button type="button" className="btn btn-ghost" onClick={() => navigate('/properties')} style={{ width: '100%', justifyContent: 'center' }}>
                Cancelar
              </button>
            </div>
          </div>
        </div>
      </form>
    </div>
  )
}
