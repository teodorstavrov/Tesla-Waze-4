// ─── Add Station Form ───────────────────────────────────────────────────
//
// Modal that opens from the map long-press "Добави станция" button.
// Collects station data and POSTs to /api/ev/submit.
// Subscribes to addStationStore for open/close state.

import { useState, useSyncExternalStore } from 'react'
import { addStationStore } from './addStationStore'
import { evStore } from './evStore'
import { t } from '@/lib/locale'
import { isTeslaBrowser } from '@/lib/browser'

const CONNECTOR_TYPES = ['CCS', 'CHAdeMO', 'Type2', 'Type1', 'Tesla', 'Schuko'] as const
type ConnectorType = (typeof CONNECTOR_TYPES)[number]

interface ConnectorEntry {
  type:    ConnectorType
  powerKw: string
  count:   string
}

// ── Component ──────────────────────────────────────────────────────────

export function AddStationForm() {
  const { open, lat, lng, address } = useSyncExternalStore(
    addStationStore.subscribe.bind(addStationStore),
    () => addStationStore.getState(),
    () => addStationStore.getState(),
  )

  if (!open) return null

  return (
    <AddStationModal
      lat={lat}
      lng={lng}
      initialAddress={address}
      onClose={() => addStationStore.close()}
    />
  )
}

// ── Modal (separate component so state resets on each open) ────────────

