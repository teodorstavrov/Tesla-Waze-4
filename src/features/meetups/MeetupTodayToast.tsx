// ─── Upcoming meetup toast ───────────────────────────────────────────────
// Shows a dismissible banner at the top of the screen when a community event
// is today, tomorrow, or in 2 days. Closes automatically once the event day
// has passed. Tapping opens the event detail.

import { useEffect, useState } from 'react'
import { meetupStore } from './meetupStore'
import { gpsStore } from '@/features/gps/gpsStore'
import { t } from '@/lib/locale'
import type { Meetup } from './types'

/** Calendar days from today to the event date (0 = today, 1 = tomorrow, negative = past). */
function daysUntil(isoDate: string): number {
  const ev   = new Date(isoDate)
  const now  = new Date()
  const evD  = new Date(ev.getFullYear(),  ev.getMonth(),  ev.getDate())
  const nowD = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  return Math.round((evD.getTime() - nowD.getTime()) / 86_400_000)
}

function todayStr(): string {
  const n = new Date()
  return `${n.getFullYear()}-${n.getMonth()}-${n.getDate()}`
}

function distKm(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const R = 6371, toRad = (x: number) => (x * Math.PI) / 180
  const dLat = toRad(bLat - aLat), dLng = toRad(bLng - aLng)
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(s))
}

// Dismiss key encodes the date so the banner reappears each new day even if
// the user previously closed it (sessionStorage resets on tab close anyway,
// but the date suffix guards against long-running Tesla browser sessions).
const dismissKey = (id: string) => `meetup-upcoming-dismissed:${id}:${todayStr()}`

function isDismissed(id: string): boolean {
  try { return sessionStorage.getItem(dismissKey(id)) != null } catch { return false }
}
function setDismissed(id: string): void {
  try { sessionStorage.setItem(dismissKey(id), '1') } catch { /* */ }
}

function labelForDays(days: number): string {
  if (days <= 0) return t('meetup.todayEvent')
  if (days === 1) return t('meetup.tomorrowEvent')
  return t('meetup.upcomingEvent')
}

export function MeetupTodayToast() {
  const [event, setEvent] = useState<Meetup | null>(null)
  const [days,  setDays]  = useState(0)
  const [pos,   setPos]   = useState(() => gpsStore.getPosition())

  useEffect(() => {
    meetupStore.fetch()

    function pick() {
      // Find the soonest upcoming event within the next 2 days (today, tomorrow, or +2)
      // that the user hasn't dismissed today.
      const candidate = meetupStore.getState().meetups
        .map((m) => ({ m, d: daysUntil(m.date) }))
        .filter(({ d }) => d >= 0 && d <= 2)
        .filter(({ m }) => !isDismissed(m.id))
        .sort((a, b) => a.d - b.d || a.m.date.localeCompare(b.m.date))[0]

      if (candidate) {
        setEvent(candidate.m)
        setDays(candidate.d)
      } else {
        setEvent(null)
      }
    }

    pick()
    const unsubStore = meetupStore.subscribe(pick)
    const unsubGps   = gpsStore.onPosition((p) => setPos(p))

    // Re-check at midnight so a banner that was showing for "in 2 days" becomes
    // "tomorrow", and one showing for "today" disappears when the day rolls over.
    const msToMidnight = (() => {
      const n = new Date(); const m = new Date(n)
      m.setHours(24, 0, 30, 0)   // 30s after midnight avoids edge-case
      return m.getTime() - n.getTime()
    })()
    const midnightTimer = setTimeout(pick, msToMidnight)

    return () => { unsubStore(); unsubGps(); clearTimeout(midnightTimer) }
  }, [])

  if (!event) return null

  const km   = pos ? distKm(pos.lat, pos.lng, event.lat, event.lng) : null
  const dist = km == null ? '' : km < 1 ? ` · ${Math.round(km * 1000)} м` : ` · ${km.toFixed(km < 10 ? 1 : 0)} км`
  const label = labelForDays(days)

  function dismiss(e: React.MouseEvent) {
    e.stopPropagation()
    if (event) setDismissed(event.id)
    setEvent(null)
  }

  return (
    <div
      onClick={() => event && meetupStore.select(event)}
      style={{
        position: 'fixed', top: 'calc(env(safe-area-inset-top, 0px) + 12px)', left: '50%', transform: 'translateX(-50%)',
        zIndex: 1190, maxWidth: '92vw',
        background: 'linear-gradient(135deg,#4f46e5,#6366f1)', color: '#fff',
        borderRadius: 12, boxShadow: '0 6px 24px rgba(0,0,0,0.5)',
        padding: '10px 12px 10px 14px', display: 'flex', alignItems: 'center', gap: 10,
        cursor: 'pointer', touchAction: 'manipulation',
      }}
    >
      <span style={{ fontSize: 20 }}>📅</span>
      <div style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.25, minWidth: 0 }}>
        <span style={{ fontSize: 12, fontWeight: 700, opacity: 0.85 }}>{label}{dist}</span>
        <span style={{ fontSize: 14, fontWeight: 800, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '70vw' }}>{event.title}</span>
      </div>
      <button onClick={dismiss} style={{ background: 'rgba(255,255,255,0.18)', color: '#fff', border: 'none', borderRadius: 8, width: 26, height: 26, fontSize: 14, cursor: 'pointer', flexShrink: 0 }}>✕</button>
    </div>
  )
}
