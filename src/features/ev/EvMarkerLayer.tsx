// ─── EV Marker Layer ───────────────────────────────────────────────────
//
// Null-render React component that manages Leaflet CircleMarkers for EV
// stations imperatively. Zero React output — all work done in useEffect.
//
// STABLE MARKER REGISTRY
// ──────────────────────────────────────────────────────────────────────
// A Map<id, CircleMarker> is kept in a ref. On each store update:
//   • New stations → create marker + add to map
//   • Gone stations → remove from map + delete from registry
//   • Existing stations → untouched (no style update needed in Phase 4)
//
// clearLayers() is NEVER called — it would cause a full DOM thrash on
// every fetch which freezes the Tesla browser.
//
// CANVAS RENDERING
// ──────────────────────────────────────────────────────────────────────
// The map is initialized with preferCanvas: true. All CircleMarkers are
// drawn on a single <canvas> — far fewer DOM nodes than SVG/DivIcon.
// ~800 circle markers = ~800 JS objects but only 1 DOM canvas element.

import { useEffect, useRef } from 'react'
import { L } from '@/lib/leaflet'
import { getMap } from '@/components/MapShell'
import { evStore } from './evStore'
import { logger } from '@/lib/logger'
import type { NormalizedStation } from './types'

// ── Marker appearance ──────────────────────────────────────────────

const SOURCE_COLOR: Record<string, string> = {
  tesla: '#e31937',
  ocm:   '#2B7FFF',
  osm:   '#22c55e',
}

function fillColor(s: NormalizedStation): string {
  if (s.status === 'offline' || s.status === 'planned') return '#888'
  return SOURCE_COLOR[s.source] ?? '#999'
}

function markerRadius(s: NormalizedStation): number {
  if (s.source === 'tesla') return 9
  if (s.maxPowerKw != null && s.maxPowerKw >= 100) return 8  // fast charger
  return 6
}

function makeMarkerOptions(s: NormalizedStation): L.CircleMarkerOptions {
  return {
    radius:      markerRadius(s),
    fillColor:   fillColor(s),
    fillOpacity: s.status === 'offline' ? 0.45 : 0.88,
    color:       '#fff',
    weight:      1.5,
    opacity:     0.9,
    // pane defaults to 'markerPane' which sits above tiles
  }
}

// ── Component ─────────────────────────────────────────────────────

export function EvMarkerLayer() {
  const registryRef = useRef<Map<string, L.CircleMarker>>(new Map())

  useEffect(() => {
    // MapShell's effect may not have run yet on first render.
    // Use rAF to let it complete, then initialize.
    let cancelled = false
    let moveTimer: ReturnType<typeof setTimeout> | null = null
    let unsub: (() => void) | null = null

    function init(map: L.Map): () => void {
      const registry = registryRef.current

      // ── Sync markers from store ──────────────────────────────────
      function syncMarkers(): void {
        const { stations, markersVisible } = evStore.getState()

        if (!markersVisible) {
          // Hide all markers
          for (const marker of registry.values()) marker.remove()
          registry.clear()
          return
        }

        const incoming = new Set(stations.map((s) => s.id))

        // Remove markers for stations no longer in the result
        for (const [id, marker] of registry) {
          if (!incoming.has(id)) {
            marker.remove()
            registry.delete(id)
          }
        }

        // Add markers for new stations
        for (const station of stations) {
          if (registry.has(station.id)) continue

          const marker = L.circleMarker(
            [station.lat, station.lng],
            makeMarkerOptions(station),
          ).addTo(map)

          marker.on('click', () => {
            evStore.selectStation(station)
            logger.ev.debug('Station selected', { id: station.id, name: station.name })
          })

          registry.set(station.id, marker)
        }
      }

      // ── Subscribe to store ───────────────────────────────────────
      unsub = evStore.subscribe(syncMarkers)

      // Initial sync from any already-loaded data
      syncMarkers()

      // ── Fetch on map moveend (debounced 400ms) ───────────────────
      function onMoveEnd(): void {
        if (moveTimer) clearTimeout(moveTimer)
        moveTimer = setTimeout(() => {
          const b = map.getBounds()
          evStore.fetch({
            minLat: b.getSouth(),
            minLng: b.getWest(),
            maxLat: b.getNorth(),
            maxLng: b.getEast(),
          })
        }, 400)
      }

      map.on('moveend', onMoveEnd)

      // ── Initial fetch for current view ───────────────────────────
      const b = map.getBounds()
      evStore.fetch({
        minLat: b.getSouth(),
        minLng: b.getWest(),
        maxLat: b.getNorth(),
        maxLng: b.getEast(),
      })

      logger.ev.debug('EvMarkerLayer initialized')

      return () => {
        if (moveTimer) clearTimeout(moveTimer)
        map.off('moveend', onMoveEnd)
        unsub?.()
        for (const marker of registry.values()) marker.remove()
        registry.clear()
      }
    }

    let cleanup: (() => void) | null = null

    // Try immediately, fall back to rAF if map not ready
    const map = getMap()
    if (map) {
      cleanup = init(map)
    } else {
      const frame = requestAnimationFrame(() => {
        if (cancelled) return
        const m = getMap()
        if (m) cleanup = init(m)
      })
      return () => {
        cancelled = true
        cancelAnimationFrame(frame)
        unsub?.()
      }
    }

    return () => {
      cancelled = true
      cleanup?.()
    }
  }, [])

  return null
}
