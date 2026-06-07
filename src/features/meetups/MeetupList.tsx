// ─── Community Events list panel ────────────────────────────────────────
// Opened from the 📋 button in the meetup form. Lists all upcoming meetups.

import { useState, useSyncExternalStore } from 'react'
import { meetupStore } from './meetupStore'
import { getMap } from '@/components/MapShell'
import type { Meetup } from './types'

function fmtDate(iso: string): string {
  const d = new Date(iso)
  if (isNaN(d.getTime())) return iso
  return d.toLocaleString('bg-BG', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
}

export function MeetupList() {
  const state = useSyncExternalStore(
    meetupStore.subscribe.bind(meetupStore),
    () => meetupStore.getState(),
    () => meetupStore.getState(),
  )
  if (!state.listOpen) return null

  const meetups = state.meetups

  return (
    <div style={overlayStyle} onClick={() => meetupStore.closeList()}>
      <div style={cardStyle} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 18px', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
          <div style={{ fontSize: 17, fontWeight: 800 }}>📅 Събития ({meetups.length})</div>
          <button onClick={() => meetupStore.closeList()} style={closeBtn}>✕</button>
        </div>

        <div style={{ overflowY: 'auto', padding: '8px 12px 14px' }}>
          {meetups.length === 0 && (
            <div style={{ textAlign: 'center', padding: '32px 16px', color: 'rgba(255,255,255,0.45)', fontSize: 14 }}>
              Няма събития още. Задръж пръст върху картата, за да добавиш.
            </div>
          )}
          {meetups.map((m) => <Row key={m.id} m={m} />)}
        </div>
      </div>
    </div>
  )
}

function Row({ m }: { m: Meetup }) {
  const [following, setFollowing] = useState(false)

  function goToMap() {
    const map = getMap()
    if (map) { map.setView([m.lat, m.lng], 14); meetupStore.closeList() }
  }

  async function follow() {
    const email = window.prompt('Имейл за следене на събитието:')
    if (!email) return
    try {
      const res = await fetch('/api/meetups/interest', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: m.id, email }),
      })
      if (res.ok) setFollowing(true)
    } catch { /* ignore */ }
  }

  return (
    <div style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 10, padding: '12px 14px', marginBottom: 8 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}>
        <div style={{ fontSize: 15, fontWeight: 700, color: '#fff' }}>{m.title}</div>
        <div style={{ fontSize: 12, color: '#a5b4fc', whiteSpace: 'nowrap' }}>{fmtDate(m.date)}</div>
      </div>
      {m.organizer && <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.55)', marginTop: 4 }}>👤 {m.organizer}</div>}
      <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
        <button onClick={goToMap} style={smallBtn}>📍 На картата</button>
        {m.facebookUrl && (
          <a href={m.facebookUrl} target="_blank" rel="noopener noreferrer" style={{ ...smallBtn, textDecoration: 'none', display: 'inline-block' }}>f Facebook</a>
        )}
        <button onClick={follow} disabled={following} style={{ ...smallBtn, color: following ? '#22c55e' : '#a5b4fc', borderColor: following ? 'rgba(34,197,94,0.4)' : 'rgba(165,180,252,0.4)' }}>
          {following ? '✓ Следиш' : '🔔 Следи'}
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
