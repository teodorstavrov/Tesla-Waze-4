// ─── EV Marker Layer ───────────────────────────────────────────────────
//
// Null-render React component managing Leaflet markers imperatively.
//
// ZOOM-AWARE RENDERING
// ──────────────────────────────────────────────────────────────────────
// zoom < CLUSTER_ZOOM  → cluster mode: one circle per 0.5° grid cell
// zoom >= CLUSTER_ZOOM → individual CircleMarkers, stable registry diff
//
// STABLE MARKER REGISTRY
// ──────────────────────────────────────────────────────────────────────
// Map<id, CircleMarker> diff on every store update:
//   • New stations (pass filter) → create marker
//   • Gone / filtered-out stations → remove marker
//   • Existing + still matching → untouched
//
// clearLayers() is NEVER called — full DOM thrash on Tesla browser.

import { useEffect, useRef } from 'react'
import { L } from '@/lib/leaflet'
import { getMap } from '@/components/MapShell'
import { evStore } from './evStore.js'
import { filterStore } from './filterStore.js'
import { routeStore } from '@/features/route/routeStore'
import { logger } from '@/lib/logger'
import type { NormalizedStation } from './types.js'

// ── Constants ─────────────────────────────────────────────────────

const CLUSTER_ZOOM     = 11       // zoom < this → cluster mode
const CLUSTER_CELL_DEG = 0.5      // ~50km grid cell

// ── Marker appearance ──────────────────────────────────────────────

function fillColor(s: NormalizedStation): string {
  if (s.status === 'offline' || s.status === 'planned') return '#888'
  if (s.source === 'tesla') return '#e31937'
  // Power-based color: ultra-fast = amber, fast = green, normal = blue
  if (s.maxPowerKw != null && s.maxPowerKw >= 150) return '#F59E0B'
  if (s.maxPowerKw != null && s.maxPowerKw >= 50)  return '#22c55e'
  return '#2B7FFF'
}

function markerRadius(s: NormalizedStation): number {
  if (s.source === 'tesla')                                  return 9
  if (s.maxPowerKw != null && s.maxPowerKw >= 150)           return 8
  if (s.maxPowerKw != null && s.maxPowerKw >= 50)            return 7
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
  if (s.totalPorts > 1) parts.push(`${s.totalPorts} порта`)
  return parts.join(' · ')
}

// ── Cluster helpers ───────────────────────────────────────────────

interface ClusterCell {
  lat:      number
  lng:      number
  count:    number
  maxPower: number | null
}

function buildClusters(stations: NormalizedStation[]): Map<string, ClusterCell> {
  const cells = new Map<string, ClusterCell>()
  for (const s of stations) {
    const cellLat = Math.floor(s.lat / CLUSTER_CELL_DEG)
    const cellLng = Math.floor(s.lng / CLUSTER_CELL_DEG)
    const key = `${cellLat}_${cellLng}`
    const existing = cells.get(key)
    if (existing) {
      existing.count++
      if (s.maxPowerKw != null) {
        existing.maxPower = Math.max(existing.maxPower ?? 0, s.maxPowerKw)
      }
    } else {
      cells.set(key, {
        lat:      (cellLat + 0.5) * CLUSTER_CELL_DEG,
        lng:      (cellLng + 0.5) * CLUSTER_CELL_DEG,
        count:    1,
        maxPower: s.maxPowerKw,
      })
    }
  }
  return cells
}

function clusterRadius(count: number): number {
  if (count >= 50) return 26
  if (count >= 10) return 22
  return 18
}

function clusterColor(maxPower: number | null): string {
  if (maxPower != null && maxPower >= 150) return '#F59E0B'
  if (maxPower != null && maxPower >= 50)  return '#22c55e'
  return '#2B7FFF'
}

function makeClusterIcon(count: number, maxPower: number | null): L.DivIcon {
  const r     = clusterRadius(count)
  const color = clusterColor(maxPower)
  const size  = r * 2
  return L.divIcon({
    className: '',
    html: `<div style="
      width:${size}px;height:${size}px;border-radius:50%;
      background:${color};opacity:0.88;
      border:2px solid #fff;
      box-shadow:0 2px 8px rgba(0,0,0,0.45);
      display:flex;align-items:center;justify-content:center;
      font-size:${count >= 100 ? 10 : 12}px;font-weight:700;color:#fff;
      line-height:1;
    ">${count}</div>`,
    iconSize:   [size, size],
    iconAnchor: [r, r],
  })
}

// ── Route proximity ───────────────────────────────────────────────

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

// ── Component ─────────────────────────────────────────────────────

