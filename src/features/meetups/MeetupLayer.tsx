// ─── Community Event (Meetup) marker layer ──────────────────────────────
// Null-render component that imperatively manages 📅 markers on the map.

import { useEffect, useRef } from 'react'
import * as maplibregl from 'maplibre-gl'
import { getMap } from '@/components/MapShell'
import { meetupStore } from './meetupStore'

function makeElement(): HTMLDivElement {
  const el = document.createElement('div')
  el.className = 'meetup-marker'
  el.style.cssText = [
    'width:34px', 'height:34px', 'display:flex', 'align-items:center', 'justify-content:center',
    'background:#6366f1', 'border:2.5px solid rgba(255,255,255,0.9)', 'border-radius:50%',
    'box-shadow:0 3px 12px rgba(0,0,0,0.55)', 'font-size:18px', 'cursor:pointer',
  ].join(';')
  el.textContent = '📅'
  return el
}

export function MeetupLayer() {
  const markers = useRef<Map<string, maplibregl.Marker>>(new Map())

  useEffect(() => {
    meetupStore.fetch()

    function render() {
      const map = getMap()
      if (!map) return
      const { meetups } = meetupStore.getState()
      const seen = new Set<string>()

      for (const m of meetups) {
        seen.add(m.id)
        if (!markers.current.has(m.id)) {
          const el = makeElement()
          const id = m.id
          el.addEventListener('click', () => {
            const latest = meetupStore.getState().meetups.find((x) => x.id === id)
            if (latest) meetupStore.select(latest)
          })
          const mk = new maplibregl.Marker({ element: el, anchor: 'center' })
            .setLngLat([m.lng, m.lat])
            .addTo(map)
          markers.current.set(m.id, mk)
        }
      }

      for (const [id, mk] of markers.current) {
        if (!seen.has(id)) { mk.remove(); markers.current.delete(id) }
      }
    }

    render()
    const unsub = meetupStore.subscribe(render)
    return () => {
      unsub()
      for (const mk of markers.current.values()) mk.remove()
      markers.current.clear()
    }
  }, [])

  return null
}
