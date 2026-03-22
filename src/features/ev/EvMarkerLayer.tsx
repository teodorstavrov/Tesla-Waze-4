// ─── EV Marker Layer ───────────────────────────────────────────────────
//
// Null-render React component managing Leaflet CircleMarkers imperatively.
//
// STABLE MARKER REGISTRY
// ──────────────────────────────────────────────────────────────────────
// Map<id, CircleMarker> diff on every store update:
//   • New stations (pass filter) → create marker
//   • Gone / filtered-out stations → remove marker
//   • Existing + still matching → untouched
//
// clearLayers() is NEVER called — full DOM thrash on Tesla browser.
//
// FILTERS
// ──────────────────────────────────────────────────────────────────────
// Subscribes to both evStore (new data) and filterStore (filter changes).
// Uses filterStore.getFilteredStations() as the source of truth.

import { useEffect, useRef } from 'react'
import { L } from '@/lib/leaflet'
import { getMap } from '@/components/MapShell'
import { evStore } from './evStore.js'
import { filterStore } from './filterStore.js'
import { logger } from '@/lib/logger'
import type { NormalizedStation } from './types.js'

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
  if (s.maxPowerKw != null && s.maxPowerKw >= 150) return 8  // ultra-fast
  if (s.maxPowerKw != null && s.maxPowerKw >= 50)  return 7  // fast
  return 5
}

function makeMarkerOptions(s: NormalizedStation): L.CircleMarkerOptions {
  return {
    radius:      markerRadius(s),
    fillColor:   fillColor(s),
    fillOpacity: s.status === 'offline' ? 0.4 : 0.88,
    color:       '#fff',
    weight:      1.5,
    opacity:     0.9,
  }
}

function tooltipContent(s: NormalizedStation): string {
  const parts = [s.name]
  if (s.maxPowerKw) parts.push(`${s.maxPowerKw} kW`)
  if (s.totalPorts > 1) parts.push(`${s.totalPorts} ports`)
  return parts.join(' · ')
}

// ── Component ─────────────────────────────────────────────────────

export function EvMarkerLayer() {
  const registryRef = useRef<Map<string, L.CircleMarker>>(new Map())

  useEffect(() => {
    let cancelled = false
    let moveTimer: ReturnType<typeof setTimeout> | null = null

    function init(map: L.Map): () => void {
      const registry = registryRef.current

      // ── Sync markers from filtered stations ──────────────────────
      function syncMarkers(): void {
        const { markersVisible } = evStore.getState()

        if (!markersVisible) {
          for (const marker of registry.values()) marker.remove()
          registry.clear()
          return
        }

        const stations = filterStore.getFilteredStations()
        const incoming = new Set(stations.map((s) => s.id))

        // Remove markers for stations no longer in filtered set
        for (const [id, marker] of registry) {
          if (!incoming.has(id)) {
            marker.remove()
            registry.delete(id)
          }
        }

        // Add markers for newly visible stations
        for (const station of stations) {
          if (registry.has(station.id)) continue

          const marker = L.circleMarker(
            [station.lat, station.lng],
            makeMarkerOptions(station),
          ).addTo(map)

          // Tooltip — shows on hover (desktop dev); invisible on touch
          marker.bindTooltip(tooltipContent(station), {
            direction: 'top',
            offset: L.point(0, -6),
            className: 'ev-tooltip',
            sticky: false,
          })

          marker.on('click', () => {
            evStore.selectStation(station)
            logger.ev.debug('Station selected', { id: station.id })
          })

          registry.set(station.id, marker)
        }
      }

      // Subscribe to both evStore and filterStore
      const unsubEv = evStore.subscribe(syncMarkers)
      const unsubFilter = filterStore.subscribe(syncMarkers)

      // Initial sync
      syncMarkers()

      // Fetch on map moveend (debounced 400ms)
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

      // Initial fetch for current view
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
        unsubEv()
        unsubFilter()
        for (const marker of registry.values()) marker.remove()
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
      return () => {
        cancelled = true
        cancelAnimationFrame(frame)
      }
    }

    return () => {
      cancelled = true
      cleanup?.()
    }
  }, [])

  return null
}
