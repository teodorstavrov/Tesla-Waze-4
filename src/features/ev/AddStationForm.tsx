// ─── Add / Edit Station Form ────────────────────────────────────────────
//
// Opened from the map long-press ("Добави станция") or from StationPanel
// ("Редактирай") when the device owns the station.
//
// Add mode  → POST /api/ev/submit  → saves ownerToken to localStorage
// Edit mode → PUT  /api/ev/edit    → requires ownerToken from localStorage

import { useState, useSyncExternalStore } from 'react'
import { addStationStore } from './addStationStore'
import { evStore } from './evStore'
import { saveOwnerToken, removeOwnerToken } from './userStationOwner'
import { t } from '@/lib/locale'
import { isTeslaBrowser } from '@/lib/browser'

const CONNECTOR_TYPES = ['CCS', 'CHAdeMO', 'Type2', 'Type1', 'Tesla', 'Schuko'] as const
type ConnectorType = (typeof CONNECTOR_TYPES)[number]

interface ConnectorEntry { type: ConnectorType; powerKw: string; count: string }

function toEntries(raw: Array<{ type: string; powerKw: number | null; count: number }>): ConnectorEntry[] {
  return raw
    .filter((c) => (CONNECTOR_TYPES as readonly string[]).includes(c.type))
    .map((c) => ({
      type:    c.type as ConnectorType,
      powerKw: c.powerKw != null ? String(c.powerKw) : '',
      count:   String(c.count),
    }))
}

// ── Wrapper (subscribes to store) ─────────────────────────────────────

export function AddStationForm() {
  const state = useSyncExternalStore(
    addStationStore.subscribe.bind(addStationStore),
    () => addStationStore.getState(),
    () => addStationStore.getState(),
  )

  if (!state.open) return null

  return (
    <AddStationModal
      key={state.edit?.id ?? `add-${state.lat}-${state.lng}`}
      lat={state.lat}
      lng={state.lng}
      initialAddress={state.address}
      editData={state.edit}
      onClose={() => addStationStore.close()}
    />
  )
}

// ── Modal ──────────────────────────────────────────────────────────────