export function EvMarkerLayer() {
  const registryRef      = useRef<Map<string, L.CircleMarker>>(new Map())
  const clusterRegistryRef = useRef<Map<string, L.Marker>>(new Map())
  const nearRouteRef     = useRef<Set<string>>(new Set())
  const zoomRef          = useRef<number>(13)

  useEffect(() => {
    let cancelled = false
    let moveTimer: ReturnType<typeof setTimeout> | null = null

    function init(map: L.Map): () => void {
      const registry        = registryRef.current
      const clusterRegistry = clusterRegistryRef.current
      zoomRef.current       = map.getZoom()

      // ── Clear all markers ─────────────────────────────────────
      function clearAll(): void {
        for (const m of registry.values()) m.remove()
        registry.clear()
        for (const m of clusterRegistry.values()) m.remove()
        clusterRegistry.clear()
      }

      // ── Cluster mode ──────────────────────────────────────────
      function syncClusters(): void {
        const stations = filterStore.getFilteredStations()
        const cells    = buildClusters(stations)
        const incoming = new Set(cells.keys())

        // Remove stale cluster markers
        for (const [key, marker] of clusterRegistry) {
          if (!incoming.has(key)) { marker.remove(); clusterRegistry.delete(key) }
        }

        // Add / update cluster markers
        for (const [key, cell] of cells) {
          const existing = clusterRegistry.get(key)
          if (existing) {
            // Update icon in case count changed
            existing.setIcon(makeClusterIcon(cell.count, cell.maxPower))
          } else {
            const marker = L.marker([cell.lat, cell.lng], {
              icon: makeClusterIcon(cell.count, cell.maxPower),
              zIndexOffset: 10,
            }).addTo(map)
            // Tap cluster → zoom into its centre
            marker.on('click', () => {
              map.setView([cell.lat, cell.lng], CLUSTER_ZOOM, { animate: true })
            })
            clusterRegistry.set(key, marker)
          }
        }
      }

      // ── Individual mode ───────────────────────────────────────
      function syncNearRoute(): void {
        const { route } = routeStore.getState()
        const stations  = filterStore.getFilteredStations()
        const next      = route ? buildNearRouteSet(stations, route.polyline) : new Set<string>()
        const prev      = nearRouteRef.current
        const changed   =
          next.size !== prev.size ||
          [...next].some((id) => !prev.has(id)) ||
          [...prev].some((id) => !next.has(id))
        if (!changed) return
        nearRouteRef.current = next
        for (const [id, marker] of registry) {
          const station = filterStore.getFilteredStations().find((s) => s.id === id)
          if (station) marker.setStyle(makeMarkerOptions(station, next.has(id)))
        }
      }

      function syncMarkers(): void {
        const { markersVisible } = evStore.getState()
        if (!markersVisible) { clearAll(); return }

        // Use clusters at low zoom
        if (zoomRef.current < CLUSTER_ZOOM) {
          // Remove individual markers if any
          for (const m of registry.values()) m.remove()
          registry.clear()
          syncClusters()
          return
        }

        // Remove cluster markers if any
        for (const m of clusterRegistry.values()) m.remove()
        clusterRegistry.clear()

        const stations  = filterStore.getFilteredStations()
        const nearRoute = nearRouteRef.current
        const incoming  = new Set(stations.map((s) => s.id))

        for (const [id, marker] of registry) {
          if (!incoming.has(id)) { marker.remove(); registry.delete(id) }
        }

        for (const station of stations) {
          if (registry.has(station.id)) continue
          const marker = L.circleMarker(
            [station.lat, station.lng],
            makeMarkerOptions(station, nearRoute.has(station.id)),
          ).addTo(map)
          marker.bindTooltip(tooltipContent(station), {
            direction: 'top', offset: L.point(0, -6), className: 'ev-tooltip', sticky: false,
          })
          marker.on('click', () => {
            evStore.selectStation(station)
            logger.ev.debug('Station selected', { id: station.id })
          })
          registry.set(station.id, marker)
        }
      }

      // Subscriptions
      const unsubEv     = evStore.subscribe(syncMarkers)
      const unsubFilter = filterStore.subscribe(() => { syncNearRoute(); syncMarkers() })
      const unsubRoute  = routeStore.subscribe(() => { syncNearRoute() })

      // Initial sync
      syncMarkers()

      // Fetch on moveend (debounced 400ms)
      function onMoveEnd(): void {
        if (moveTimer) clearTimeout(moveTimer)
        moveTimer = setTimeout(() => {
          const b = map.getBounds()
          evStore.fetch({
            minLat: b.getSouth(), minLng: b.getWest(),
            maxLat: b.getNorth(), maxLng: b.getEast(),
          })
        }, 400)
      }

      // Re-render on zoom change (may switch between cluster/individual modes)
      function onZoomEnd(): void {
        zoomRef.current = map.getZoom()
        syncMarkers()
      }

      map.on('moveend', onMoveEnd)
      map.on('zoomend', onZoomEnd)

      // Initial fetch
      const b = map.getBounds()
      evStore.fetch({
        minLat: b.getSouth(), minLng: b.getWest(),
        maxLat: b.getNorth(), maxLng: b.getEast(),
      })

      logger.ev.debug('EvMarkerLayer initialized')

      return () => {
        if (moveTimer) clearTimeout(moveTimer)
        map.off('moveend', onMoveEnd)
        map.off('zoomend', onZoomEnd)
        unsubEv(); unsubFilter(); unsubRoute()
        clearAll()
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
