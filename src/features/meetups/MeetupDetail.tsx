// ─── Meetup detail modal ────────────────────────────────────────────────
// Opened by tapping an event marker. Shows contact info + Follow + Edit (owner).

import { useState, useSyncExternalStore } from 'react'
import { meetupStore } from './meetupStore'
import { getMeetupToken } from './userMeetupOwner'
import { routeStore } from '@/features/route/routeStore'

function fmt(iso: string): string {
  const d = new Date(iso)
  if (isNaN(d.getTime())) return iso
  return d.toLocaleString('bg-BG', { weekday: 'short', day: '2-digit', month: 'long', hour: '2-digit', minute: '2-digit' })
}
const isUrl = (s: string) => /^https?:\/\//i.test(s)

const SITE = 'https://tesradar.tech'

function copyToClipboard(text: string): Promise<void> {
  if (navigator.clipboard?.writeText) return navigator.clipboard.writeText(text)
  // Fallback for Tesla browser
  return new Promise((resolve) => {
    const el = document.createElement('textarea')
    el.value = text
    el.style.position = 'fixed'
    el.style.opacity = '0'
    document.body.appendChild(el)
    el.focus()
    el.select()
    document.execCommand('copy')
    document.body.removeChild(el)
    resolve()
  })
}

export function MeetupDetail() {
  const state = useSyncExternalStore(
    meetupStore.subscribe.bind(meetupStore),
    () => meetupStore.getState(),
    () => meetupStore.getState(),
  )
  const m = state.selected
  const [following, setFollowing] = useState(false)
  const [copied,    setCopied]    = useState(false)
  if (!m) return null

  const isOwner = getMeetupToken(m.id) != null

  function shareLink() {
    void copyToClipboard(`${SITE}/?meetup=${m!.id}`).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2500)
    })
  }

  async function follow() {
    if (!m) return
    const email = window.prompt('Имейл за следене на събитието:')
    if (!email) return
    try {
      const res = await fetch('/api/meetups/interest', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: m.id, email }),
      })
      if (res.ok) setFollowing(true)
      else { const d = await res.json(); alert(d.error ?? 'Грешка') }
    } catch { /* ignore */ }
  }

  return (
    <div style={overlay} onClick={() => meetupStore.closeDetail()}>
      <div style={card} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', padding: '16px 18px 8px' }}>
          <div style={{ fontSize: 18, fontWeight: 800, paddingRight: 8 }}>📅 {m.title}</div>
          <button onClick={() => meetupStore.closeDetail()} style={closeBtn}>✕</button>
        </div>
        <div style={{ padding: '0 18px 16px', display: 'flex', flexDirection: 'column', gap: 8 }}>
          <Row icon="🕒" text={fmt(m.date)} />
          {m.organizer && <Row icon="👤" text={m.organizer} />}
          {m.organizerPhone && <Row icon="📞" text={<a href={`tel:${m.organizerPhone}`} style={link}>{m.organizerPhone}</a>} />}
          {m.organizerEmail && <Row icon="✉️" text={<a href={`mailto:${m.organizerEmail}`} style={link}>{m.organizerEmail}</a>} />}
          {m.facebook && <Row icon="f" text={isUrl(m.facebook) ? <a href={m.facebook} target="_blank" rel="noopener noreferrer" style={link}>Facebook група</a> : m.facebook} />}

          {/* Navigate — available to everyone */}
          <button
            onClick={() => { if (m) { void routeStore.navigateTo({ lat: m.lat, lng: m.lng, name: m.title }); meetupStore.closeDetail() } }}
            style={{ ...btn, marginTop: 8, width: '100%', background: '#e31937', border: 'none', fontWeight: 800, fontSize: 15 }}
          >
            🧭 Навигирай до локацията
          </button>

          <div style={{ display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
            {/* Follow — for non-owners */}
            {!isOwner && (
              <button onClick={follow} disabled={following} style={{ ...btn, flex: 1, background: following ? 'rgba(34,197,94,0.15)' : '#6366f1', color: following ? '#22c55e' : '#fff', border: 'none' }}>
                {following ? '✓ Следиш' : '🔔 Следи'}
              </button>
            )}
            {/* Edit — always visible; server validates ownership */}
            <button
              onClick={() => meetupStore.openEdit(m)}
              style={{ ...btn, flex: 1, background: isOwner ? 'rgba(99,102,241,0.2)' : 'rgba(255,255,255,0.07)', color: isOwner ? '#a5b4fc' : 'rgba(255,255,255,0.7)', border: `1px solid ${isOwner ? 'rgba(99,102,241,0.45)' : 'rgba(255,255,255,0.15)'}` }}
            >
              ✏️ Редактирай
            </button>
            {/* Share link — available to everyone */}
            <button
              onClick={shareLink}
              style={{ ...btn, flex: 1, background: copied ? 'rgba(34,197,94,0.15)' : 'rgba(99,102,241,0.12)', color: copied ? '#4ade80' : '#a5b4fc', border: `1px solid ${copied ? 'rgba(34,197,94,0.4)' : 'rgba(99,102,241,0.35)'}` }}
            >
              {copied ? '✅ Копирано!' : '🔗 Сподели'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

function Row({ icon, text }: { icon: string; text: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', gap: 10, alignItems: 'center', fontSize: 14, color: 'rgba(255,255,255,0.85)' }}>
      <span style={{ width: 20, textAlign: 'center', color: 'rgba(255,255,255,0.6)' }}>{icon}</span>
      <span>{text}</span>
    </div>
  )
}

const overlay: React.CSSProperties = {
  position: 'fixed', inset: 0, zIndex: 1240, background: 'rgba(0,0,0,0.72)',
  display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 12,
}
const card: React.CSSProperties = {
  background: '#161622', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 16,
  width: '100%', maxWidth: 420, color: '#fff', display: 'flex', flexDirection: 'column',
}
const closeBtn: React.CSSProperties = { background: 'transparent', color: 'rgba(255,255,255,0.6)', border: 'none', fontSize: 18, cursor: 'pointer', padding: '2px 6px' }
const link: React.CSSProperties = { color: '#a5b4fc', textDecoration: 'none' }
const btn: React.CSSProperties = {
  borderRadius: 10, padding: '11px 16px', fontSize: 14, fontWeight: 700, cursor: 'pointer',
  color: '#fff', border: '1px solid rgba(255,255,255,0.15)', touchAction: 'manipulation',
}