function AddStationModal({
  lat, lng, initialAddress, editData, onClose,
}: {
  lat:            number
  lng:            number
  initialAddress: string
  editData:       ReturnType<typeof addStationStore.getState>['edit']
  onClose:        () => void
}) {
  const isEdit = editData != null

  const [name,        setName]       = useState(editData?.name        ?? '')
  const [address,     setAddress]    = useState(editData?.address     ?? initialAddress)
  const [city,        setCity]       = useState(editData?.city        ?? '')
  const [network,     setNetwork]    = useState(editData?.network     ?? '')
  const [connectors,  setConnectors] = useState<ConnectorEntry[]>(() =>
    editData ? toEntries(editData.connectors) : [],
  )
  const [isFree,      setIsFree]     = useState<boolean | null>(editData?.isFree ?? null)
  const [pricePerKwh, setPrice]      = useState(editData?.pricePerKwh != null ? String(editData.pricePerKwh) : '')
  const [currency,    setCurrency]   = useState(editData?.priceCurrency ?? 'BGN')
  const [notes,       setNotes]      = useState(editData?.notes ?? '')
  const [submitting,  setSubmitting] = useState(false)
  const [done,        setDone]       = useState(false)
  const [error,       setError]      = useState('')
  const [deleting,    setDeleting]   = useState(false)

  function toggleConnector(type: ConnectorType) {
    setConnectors((prev) => {
      const exists = prev.find((c) => c.type === type)
      if (exists) return prev.filter((c) => c.type !== type)
      return [...prev, { type, powerKw: '', count: '1' }]
    })
  }

  function updateConnector(type: ConnectorType, field: 'powerKw' | 'count', value: string) {
    setConnectors((prev) => prev.map((c) => c.type === type ? { ...c, [field]: value } : c))
  }

  const builtConnectors = connectors.length > 0
    ? connectors.map((c) => ({
        type:    c.type,
        powerKw: c.powerKw ? parseFloat(c.powerKw) || null : null,
        count:   parseInt(c.count, 10) || 1,
      }))
    : [{ type: 'Other', powerKw: null, count: 1 }]

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim()) { setError(t('addStation.nameRequired')); return }
    setSubmitting(true); setError('')

    const payload = {
      name:          name.trim(),
      address:       address.trim() || null,
      city:          city.trim() || null,
      country:       'BG',
      network:       network.trim() || null,
      connectors:    builtConnectors,
      isFree,
      pricePerKwh:   pricePerKwh ? parseFloat(pricePerKwh) || null : null,
      priceCurrency: currency || null,
      notes:         notes.trim() || null,
    }

    try {
      if (isEdit) {
        // Edit mode — PUT with ownerToken
        const res = await fetch('/api/ev/edit', {
          method:  'PUT',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify({ id: editData!.id, ownerToken: editData!.ownerToken, ...payload }),
        })
        const data = await res.json() as { ok?: boolean; error?: string }
        if (!res.ok || !data.ok) {
          setError(data.error ?? t('addStation.submitError'))
          setSubmitting(false); return
        }
      } else {
        // Add mode — POST
        const res = await fetch('/api/ev/submit', {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify({ lat, lng, ...payload }),
        })
        const data = await res.json() as { ok?: boolean; id?: string; ownerToken?: string; error?: string }
        if (!res.ok || !data.ok) {
          setError(data.error ?? t('addStation.submitError'))
          setSubmitting(false); return
        }
        if (data.id && data.ownerToken) saveOwnerToken(data.id, data.ownerToken)
      }

      setDone(true)
      void evStore.forceRefresh()
    } catch {
      setError(t('addStation.networkError'))
      setSubmitting(false)
    }
  }

  async function handleDelete() {
    if (!editData) return
    if (!confirm(t('addStation.deleteConfirm'))) return
    setDeleting(true)
    try {
      const res = await fetch('/api/ev/edit', {
        method:  'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ id: editData.id, ownerToken: editData.ownerToken }),
      })
      if (res.ok) {
        removeOwnerToken(editData.id)
        void evStore.forceRefresh()
        onClose()
      } else {
        const data = await res.json() as { error?: string }
        setError(data.error ?? t('addStation.submitError'))
      }
    } catch {
      setError(t('addStation.networkError'))
    }
    setDeleting(false)
  }

  const overlayStyle: React.CSSProperties = {
    position: 'fixed', inset: 0, zIndex: 1200,
    background: 'rgba(0,0,0,0.72)',
    display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 12,
  }

  const cardStyle: React.CSSProperties = {
    background: '#161622', border: '1px solid rgba(255,255,255,0.1)',
    borderRadius: 16, width: '100%', maxWidth: 480,
    maxHeight: '90vh', overflowY: 'auto',
    display: 'flex', flexDirection: 'column',
  }

  if (done) {
    return (
      <div style={overlayStyle} onClick={onClose}>
        <div style={{ ...cardStyle, alignItems: 'center', padding: '40px 32px', textAlign: 'center' }}>
          <div style={{ fontSize: 52, marginBottom: 16 }}>{isEdit ? '✏️' : '✅'}</div>
          <div style={{ fontSize: 20, fontWeight: 700, marginBottom: 10 }}>
            {isEdit ? t('addStation.editSuccessTitle') : t('addStation.successTitle')}
          </div>
          <div style={{ fontSize: 14, color: 'rgba(255,255,255,0.55)', lineHeight: 1.6, marginBottom: 28 }}>
            {isEdit ? t('addStation.editSuccessBody') : t('addStation.successBody')}
          </div>
          <button onClick={onClose} style={{
            background: '#22c55e', color: '#fff', border: 'none',
            borderRadius: 10, padding: '12px 32px', fontSize: 16, fontWeight: 700, cursor: 'pointer',
          }}>OK</button>
        </div>
      </div>
    )
  }

  return (
    <div style={overlayStyle}>
      {/* eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions */}
      <div style={cardStyle} onClick={(e) => e.stopPropagation()}>

        {/* Header */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '16px 18px 12px', borderBottom: '1px solid rgba(255,255,255,0.07)', flexShrink: 0,
        }}>
          <span style={{ fontSize: 16, fontWeight: 700 }}>
            {isEdit ? `✏️ ${t('addStation.editTitle')}` : `⚡ ${t('addStation.title')}`}
          </span>
          <button onClick={onClose} style={{
            background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.14)',
            borderRadius: 7, color: 'rgba(255,255,255,0.55)',
            fontSize: 15, fontWeight: 700, padding: '4px 10px', cursor: 'pointer', touchAction: 'manipulation',
          }}>✕</button>
        </div>

        {/* Coords (add mode only) */}
        {!isEdit && (
          <div style={{ padding: '8px 18px', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
            <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)', fontFamily: 'monospace' }}>
              {lat.toFixed(6)}, {lng.toFixed(6)}
            </span>
          </div>
        )}

        {/* Form */}
        <form onSubmit={(e) => { void handleSubmit(e) }} style={{ padding: '14px 18px 18px', display: 'flex', flexDirection: 'column', gap: 14 }}>

          <Field label={`${t('addStation.name')} *`}>
            <Input value={name} onChange={setName} placeholder={t('addStation.namePlaceholder')} />
          </Field>

          <Field label={t('addStation.address')}>
            <Input value={address} onChange={setAddress} placeholder={t('addStation.addressPlaceholder')} />
          </Field>

          <div style={{ display: 'flex', gap: 10 }}>
            <Field label={t('addStation.city')} style={{ flex: 1 }}>
              <Input value={city} onChange={setCity} placeholder="София" />
            </Field>
            <Field label={t('addStation.network')} style={{ flex: 1 }}>
              <Input value={network} onChange={setNetwork} placeholder="EVN, ERG…" />
            </Field>
          </div>

          {/* Connectors */}
          <div>
            <div style={labelStyle}>{t('addStation.connectors')}</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
              {CONNECTOR_TYPES.map((type) => {
                const active = connectors.some((c) => c.type === type)
                return (
                  <button key={type} type="button" onClick={() => toggleConnector(type)} style={{
                    padding: '6px 13px', borderRadius: 8, fontSize: 13, fontWeight: active ? 700 : 400,
                    cursor: 'pointer', touchAction: 'manipulation',
                    background: active ? 'rgba(251,191,36,0.15)' : 'rgba(255,255,255,0.05)',
                    border: `1px solid ${active ? 'rgba(251,191,36,0.55)' : 'rgba(255,255,255,0.12)'}`,
                    color: active ? '#fbbf24' : 'rgba(255,255,255,0.6)',
                  }}>{type}</button>
                )
              })}
            </div>
            {connectors.map((c) => (
              <div key={c.type} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                <span style={{ fontSize: 12, color: '#fbbf24', fontWeight: 700, width: 70, flexShrink: 0 }}>{c.type}</span>
                <input type="number" min="1" max="1000" placeholder="kW" value={c.powerKw}
                  onChange={(e) => updateConnector(c.type, 'powerKw', e.target.value)}
                  style={{ ...inputStyle, width: 70, textAlign: 'right' }} />
                <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)' }}>kW</span>
                <input type="number" min="1" max="50" placeholder="бр." value={c.count}
                  onChange={(e) => updateConnector(c.type, 'count', e.target.value)}
                  style={{ ...inputStyle, width: 54, textAlign: 'right' }} />
                <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)' }}>{t('addStation.pcs')}</span>
              </div>
            ))}
          </div>

          {/* Pricing */}
          <div>
            <div style={labelStyle}>{t('addStation.pricing')}</div>
            <div style={{ display: 'flex', gap: 8 }}>
              {([null, true, false] as Array<boolean | null>).map((v) => {
                const label = v === null ? t('addStation.priceUnknown') : v ? t('addStation.free') : t('addStation.paid')
                return (
                  <button key={String(v)} type="button" onClick={() => setIsFree(v)} style={{
                    flex: 1, padding: '8px 0', borderRadius: 8, cursor: 'pointer',
                    touchAction: 'manipulation', fontSize: 12, fontWeight: 600,
                    background: isFree === v ? 'rgba(34,197,94,0.15)' : 'rgba(255,255,255,0.05)',
                    border: `1px solid ${isFree === v ? 'rgba(34,197,94,0.5)' : 'rgba(255,255,255,0.1)'}`,
                    color: isFree === v ? '#4ade80' : 'rgba(255,255,255,0.55)',
                  }}>{label}</button>
                )
              })}
            </div>
            {isFree === false && (
              <div style={{ display: 'flex', gap: 8, marginTop: 8, alignItems: 'center' }}>
                <Input value={pricePerKwh} onChange={setPrice} placeholder="0.35" type="number" style={{ width: 80 }} />
                <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)' }}>/kWh</span>
                <select value={currency} onChange={(e) => setCurrency(e.target.value)} style={{ ...inputStyle, flex: 1 }}>
                  {['BGN', 'EUR', 'NOK', 'SEK', 'USD', 'GBP'].map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
            )}
          </div>

          {/* Notes */}
          <Field label={t('addStation.notes')}>
            <textarea value={notes} onChange={(e) => setNotes(e.target.value)}
              placeholder={t('addStation.notesPlaceholder')}
              rows={isTeslaBrowser ? 2 : 3}
              style={{ ...inputStyle, resize: 'vertical', minHeight: 52 }} />
          </Field>

          {error && (
            <div style={{ fontSize: 13, color: '#f87171', background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 8, padding: '8px 12px' }}>
              {error}
            </div>
          )}

          {/* Footer buttons */}
          <div style={{ display: 'flex', gap: 10, paddingTop: 4 }}>
            <button type="button" onClick={onClose} style={{
              flex: 1, padding: '12px 0', borderRadius: 10, cursor: 'pointer',
              background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)',
              color: 'rgba(255,255,255,0.6)', fontSize: 14, fontWeight: 600, touchAction: 'manipulation',
            }}>{t('addStation.cancel')}</button>

            <button type="submit" disabled={submitting || !name.trim()} style={{
              flex: 2, padding: '12px 0', borderRadius: 10, cursor: 'pointer',
              background: submitting || !name.trim() ? 'rgba(251,191,36,0.2)' : '#fbbf24',
              border: 'none',
              color: submitting || !name.trim() ? 'rgba(255,255,255,0.35)' : '#111',
              fontSize: 15, fontWeight: 800, touchAction: 'manipulation',
            }}>
              {submitting
                ? t('addStation.submitting')
                : isEdit ? t('addStation.save') : t('addStation.submit')}
            </button>
          </div>

          {/* Delete (edit mode only) */}
          {isEdit && (
            <button type="button" onClick={() => { void handleDelete() }} disabled={deleting} style={{
              width: '100%', padding: '10px 0', borderRadius: 10, cursor: 'pointer',
              background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)',
              color: '#f87171', fontSize: 13, fontWeight: 700, touchAction: 'manipulation',
              opacity: deleting ? 0.5 : 1,
            }}>
              {deleting ? '…' : `🗑 ${t('addStation.delete')}`}
            </button>
          )}
        </form>
      </div>
    </div>
  )
}

// ── Shared styles ──────────────────────────────────────────────────────

const inputStyle: React.CSSProperties = {
  background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)',
  borderRadius: 8, color: '#fff', padding: '9px 12px', fontSize: 14, outline: 'none',
  width: '100%', boxSizing: 'border-box',
}

const labelStyle: React.CSSProperties = {
  fontSize: 11, fontWeight: 700, color: 'rgba(255,255,255,0.4)',
  textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8,
}

function Input({ value, onChange, placeholder, type = 'text', style }: {
  value: string; onChange: (v: string) => void
  placeholder?: string; type?: string; style?: React.CSSProperties
}) {
  return (
    <input type={type} value={value} placeholder={placeholder}
      onChange={(e) => onChange(e.target.value)}
      style={{ ...inputStyle, ...style }} />
  )
}

function Field({ label, children, style }: { label: string; children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div style={style}>
      <div style={labelStyle}>{label}</div>
      {children}
    </div>
  )
}
