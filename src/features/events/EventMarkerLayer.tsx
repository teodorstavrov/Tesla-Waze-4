// ─── Event Marker Layer ────────────────────────────────────────────────
// Null-render component. DivIcon markers (not canvas) — events are few
// and need distinct emoji/icon visuals that canvas can't render.

import { useEffect, useRef } from 'react'
import { L } from '@/lib/leaflet'
import { getMap } from '@/components/MapShell'
import { eventStore } from './eventStore.js'
import { EVENT_EMOJI, EVENT_COLORS } from './types.js'
import { logger } from '@/lib/logger'
import type { RoadEvent } from './types.js'

function makeIcon(event: RoadEvent): L.DivIcon {
  const color = EVENT_COLORS[event.type] ?? '#888'
  const emoji = EVENT_EMOJI[event.type] ?? '📍'
  return L.divIcon({
    className: '',
    html: `
      <div style="
        width:36px; height:36px; border-radius:50%;
        background:${color}22; border:2px solid ${color};
        display:flex; align-items:center; justify-content:center;
        font-size:17px; line-height:1;
        box-shadow:0 2px 8px rgba(0,0,0,0.55);
        cursor:pointer;
      ">${emoji}</div>`,
    iconSize:   [36, 36],
    iconAnchor: [18, 18],
  })
}

export function EventMarkerLayer() {
  const registryRef = useRef<Map<string, L.Marker>>(new Map())

  useEffect(() => {
    let cancelled = false
    let moveTimer: ReturnType<typeof setTimeout> | null = null

    function init(map: L.Map): () => void {
      const registry = registryRef.current

      function syncMarkers(): void {
        const { events } = eventStore.getState()
        const incoming = new Set(events.map((e) => e.id))

        // Remove gone events
        for (const [id, marker] of registry) {
          if (!incoming.has(id)) { marker.remove(); registry.delete(id) }
        }

        // Add new events
        for (const event of events) {
          if (registry.has(event.id)) continue

          const marker = L.marker([event.lat, event.lng], {
            icon: makeIcon(event),
            zIndexOffset: 100,
          }).addTo(map)

          marker.on('click', () => {
            eventStore.selectEvent(event)
            logger.events.debug('Event selected', { id: event.id, type: event.type })
          })

          registry.set(event.id, marker)
        }
      }

      const unsub = eventStore.subscribe(syncMarkers)
      syncMarkers()

      function onMoveEnd(): void {
        if (moveTimer) clearTimeout(moveTimer)
        moveTimer = setTimeout(() => {
          const b = map.getBounds()
          eventStore.fetch({ minLat: b.getSouth(), minLng: b.getWest(), maxLat: b.getNorth(), maxLng: b.getEast() })
        }, 400)
      }

      map.on('moveend', onMoveEnd)

      // Initial fetch
      const b = map.getBounds()
      eventStore.fetch({ minLat: b.getSouth(), minLng: b.getWest(), maxLat: b.getNorth(), maxLng: b.getEast() })

      return () => {
        if (moveTimer) clearTimeout(moveTimer)
        map.off('moveend', onMoveEnd)
        unsub()
        for (const m of registry.values()) m.remove()
        registry.clear()
      }
    }

    let cleanup: (() => void) | null = null
    const map = getMap()
    if (map) {
      cleanup = init(map)
    } else {
      const frame = requestAnimationFrame(() => {
        if (cancelled) return
        const m = getMap()
        if (m) cleanup = init(m)
      })
      return () => { cancelled = true; cancelAnimationFrame(frame) }
    }

    return () => { cancelled = true; cleanup?.() }
  }, [])

  return null
}
