// ─── Add / Edit Community Event (Meetup) form ───────────────────────────
// Add  → POST /api/meetups        → saves ownerToken to localStorage
// Edit → POST /api/meetups/edit   → requires ownerToken (creator only)

import { useState, useSyncExternalStore } from 'react'
import { meetupStore } from './meetupStore'
import { saveMeetupToken, getMeetupToken } from './userMeetupOwner'
import { t, langStore, getLang } from '@/lib/locale'
import { formatRecurrence, nextOccurrence, type RecurrenceType } from './recurrence'
import type { Meetup } from './types'

const RECURRENCE_OPTS: RecurrenceType[] = ['none','weekly','biweekly','monthly_date','monthly_weekday']

function toLocalInput(iso: string): string {
  const d = new Date(iso)
  if (isNaN(d.getTime())) return ''
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function recLabel(r: RecurrenceType): string {
  return t(`meetup.rec${r === 'none' ? 'None' : r === 'weekly' ? 'Weekly' : r === 'biweekly' ? 'Biweekly' : r === 'monthly_date' ? 'MonthDate' : 'MonthDay'}`)
}

export function MeetupForm() {
  const state = useSyncExternalStore(
    meetupStore.subscribe.bind(meetupStore),
    () => meetupStore.getState(),
    () => meetupStore.getState(),
  )
  useSyncExternalStore(langStore.subscribe, langStore.getLang)
  if (!state.formOpen) return null
  return (
    <MeetupModal
      key={state.editing?.id ?? `add-${state.formLat}-${state.formLng}`}
      lat={state.formLat}
      lng={state.formLng}
      address={state.formAddress}
      editing={state.editing}
    />
  )
}

function MeetupModal({ lat, lng, address, editing }: {
  lat: number; lng: number; address: string; editing: Meetup | null
}) {
  const isEdit = editing != null
  const [title,       setTitle]       = useState(editing?.title ?? '')
  const [date,        setDate]        = useState(editing ? toLocalInput(editing.date) : '')
  const [description, setDescription] = useState(editing?.description ?? '')
  const [recurrence,  setRecurrence]  = useState<RecurrenceType>(editing?.recurrence ?? 'none')
  const [organizer,   setOrganizer]   = useState(editing?.organizer ?? '')
  const [phone,       setPhone]       = useState(editing?.organizerPhone ?? '')
  const [email,       setEmail]       = useState(editing?.organizerEmail ?? '')
  const [facebook,    setFacebook]    = useState(editing?.facebook ?? '')
  const [submitting,  setSubmitting]  = useState(false)
  const [error,       setError]       = useState<string | null>(null)
  const [done,        setDone]        = useState(false)

  const lang = getLang()

  // Computed recurrence preview (derived from selected date + recurrence type)
  const recurrencePreview = recurrence !== 'none' && date
    ? formatRecurrence(new Date(date), recurrence, lang)
    : null

  // Show next occurrence if recurring
  const nextDate = recurrence !== 'none' && date
    ? nextOccurrence(new Date(date), recurrence)
    : null

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!title.trim() || !date) return
    setSubmitting(true); setError(null)
    try {
      if (isEdit && editing) {
        const token = getMeetupToken(editing.id)
        if (!token) { setError(t('meetup.onlyCreator')); setSubmitting(false); return }
        const res = await fetch('/api/meetups/edit', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: editing.id, ownerToken: token, title, date, description: description || null, recurrence, organizer, organizerPhone: phone, organizerEmail: email, facebook }),
        })
        const data = await res.json()
        if (!res.ok) { setError(data.error ?? t('meetup.errorSave')); setSubmitting(false); return }
        meetupStore.upsertLocal(data.meetup as Meetup)
        setDone(true)
      } else {
        const res = await fetch('/api/meetups', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ lat, lng, title, date, description: description || null, recurrence, organizer, organizerPhone: phone, organizerEmail: email, facebook }),
        })
        const data = await res.json()
        if (!res.ok) { setError(data.error ?? t('meetup.errorSave')); setSubmitting(false); return }
        if (data.ownerToken) saveMeetupToken(data.meetup.id, data.ownerToken)
        meetupStore.upsertLocal(data.meetup as Meetup)
        setDone(true)
      }
    } catch {
      setError(t('meetup.noConn')); setSubmitting(false)
    }
  }

  if (done) {
    return (
      <div style={overlayStyle} onClick={() => meetupStore.closeForm()}>
        <div style={{ ...cardStyle, alignItems: 'center', padding: '40px 32px', textAlign: 'center' }}>
          <div style={{ fontSize: 52, marginBottom: 16 }}>📅</div>
          <div style={{ fontSize: 20, fontWeight: 700, marginBottom: 10 }}>{isEdit ? t('meetup.savedMsg') : t('meetup.addedMsg')}</div>
          <button onClick={() => meetupStore.closeForm()} style={primaryBtn}>{t('common.close')}</button>
        </div>
      </div>
    )
  }

  return (
    <div style={overlayStyle}>
      <div style={cardStyle} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 18px', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
          <div style={{ fontSize: 17, fontWeight: 800 }}>📅 {isEdit ? t('meetup.formEdit') : t('meetup.formAdd')}</div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button title={t('meetup.eventsTitle')} onClick={() => meetupStore.openList()} style={listBtn}>📋</button>
            <button onClick={() => meetupStore.closeForm()} style={closeBtn}>✕</button>
          </div>
        </div>

        {!isEdit && (
          <div style={{ padding: '6px 18px 4px', fontSize: 12, color: 'rgba(255,255,255,0.45)' }}>
            {address || `${lat.toFixed(5)}, ${lng.toFixed(5)}`}
          </div>
        )}

        <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 13, padding: '12px 18px 18px' }}>
          <Field label={t('meetup.descLabel')}>
            <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder={t('meetup.descPlaceholder')} style={inputStyle} />
          </Field>

          {/* Short description / notes */}
          <Field label={t('meetup.noteLabel')}>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={t('meetup.notePlaceholder')}
              maxLength={300}
              rows={2}
              style={{ ...inputStyle, resize: 'none', lineHeight: 1.45 }}
            />
          </Field>

          <Field label={t('meetup.dateLabel')}>
            <input type="datetime-local" value={date} onChange={(e) => setDate(e.target.value)} style={inputStyle} />
          </Field>

          {/* Recurrence */}
          <Field label={t('meetup.recurrenceLabel')}>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {RECURRENCE_OPTS.map((r) => (
                <button
                  key={r}
                  type="button"
                  onClick={() => setRecurrence(r)}
                  style={{
                    padding: '8px 11px', borderRadius: 8, fontSize: 12, fontWeight: 600,
                    border:      recurrence === r ? '1px solid #6366f1' : '1px solid rgba(255,255,255,0.12)',
                    background:  recurrence === r ? 'rgba(99,102,241,0.25)' : 'rgba(255,255,255,0.05)',
                    color:       recurrence === r ? '#a5b4fc' : 'rgba(255,255,255,0.55)',
                    cursor: 'pointer', touchAction: 'manipulation',
                  }}
                >
                  {recLabel(r)}
                </button>
              ))}
            </div>
            {recurrencePreview && (
              <div style={{ marginTop: 6, fontSize: 12, color: '#a5b4fc' }}>
                🔁 {recurrencePreview}
                {nextDate && nextDate.toISOString() !== new Date(date).toISOString() && (
                  <span style={{ color: 'rgba(255,255,255,0.4)', marginLeft: 6 }}>
                    · {t('meetup.recNext')} {nextDate.toLocaleString(undefined, { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                  </span>
                )}
              </div>
            )}
          </Field>

          <Field label={t('meetup.organizerLabel')}>
            <input value={organizer} onChange={(e) => setOrganizer(e.target.value)} placeholder={t('meetup.organizerPlaceholder')} style={inputStyle} />
          </Field>
          <div style={{ display: 'flex', gap: 10 }}>
            <Field label={t('meetup.phoneLabel')} style={{ flex: 1 }}><input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+..." style={inputStyle} /></Field>
            <Field label={t('meetup.emailLabel')} style={{ flex: 1 }}><input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="org@example.com" style={inputStyle} /></Field>
          </div>
          <Field label={t('meetup.facebookLabel')}>
            <input value={facebook} onChange={(e) => setFacebook(e.target.value)} placeholder={t('meetup.facebookPlaceholder')} style={inputStyle} />
          </Field>

          {email && !isEdit && (
            <div style={{ fontSize: 11, color: 'rgba(165,180,252,0.85)' }}>{t('meetup.emailHint')}</div>
          )}
          {error && <div style={{ fontSize: 13, color: '#f87171', background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 8, padding: '8px 12px' }}>{error}</div>}

          <button type="submit" disabled={submitting || !title.trim() || !date} style={{
            ...primaryBtn,
            background: submitting || !title.trim() || !date ? 'rgba(99,102,241,0.25)' : '#6366f1',
            color:      submitting || !title.trim() || !date ? 'rgba(255,255,255,0.4)' : '#fff',
            cursor:     submitting || !title.trim() || !date ? 'default' : 'pointer',
          }}>
            {submitting ? t('meetup.saving') : isEdit ? t('meetup.saveChanges') : t('meetup.formAdd')}
          </button>
        </form>
      </div>
    </div>
  )
}

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

function Field({ label, children, style }: { label: string; children: React.ReactNode; style?: React.CSSProperties }) {
  return <div style={style}><div style={labelStyle}>{label}</div>{children}</div>
}
