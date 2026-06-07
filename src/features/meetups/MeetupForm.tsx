// ─── Add Community Event (Meetup) form ──────────────────────────────────
// Opened from the map long-press ("📅 Добави събитие"). POSTs to /api/meetups.

import { useState, useSyncExternalStore } from 'react'
import { meetupStore } from './meetupStore'
import type { Meetup } from './types'

export function MeetupForm() {
  const state = useSyncExternalStore(
    meetupStore.subscribe.bind(meetupStore),
    () => meetupStore.getState(),
    () => meetupStore.getState(),
  )
  if (!state.formOpen) return null
  return (
    <MeetupModal
      key={`${state.formLat}-${state.formLng}`}
      lat={state.formLat}
      lng={state.formLng}
      address={state.formAddress}
    />
  )
}

function MeetupModal({ lat, lng, address }: { lat: number; lng: number; address: string }) {
  const [title, setTitle]         = useState('')
  const [date, setDate]           = useState('')
  const [organizer, setOrganizer] = useState('')
  const [facebookUrl, setFb]      = useState('')
  const [email, setEmail]         = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError]         = useState<string | null>(null)
  const [done, setDone]           = useState(false)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!title.trim() || !date) return
    setSubmitting(true); setError(null)
    try {
      const res = await fetch('/api/meetups', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lat, lng, title, date, organizer, facebookUrl, email }),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error ?? 'Грешка при запис'); setSubmitting(false); return }
      meetupStore.upsertLocal(data.meetup as Meetup)
      setDone(true)
    } catch {
      setError('Няма връзка'); setSubmitting(false)
    }
  }

  if (done) {
    return (
      <div style={overlayStyle} onClick={() => meetupStore.closeForm()}>
        <div style={{ ...cardStyle, alignItems: 'center', padding: '40px 32px', textAlign: 'center' }}>
          <div style={{ fontSize: 52, marginBottom: 16 }}>📅</div>
          <div style={{ fontSize: 20, fontWeight: 700, marginBottom: 10 }}>Събитието е добавено!</div>
          <div style={{ fontSize: 14, color: 'rgba(255,255,255,0.55)', lineHeight: 1.6, marginBottom: 24 }}>
            Появи се на картата. Благодарим!
          </div>
          <button onClick={() => meetupStore.closeForm()} style={primaryBtn}>Затвори</button>
        </div>
      </div>
    )
  }

  return (
    <div style={overlayStyle}>
      <div style={cardStyle} onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 18px', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
          <div style={{ fontSize: 17, fontWeight: 800 }}>📅 Добави събитие</div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button title="Всички събития" onClick={() => meetupStore.openList()} style={listBtn}>📋</button>
            <button onClick={() => meetupStore.closeForm()} style={closeBtn}>✕</button>
          </div>
        </div>

        <div style={{ padding: '6px 18px 4px', fontSize: 12, color: 'rgba(255,255,255,0.45)' }}>
          {address || `${lat.toFixed(5)}, ${lng.toFixed(5)}`}
        </div>

        <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 14, padding: '12px 18px 18px' }}>
          <Field label="Описание *">
            <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="напр. Tesla среща Варна" style={inputStyle} />
          </Field>
          <Field label="Дата и час *">
            <input type="datetime-local" value={date} onChange={(e) => setDate(e.target.value)} style={inputStyle} />
          </Field>
          <Field label="Организатор">
            <input value={organizer} onChange={(e) => setOrganizer(e.target.value)} placeholder="Име / клуб" style={inputStyle} />
          </Field>
          <Field label="Facebook група (линк)">
            <input value={facebookUrl} onChange={(e) => setFb(e.target.value)} placeholder="https://facebook.com/groups/..." style={inputStyle} />
          </Field>
          <Field label="Твой имейл (по желание — за да следиш събитието)">
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" style={inputStyle} />
          </Field>

          {error && (
            <div style={{ fontSize: 13, color: '#f87171', background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 8, padding: '8px 12px' }}>{error}</div>
          )}

          <button type="submit" disabled={submitting || !title.trim() || !date} style={{
            ...primaryBtn,
            background: submitting || !title.trim() || !date ? 'rgba(99,102,241,0.25)' : '#6366f1',
            color: submitting || !title.trim() || !date ? 'rgba(255,255,255,0.4)' : '#fff',
            cursor: submitting || !title.trim() || !date ? 'default' : 'pointer',
          }}>
            {submitting ? 'Запис…' : 'Добави събитие'}
          </button>
        </form>
      </div>
    </div>
  )
}

// ── Shared styles ──────────────────────────────────────────────────────
const overlayStyle: React.CSSProperties = {
  position: 'fixed', inset: 0, zIndex: 1200, background: 'rgba(0,0,0,0.72)',
  display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 12,
}
const cardStyle: React.CSSProperties = {
  background: '#161622', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 16,
  width: '100%', maxWidth: 460, maxHeight: '90vh', overflowY: 'auto',
  display: 'flex', flexDirection: 'column', color: '#fff',
}
const inputStyle: React.CSSProperties = {
  background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)',
  borderRadius: 8, color: '#fff', padding: '11px 12px', fontSize: 15, outline: 'none',
  width: '100%', boxSizing: 'border-box',
}
const labelStyle: React.CSSProperties = {
  fontSize: 11, fontWeight: 700, color: 'rgba(255,255,255,0.4)',
  textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 6,
}
const primaryBtn: React.CSSProperties = {
  background: '#6366f1', color: '#fff', border: 'none', borderRadius: 10,
  padding: '13px 24px', fontSize: 16, fontWeight: 800, cursor: 'pointer',
  touchAction: 'manipulation', width: '100%',
}
const listBtn: React.CSSProperties = {
  background: 'rgba(255,255,255,0.08)', color: '#fff', border: '1px solid rgba(255,255,255,0.15)',
  borderRadius: 8, padding: '6px 10px', fontSize: 15, cursor: 'pointer', touchAction: 'manipulation',
}
const closeBtn: React.CSSProperties = {
  background: 'transparent', color: 'rgba(255,255,255,0.6)', border: 'none',
  fontSize: 18, cursor: 'pointer', padding: '4px 8px',
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div><div style={labelStyle}>{label}</div>{children}</div>
}
