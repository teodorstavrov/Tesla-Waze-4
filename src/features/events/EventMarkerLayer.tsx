// ─── Event Marker Layer ────────────────────────────────────────────────
// Null-render component. DOM-element markers — events need distinct
// emoji/icon visuals.
//
// Each marker shows a colored circle with emoji.
// Time info is shown in EventPanel when the marker is tapped.

import { useEffect, useRef } from 'react'
import * as maplibregl from 'maplibre-gl'
import { getMap } from '@/components/MapShell'
import { eventStore } from './eventStore.js'
import { EVENT_EMOJI, EVENT_COLORS } from './types.js'
import { logger } from '@/lib/logger'
import { isTeslaBrowser } from '@/lib/browser'
import { getActivePerformanceProfile } from '@/config/performanceProfiles'
import type { RoadEvent } from './types.js'

const NEW_THRESHOLD_MS = 2 * 60 * 1000

function makeElement(event: RoadEvent): HTMLDivElement {
  const color = EVENT_COLORS[event.type] ?? '#888'
  const emoji = EVENT_EMOJI[event.type]  ?? '📍'
  const isNew = Date.now() - new Date(event.reportedAt).getTime() < NEW_THRESHOLD_MS
  const profile = getActivePerformanceProfile()
  const animation = (!isTeslaBrowser && isNew && profile.useMarkerAnimations)
    ? 'event-new-pulse 0.9s ease-out 3'
    : 'none'

  const isPolice = event.type === 'police'
  const bg      = isPolice ? color          : `${color}22`
  const border  = isPolice ? '3px solid #fff' : `2px solid ${color}`
  const shadow  = isPolice ? '0 2px 10px rgba(0,0,0,0.7)' : '0 2px 8px rgba(0,0,0,0.55)'
  const size    = isPolice ? 40 : 36
  const font    = isPolice ? 19 : 17

  const wrap = document.createElement('div')
  wrap.className = 'marker-scale-wrap'
  wrap.style.cursor = 'pointer'

  const inner = document.createElement('div')
  inner.style.cssText = [
    `width:${size}px`, `height:${size}px`, 'border-radius:50%',
    `background:${bg}`, `border:${border}`,
    'display:flex', 'align-items:center', 'justify-content:center',
    `font-size:${font}px`, 'line-height:1',
    `box-shadow:${shadow}`,
    `animation:${animation}`,
  ].join(';')
  inner.textContent = emoji
  wrap.appendChild(inner)
  return wrap
}

export function EventMarkerLayer() {
  const registryRef = useRef<Map<string, maplibregl.Marker>>(new Map())

  useEffect(() => {
    let cancelled = false
    let moveTimer: ReturnType<typeof setTimeout> | null = null

    function init(map: maplibregl.Map): () => void {
      const registry = registryRef.current

      function syncMarkers(): void {
        const { events } = eventStore.getState()
        const incoming = new Set(events.map((e) => e.id))

        for (const [id, marker] of registry) {
          if (!incoming.has(id)) { marker.remove(); registry.delete(id) }
        }

        for (const event of events) {
          if (registry.has(event.id)) continue

          const el = makeElement(event)
          el.addEventListener('click', () => {
            eventStore.selectEvent(event)
            logger.events.debug('Event selected', { id: event.id, type: event.type })
          })

          const marker = new maplibregl.Marker({ element: el, anchor: 'center' })
            .setLngLat([event.lng, event.lat])
            .addTo(map)

          registry.set(event.id, marker)
        }
      }

      const unsub = eventStore.subscribe(syncMarkers)
      syncMarkers()

      function onMoveEnd(): void {
        if (moveTimer) clearTimeout(moveTimer)
        const debounce = getActivePerformanceProfile().mapMoveDebounceMs
        moveTimer = setTimeout(() => {
          const b = map.getBounds()
          eventStore.fetch({
            minLat: b.getSouth(), minLng: b.getWest(),
            maxLat: b.getNorth(), maxLng: b.getEast(),
          })
        }, debounce)
      }

      map.on('moveend', onMoveEnd)

      const b = map.getBounds()
      eventStore.fetch({
        minLat: b.getSouth(), minLng: b.getWest(),
        maxLat: b.getNorth(), maxLng: b.getEast(),
      })

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
