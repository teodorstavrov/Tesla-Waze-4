// ─── Community Event (Meetup) marker layer ──────────────────────────────
// Null-render component that imperatively manages 📅 markers on the map.
// Events are few, so no clustering — a simple id-keyed registry diff.

import { useEffect, useRef } from 'react'
import { L } from '@/lib/leaflet'
import { getMap } from '@/components/MapShell'
import { meetupStore } from './meetupStore'
import type { Meetup } from './types'

function icon(): L.DivIcon {
  return L.divIcon({
    className: 'meetup-marker',
    html: `<div style="width:34px;height:34px;display:flex;align-items:center;justify-content:center;
      background:#6366f1;border:2.5px solid rgba(255,255,255,0.9);border-radius:50%;
      box-shadow:0 3px 12px rgba(0,0,0,0.55);font-size:18px;">📅</div>`,
    iconSize: [44, 44],
    iconAnchor: [22, 22],
    popupAnchor: [0, -18],
  })
}

function popupHtml(m: Meetup): string {
  const d = new Date(m.date)
  const when = isNaN(d.getTime()) ? m.date
    : d.toLocaleString('bg-BG', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
  const esc = (s: string) => s.replace(/[<>&]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' }[c] ?? c))
  const lines = [
    `<div style="font-weight:800;font-size:15px;margin-bottom:4px">${esc(m.title)}</div>`,
    `<div style="font-size:12px;color:#a5b4fc;margin-bottom:6px">📅 ${esc(when)}</div>`,
  ]
  if (m.organizer)   lines.push(`<div style="font-size:12px;color:rgba(255,255,255,0.7)">👤 ${esc(m.organizer)}</div>`)
  if (m.facebookUrl) lines.push(`<a href="${esc(m.facebookUrl)}" target="_blank" rel="noopener noreferrer" style="font-size:12px;color:#60a5fa">Facebook група</a>`)
  return `<div style="min-width:160px;max-width:240px">${lines.join('')}</div>`
}

export function MeetupLayer() {
  const markers = useRef<Map<string, L.Marker>>(new Map())

  useEffect(() => {
    meetupStore.fetch()

    function render() {
      const map = getMap()
      if (!map) return
      const { meetups } = meetupStore.getState()
      const seen = new Set<string>()

      for (const m of meetups) {
        seen.add(m.id)
        let mk = markers.current.get(m.id)
        if (!mk) {
          mk = L.marker([m.lat, m.lng], { icon: icon() })
          mk.bindPopup(popupHtml(m), { className: 'meetup-popup', maxWidth: 260 })
          mk.addTo(map)
          markers.current.set(m.id, mk)
        }
      }
      // Remove markers whose meetup is gone
      for (const [id, mk] of markers.current) {
        if (!seen.has(id)) { map.removeLayer(mk); markers.current.delete(id) }
      }
    }

    render()
    const unsub = meetupStore.subscribe(render)
    return () => {
      unsub()
      const map = getMap()
      for (const mk of markers.current.values()) { if (map) map.removeLayer(mk) }
      markers.current.clear()
    }
  }, [])

  return null
}
