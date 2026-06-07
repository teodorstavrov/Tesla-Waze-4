// ─── Community Event (Meetup) marker layer ──────────────────────────────
// Null-render component that imperatively manages 📅 markers on the map.
// Events are few, so no clustering — a simple id-keyed registry diff.

import { useEffect, useRef } from 'react'
import { L } from '@/lib/leaflet'
import { getMap } from '@/components/MapShell'
import { meetupStore } from './meetupStore'

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
          const id = m.id
          mk.on('click', () => {
            const latest = meetupStore.getState().meetups.find((x) => x.id === id)
            if (latest) meetupStore.select(latest)
          })
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
