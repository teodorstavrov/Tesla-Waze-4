// ─── "Event today" toast ────────────────────────────────────────────────
// When the site loads and there is a community event happening TODAY, show a
// dismissible banner with the event and the distance from the user's position.
// Tapping it opens the event detail.

import { useEffect, useState } from 'react'
import { meetupStore } from './meetupStore'
import { gpsStore } from '@/features/gps/gpsStore'
import { t } from '@/lib/locale'
import type { Meetup } from './types'

function isToday(iso: string): boolean {
  const d = new Date(iso); const n = new Date()
  return d.getFullYear() === n.getFullYear() && d.getMonth() === n.getMonth() && d.getDate() === n.getDate()
}
function distKm(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const R = 6371, toRad = (x: number) => (x * Math.PI) / 180
  const dLat = toRad(bLat - aLat), dLng = toRad(bLng - aLng)
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(s))
}
const DISMISS_KEY = (id: string) => `meetup-toast-dismissed:${id}`

export function MeetupTodayToast() {
  const [event, setEvent] = useState<Meetup | null>(null)
  const [pos, setPos] = useState(() => gpsStore.getPosition())

  useEffect(() => {
    meetupStore.fetch()
    function pick() {
      const today = meetupStore.getState().meetups
        .filter((m) => isToday(m.date))
        .filter((m) => {
          try { return sessionStorage.getItem(DISMISS_KEY(m.id)) == null } catch { return true }
        })
        .sort((a, b) => a.date.localeCompare(b.date))
      setEvent(today[0] ?? null)
    }
    pick()
    const unsubStore = meetupStore.subscribe(pick)
    const unsubGps = gpsStore.onPosition((p) => setPos(p))
    return () => { unsubStore(); unsubGps() }
  }, [])

  if (!event) return null

  const km = pos ? distKm(pos.lat, pos.lng, event.lat, event.lng) : null
  const dist = km == null ? '' : km < 1 ? ` · ${Math.round(km * 1000)} м` : ` · ${km.toFixed(km < 10 ? 1 : 0)} км`

  function dismiss(e: React.MouseEvent) {
    e.stopPropagation()
    if (event) { try { sessionStorage.setItem(DISMISS_KEY(event.id), '1') } catch { /* */ } }
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
        <span style={{ fontSize: 12, fontWeight: 700, opacity: 0.85 }}>{t('meetup.todayEvent')}{dist}</span>
        <span style={{ fontSize: 14, fontWeight: 800, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '70vw' }}>{event.title}</span>
      </div>
      <button onClick={dismiss} style={{ background: 'rgba(255,255,255,0.18)', color: '#fff', border: 'none', borderRadius: 8, width: 26, height: 26, fontSize: 14, cursor: 'pointer', flexShrink: 0 }}>✕</button>
    </div>
  )
}
