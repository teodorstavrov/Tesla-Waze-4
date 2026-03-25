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
// Subscribes to evStore (new data), filterStore (filter changes),
// and routeStore (route changes → highlight nearby stations).

import { useEffect, useRef } from 'react'
import { L } from '@/lib/leaflet'
import { getMap } from '@/components/MapShell'
import { evStore } from './evStore.js'
import { filterStore } from './filterStore.js'
import { routeStore } from '@/features/route/routeStore'
import { logger } from '@/lib/logger'
import type { NormalizedStation } from './types.js'

// ── Route proximity helpers ───────────────────────────────────────

function isNearRoute(lat: number, lng: number, polyline: [number, number][], thresholdM: number): boolean {
  const tLat = thresholdM / 111000
  const tLng = thresholdM / 80000
  for (const [plat, plng] of polyline) {
    if (Math.abs(lat - plat) < tLat && Math.abs(lng - plng) < tLng) return true
  }
  return false
}

function buildNearRouteSet(stations: NormalizedStation[], polyline: [number, number][]): Set<string> {
  const s = new Set<string>()
  for (const st of stations) {
    if (isNearRoute(st.lat, st.lng, polyline, 2000)) s.add(st.id)
  }
  return s
}

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

function makeMarkerOptions(s: NormalizedStation, nearRoute = false): L.CircleMarkerOptions {
  return {
    radius:      nearRoute ? markerRadius(s) + 2 : markerRadius(s),
    fillColor:   fillColor(s),
    fillOpacity: s.status === 'offline' ? 0.4 : 0.88,
    color:       nearRoute ? '#FFD700' : '#fff',
    weight:      nearRoute ? 3 : 1.5,
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
  const registryRef    = useRef<Map<string, L.CircleMarker>>(new Map())
  const nearRouteRef   = useRef<Set<string>>(new Set())

  useEffect(() => {
    let cancelled = false
    let moveTimer: ReturnType<typeof setTimeout> | null = null

    function init(map: L.Map): () => void {
      const registry = registryRef.current

      // ── Recompute near-route set when route changes ───────────────
      function syncNearRoute(): void {
        const { route } = routeStore.getState()
        const stations  = filterStore.getFilteredStations()
        const next = route ? buildNearRouteSet(stations, route.polyline) : new Set<string>()

        // Only restyle if set changed
        const prev = nearRouteRef.current
        const changed =
          next.size !== prev.size ||
          [...next].some((id) => !prev.has(id)) ||
          [...prev].some((id) => !next.has(id))

        if (!changed) return

        nearRouteRef.current = next

        // Update existing marker styles
        for (const [id, marker] of registry) {
          const station = filterStore.getFilteredStations().find((s) => s.id === id)
          if (station) marker.setStyle(makeMarkerOptions(station, next.has(id)))
        }
      }

      // ── Sync markers from filtered stations ──────────────────────
      function syncMarkers(): void {
        const { markersVisible } = evStore.getState()

        if (!markersVisible) {
          for (const marker of registry.values()) marker.remove()
          registry.clear()
          return
        }

        const stations   = filterStore.getFilteredStations()
        const nearRoute  = nearRouteRef.current
        const incoming   = new Set(stations.map((s) => s.id))

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
            makeMarkerOptions(station, nearRoute.has(station.id)),
          ).addTo(map)

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

      // Subscribe to evStore, filterStore, and routeStore
      const unsubEv     = evStore.subscribe(syncMarkers)
      const unsubFilter = filterStore.subscribe(() => { syncNearRoute(); syncMarkers() })
      const unsubRoute  = routeStore.subscribe(() => { syncNearRoute() })

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
        unsubRoute()
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