function AddStationModal({
  lat,
  lng,
  initialAddress,
  onClose,
}: {
  lat:            number
  lng:            number
  initialAddress: string
  onClose:        () => void
}) {
  const [name,        setName]       = useState('')
  const [address,     setAddress]    = useState(initialAddress)
  const [city,        setCity]       = useState('')
  const [network,     setNetwork]    = useState('')
  const [connectors,  setConnectors] = useState<ConnectorEntry[]>([])
  const [isFree,      setIsFree]     = useState<boolean | null>(null)
  const [pricePerKwh, setPrice]      = useState('')
  const [currency,    setCurrency]   = useState('BGN')
  const [notes,       setNotes]      = useState('')
  const [submitting,  setSubmitting] = useState(false)
  const [done,        setDone]       = useState(false)
  const [error,       setError]      = useState('')

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

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim()) { setError(t('addStation.nameRequired')); return }

    setSubmitting(true)
    setError('')

    const payload = {
      lat,
      lng,
      name:        name.trim(),
      address:     address.trim() || null,
      city:        city.trim() || null,
      country:     'BG',
      network:     network.trim() || null,
      connectors:  connectors.length > 0
        ? connectors.map((c) => ({
            type:    c.type,
            powerKw: c.powerKw ? parseFloat(c.powerKw) || null : null,
            count:   parseInt(c.count, 10) || 1,
          }))
        : [{ type: 'Other', powerKw: null, count: 1 }],
      isFree:      isFree,
      pricePerKwh: pricePerKwh ? parseFloat(pricePerKwh) || null : null,
      priceCurrency: currency || null,
      notes:       notes.trim() || null,
    }

    try {
      const res = await fetch('/api/ev/submit', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(payload),
      })
      const data = await res.json() as { ok?: boolean; error?: string }
      if (!res.ok || !data.ok) {
        setError(data.error ?? t('addStation.submitError'))
        setSubmitting(false)
        return
      }
      setDone(true)
      // Reload stations so the new marker appears immediately with bust=1 to skip server cache
      void evStore.forceRefresh()
    } catch {
      setError(t('addStation.networkError'))
      setSubmitting(false)
    }
  }

  const overlayStyle: React.CSSProperties = {
    position:       'fixed',
    inset:          0,
    zIndex:         1200,
    background:     'rgba(0,0,0,0.72)',
    display:        'flex',
    alignItems:     'center',
    justifyContent: 'center',
    padding:        '12px',
  }

  const cardStyle: React.CSSProperties = {
    background:   '#161622',
    border:       '1px solid rgba(255,255,255,0.1)',
    borderRadius: 16,
    width:        '100%',
    maxWidth:     480,
    maxHeight:    '90vh',
    overflowY:    'auto',
    display:      'flex',
    flexDirection: 'column',
  }

  if (done) {
    return (
      <div style={overlayStyle} onClick={onClose}>
        <div style={{ ...cardStyle, alignItems: 'center', padding: '40px 32px', textAlign: 'center' }}>
          <div style={{ fontSize: 52, marginBottom: 16 }}>✅</div>
          <div style={{ fontSize: 20, fontWeight: 700, marginBottom: 10 }}>
            {t('addStation.successTitle')}
          </div>
          <div style={{ fontSize: 14, color: 'rgba(255,255,255,0.55)', lineHeight: 1.6, marginBottom: 28 }}>
            {t('addStation.successBody')}
          </div>
          <button
            onClick={onClose}
            style={{
              background: '#22c55e', color: '#fff', border: 'none',
              borderRadius: 10, padding: '12px 32px',
              fontSize: 16, fontWeight: 700, cursor: 'pointer',
            }}
          >
            OK
          </button>
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
          display:        'flex',
          alignItems:     'center',
          justifyContent: 'space-between',
          padding:        '16px 18px 12px',
          borderBottom:   '1px solid rgba(255,255,255,0.07)',
          flexShrink:     0,
        }}>
          <span style={{ fontSize: 16, fontWeight: 700 }}>
            ⚡ {t('addStation.title')}
          </span>
          <button
            onClick={onClose}
            style={{
              background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.14)',
              borderRadius: 7, color: 'rgba(255,255,255,0.55)',
              fontSize: 15, fontWeight: 700, padding: '4px 10px', cursor: 'pointer',
              touchAction: 'manipulation',
            }}
          >
            ✕
          </button>
        </div>

        {/* Coordinates badge */}
        <div style={{ padding: '8px 18px', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
          <span style={{
            fontSize: 11, color: 'rgba(255,255,255,0.35)',
            fontFamily: 'monospace',
          }}>
            {lat.toFixed(6)}, {lng.toFixed(6)}
          </span>
        </div>

        {/* Form body */}
        <form onSubmit={(e) => { void handleSubmit(e) }} style={{ padding: '14px 18px 18px', display: 'flex', flexDirection: 'column', gap: 14 }}>

          <Field label={`${t('addStation.name')} *`}>
            <Input
              value={name} onChange={setName}
              placeholder={t('addStation.namePlaceholder')}
            />
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

          {/* Connector types */}
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>
              {t('addStation.connectors')}
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
              {CONNECTOR_TYPES.map((type) => {
                const active = connectors.some((c) => c.type === type)
                return (
                  <button
                    key={type}
                    type="button"
                    onClick={() => toggleConnector(type)}
                    style={{
                      padding:    '6px 13px',
                      borderRadius: 8,
                      fontSize:   13,
                      fontWeight: active ? 700 : 400,
                      cursor:     'pointer',
                      touchAction: 'manipulation',
                      background: active ? 'rgba(251,191,36,0.15)' : 'rgba(255,255,255,0.05)',
                      border:     `1px solid ${active ? 'rgba(251,191,36,0.55)' : 'rgba(255,255,255,0.12)'}`,
                      color:      active ? '#fbbf24' : 'rgba(255,255,255,0.6)',
                    }}
                  >
                    {type}
                  </button>
                )
              })}
            </div>

            {/* Power + count per selected connector */}
            {connectors.map((c) => (
              <div key={c.type} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                <span style={{ fontSize: 12, color: '#fbbf24', fontWeight: 700, width: 70, flexShrink: 0 }}>
                  {c.type}
                </span>
                <input
                  type="number" min="1" max="1000" placeholder="kW"
                  value={c.powerKw}
                  onChange={(e) => updateConnector(c.type, 'powerKw', e.target.value)}
                  style={{ ...inputStyle, width: 70, textAlign: 'right' }}
                />
                <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)' }}>kW</span>
                <input
                  type="number" min="1" max="50" placeholder="бр."
                  value={c.count}
                  onChange={(e) => updateConnector(c.type, 'count', e.target.value)}
                  style={{ ...inputStyle, width: 54, textAlign: 'right' }}
                />
                <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)' }}>{t('addStation.pcs')}</span>
              </div>
            ))}
          </div>

          {/* Pricing */}
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>
              {t('addStation.pricing')}
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              {([null, true, false] as Array<boolean | null>).map((v) => {
                const label = v === null ? t('addStation.priceUnknown') : v ? t('addStation.free') : t('addStation.paid')
                return (
                  <button
                    key={String(v)}
                    type="button"
                    onClick={() => setIsFree(v)}
                    style={{
                      flex: 1, padding: '8px 0', borderRadius: 8, cursor: 'pointer',
                      touchAction: 'manipulation', fontSize: 12, fontWeight: 600,
                      background: isFree === v ? 'rgba(34,197,94,0.15)' : 'rgba(255,255,255,0.05)',
                      border: `1px solid ${isFree === v ? 'rgba(34,197,94,0.5)' : 'rgba(255,255,255,0.1)'}`,
                      color: isFree === v ? '#4ade80' : 'rgba(255,255,255,0.55)',
                    }}
                  >
                    {label}
                  </button>
                )
              })}
            </div>
            {isFree === false && (
              <div style={{ display: 'flex', gap: 8, marginTop: 8, alignItems: 'center' }}>
                <Input
                  value={pricePerKwh}
                  onChange={setPrice}
                  placeholder="0.35"
                  type="number"
                  style={{ width: 80 }}
                />
                <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)' }}>/kWh</span>
                <select
                  value={currency}
                  onChange={(e) => setCurrency(e.target.value)}
                  style={{ ...inputStyle, flex: 1 }}
                >
                  {['BGN', 'EUR', 'NOK', 'SEK', 'USD', 'GBP'].map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
              </div>
            )}
          </div>

          {/* Notes */}
          <Field label={t('addStation.notes')}>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder={t('addStation.notesPlaceholder')}
              rows={isTeslaBrowser ? 2 : 3}
              style={{
                ...inputStyle,
                resize:  'vertical',
                minHeight: 52,
              }}
            />
          </Field>

          {error && (
            <div style={{ fontSize: 13, color: '#f87171', background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 8, padding: '8px 12px' }}>
              {error}
            </div>
          )}

          {/* Footer */}
          <div style={{ display: 'flex', gap: 10, paddingTop: 4 }}>
            <button
              type="button"
              onClick={onClose}
              style={{
                flex: 1, padding: '12px 0', borderRadius: 10, cursor: 'pointer',
                background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)',
                color: 'rgba(255,255,255,0.6)', fontSize: 14, fontWeight: 600,
                touchAction: 'manipulation',
              }}
            >
              {t('addStation.cancel')}
            </button>
            <button
              type="submit"
              disabled={submitting || !name.trim()}
              style={{
                flex: 2, padding: '12px 0', borderRadius: 10, cursor: 'pointer',
                background: submitting || !name.trim() ? 'rgba(251,191,36,0.2)' : '#fbbf24',
                border: 'none',
                color: submitting || !name.trim() ? 'rgba(255,255,255,0.35)' : '#111',
                fontSize: 15, fontWeight: 800,
                touchAction: 'manipulation',
              }}
            >
              {submitting ? t('addStation.submitting') : t('addStation.submit')}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ── Small helpers ──────────────────────────────────────────────────────

const inputStyle: React.CSSProperties = {
  background:   'rgba(255,255,255,0.06)',
  border:       '1px solid rgba(255,255,255,0.12)',
  borderRadius: 8,
  color:        '#fff',
  padding:      '9px 12px',
  fontSize:     14,
  outline:      'none',
  width:        '100%',
  boxSizing:    'border-box',
}

function Input({
  value, onChange, placeholder, type = 'text', style,
}: {
  value:       string
  onChange:    (v: string) => void
  placeholder?: string
  type?:        string
  style?:       React.CSSProperties
}) {
  return (
    <input
      type={type}
      value={value}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value)}
      style={{ ...inputStyle, ...style }}
    />
  )
}

function Field({
  label, children, style,
}: {
  label:    string
  children: React.ReactNode
  style?:   React.CSSProperties
}) {
  return (
    <div style={style}>
      <div style={{
        fontSize: 11, fontWeight: 700,
        color: 'rgba(255,255,255,0.4)',
        textTransform: 'uppercase', letterSpacing: '0.08em',
        marginBottom: 6,
      }}>
        {label}
      </div>
      {children}
    </div>
  )
}
