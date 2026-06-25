// ─── Community Events list panel ────────────────────────────────────────
// Opened from the 📋 button in the meetup form. Lists all upcoming meetups.

import { useState, useSyncExternalStore } from 'react'
import { meetupStore } from './meetupStore'
import { getMap } from '@/components/MapShell'
import { t, langStore, getLang } from '@/lib/locale'
import { nextOccurrence, formatRecurrence } from './recurrence'
import type { Meetup } from './types'

const LANG_LOCALE: Record<string, string> = {
  bg: 'bg-BG', en: 'en-GB', no: 'nb-NO', sv: 'sv-SE', fi: 'fi-FI', nl: 'nl-NL',
}

function fmtDate(iso: string): string {
  const d = new Date(iso)
  if (isNaN(d.getTime())) return iso
  const locale = LANG_LOCALE[getLang()] ?? 'en-GB'
  return d.toLocaleString(locale, { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
}

export function MeetupList() {
  const state = useSyncExternalStore(
    meetupStore.subscribe.bind(meetupStore),
    () => meetupStore.getState(),
    () => meetupStore.getState(),
  )
  useSyncExternalStore(langStore.subscribe, langStore.getLang)
  if (!state.listOpen) return null

  const meetups = state.meetups

  return (
    <div style={overlayStyle} onClick={() => meetupStore.closeList()}>
      <div style={cardStyle} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 18px', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
          <div style={{ fontSize: 17, fontWeight: 800 }}>📅 {t('meetup.eventsTitle')} ({meetups.length})</div>
          <button onClick={() => meetupStore.closeList()} style={closeBtn}>✕</button>
        </div>

        <div style={{ overflowY: 'auto', padding: '8px 12px 14px' }}>
          {meetups.length === 0 && (
            <div style={{ textAlign: 'center', padding: '32px 16px', color: 'rgba(255,255,255,0.45)', fontSize: 14 }}>
              {t('meetup.noEvents')}
            </div>
          )}
          {meetups.map((m) => <Row key={m.id} m={m} />)}
        </div>
      </div>
    </div>
  )
}

const SITE = 'https://tesradar.tech'

function copyToClipboard(text: string): Promise<void> {
  if (navigator.clipboard?.writeText) return navigator.clipboard.writeText(text)
  return new Promise((resolve) => {
    const el = document.createElement('textarea')
    el.value = text
    el.style.position = 'fixed'; el.style.opacity = '0'
    document.body.appendChild(el); el.focus(); el.select()
    document.execCommand('copy'); document.body.removeChild(el)
    resolve()
  })
}

function Row({ m }: { m: Meetup }) {
  const [following, setFollowing] = useState(false)
  const [copied,    setCopied]    = useState(false)

  function goToMap() {
    const map = getMap()
    if (map) { map.setView([m.lat, m.lng], 14); meetupStore.closeList() }
  }

  function shareLink() {
    void copyToClipboard(`${SITE}/?meetup=${m.id}`).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2500)
    })
  }

  async function follow() {
    const email = window.prompt(t('meetup.followPrompt'))
    if (!email) return
    try {
      const res = await fetch('/api/meetups/interest', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: m.id, email }),
      })
      if (res.ok) setFollowing(true)
    } catch { /* ignore */ }
  }

  const isRecurring = m.recurrence && m.recurrence !== 'none'
  const displayDate = isRecurring
    ? nextOccurrence(new Date(m.date), m.recurrence).toISOString()
    : m.date
  const recPattern = isRecurring ? formatRecurrence(new Date(m.date), m.recurrence, getLang()) : null

  return (
    <div style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 10, padding: '12px 14px', marginBottom: 8 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}>
        <div style={{ fontSize: 15, fontWeight: 700, color: '#fff' }}>
          {isRecurring && <span style={{ marginRight: 5, fontSize: 13 }}>🔁</span>}{m.title}
        </div>
        <div style={{ fontSize: 12, color: '#a5b4fc', whiteSpace: 'nowrap' }}>{fmtDate(displayDate)}</div>
      </div>
      {recPattern && <div style={{ fontSize: 11, color: 'rgba(165,180,252,0.7)', marginTop: 2 }}>{recPattern}</div>}
      {m.description && <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)', marginTop: 3, lineHeight: 1.4 }}>{m.description}</div>}
      {m.organizer && <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.55)', marginTop: 4 }}>👤 {m.organizer}</div>}
      {((m.attendees?.length ?? 0) > 0 || (m.interested?.length ?? 0) > 0) && (
        <div style={{ display: 'flex', gap: 10, marginTop: 5, fontSize: 12 }}>
          {(m.attendees?.length ?? 0) > 0  && <span style={{ color: '#4ade80' }}>✅ {m.attendees.length}</span>}
          {(m.interested?.length ?? 0) > 0 && <span style={{ color: '#fbbf24' }}>⭐ {m.interested.length}</span>}
        </div>
      )}
      <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
        <button onClick={goToMap} style={smallBtn}>{t('meetup.toMap')}</button>
        <button onClick={() => { meetupStore.select(m); meetupStore.closeList() }} style={smallBtn}>{t('meetup.details')}</button>
        {m.facebook && /^https?:\/\//i.test(m.facebook) && (
          <a href={m.facebook} target="_blank" rel="noopener noreferrer" style={{ ...smallBtn, textDecoration: 'none', display: 'inline-block' }}>f Facebook</a>
        )}
        <button onClick={follow} disabled={following} style={{ ...smallBtn, color: following ? '#22c55e' : '#a5b4fc', borderColor: following ? 'rgba(34,197,94,0.4)' : 'rgba(165,180,252,0.4)' }}>
          {following ? t('meetup.following') : t('meetup.follow')}
        </button>
        <button onClick={shareLink} style={{ ...smallBtn, color: copied ? '#4ade80' : '#a5b4fc', borderColor: copied ? 'rgba(34,197,94,0.4)' : 'rgba(99,102,241,0.4)' }}>
          {copied ? t('meetup.copied') : t('meetup.share')}
        </button>
      </div>
    </div>
  )
}

const overlayStyle: React.CSSProperties = {
  position: 'fixed', inset: 0, zIndex: 1250, background: 'rgba(0,0,0,0.72)',
  display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 12,
}
const cardStyle: React.CSSProperties = {
  background: '#161622', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 16,
  width: '100%', maxWidth: 460, maxHeight: '85vh', display: 'flex', flexDirection: 'column', color: '#fff',
}
const closeBtn: React.CSSProperties = {
  background: 'transparent', color: 'rgba(255,255,255,0.6)', border: 'none', fontSize: 18, cursor: 'pointer', padding: '4px 8px',
}
const smallBtn: React.CSSProperties = {
  background: 'rgba(255,255,255,0.06)', color: '#fff', border: '1px solid rgba(255,255,255,0.15)',
  borderRadius: 8, padding: '7px 12px', fontSize: 13, fontWeight: 600, cursor: 'pointer', touchAction: 'manipulation',
}
