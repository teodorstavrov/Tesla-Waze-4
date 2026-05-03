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
import { countryStore } from '@/lib/countryStore'
import { logger } from '@/lib/logger'
import { getLang } from '@/lib/locale'
import { getActivePerformanceProfile } from '@/config/performanceProfiles'
import type { NormalizedStation } from './types.js'

// ── Constants ─────────────────────────────────────────────────────

const CLUSTER_ZOOM     = 11       // zoom < this → cluster mode
const CLUSTER_CELL_DEG = 0.5      // ~50km grid cell

// ── Marker appearance ──────────────────────────────────────────────
// DivIcon with ⚡ — 44×44px total hit area (Tesla touch target spec),
// 34×34px visible circle. Original color scheme preserved.

function stationColor(s: NormalizedStation): string {
  if (s.status === 'offline' || s.status === 'planned') return '#888'
  if (s.source === 'tesla')                              return '#e31937'
  if (s.maxPowerKw != null && s.maxPowerKw >= 150)       return '#F59E0B'
  if (s.maxPowerKw != null && s.maxPowerKw >= 50)        return '#22c55e'
  return '#FACC15'
}

function makeStationIcon(s: NormalizedStation, nearRoute = false): L.DivIcon {
  const color   = stationColor(s)
  const opacity = s.status === 'offline' || s.status === 'planned' ? 0.5 : 1
  const border  = nearRoute ? '3px solid #FFD700' : '2.5px solid rgba(255,255,255,0.9)'
  const shadow  = nearRoute
    ? '0 0 0 2px #FFD700, 0 3px 12px rgba(0,0,0,0.6)'
    : '0 3px 12px rgba(0,0,0,0.55)'

  return L.divIcon({
    className: '',   // no Leaflet default styles
    html: `<div class="marker-scale-wrap"><div style="
      width:44px;height:44px;
      display:flex;align-items:center;justify-content:center;
      cursor:pointer;
    "><div style="
      width:34px;height:34px;border-radius:50%;
      background:${color};opacity:${opacity};
      border:${border};
      box-shadow:${shadow};
      display:flex;align-items:center;justify-content:center;
      font-size:18px;line-height:1;
      user-select:none;-webkit-user-select:none;
    ">⚡</div></div></div>`,
    iconSize:   [44, 44],
    iconAnchor: [22, 22],
  })
}

function tooltipContent(s: NormalizedStation): string {
  const parts = [s.name]
  if (s.maxPowerKw) parts.push(`${s.maxPowerKw} kW`)
  if (s.totalPorts > 1) parts.push(`${s.totalPorts} ${getLang() === 'bg' ? 'порта' : 'ports'}`)
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
  return '#FACC15'
}

function makeClusterIcon(count: number, maxPower: number | null): L.DivIcon {
  const r     = clusterRadius(count)
  const color = clusterColor(maxPower)
  const size  = r * 2
  return L.divIcon({
    className: '',
    html: `<div class="marker-scale-wrap"><div style="
      width:${size}px;height:${size}px;border-radius:50%;
      background:${color};opacity:0.88;
      border:2px solid #fff;
      box-shadow:0 2px 8px rgba(0,0,0,0.45);
      display:flex;align-items:center;justify-content:center;
      font-size:${count >= 100 ? 10 : 12}px;font-weight:700;color:#fff;
      line-height:1;
    ">${count}</div></div>`,
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
  const registryRef      = useRef<Map<string, L.Marker>>(new Map())
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
          if (station) marker.setIcon(makeStationIcon(station, next.has(id)))
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
          const marker = L.marker(
            [station.lat, station.lng],
            { icon: makeStationIcon(station, nearRoute.has(station.id)) },
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

      // Fetch ALL stations for the current country in one request.
      // With ~400-500 stations per country the payload is small enough to load in full;
      // no viewport-based pagination needed — avoids stations disappearing on pan.
      function fetchCountry(): void {
        const [[swLat, swLng], [neLat, neLng]] = countryStore.getCountryOrDefault().bounds
        evStore.fetch({ minLat: swLat, minLng: swLng, maxLat: neLat, maxLng: neLng })
      }
      fetchCountry()

      // Re-fetch when user switches country
      const unsubCountry = countryStore.subscribe(() => { clearAll(); fetchCountry() })

      // Re-render on moveend (no re-fetch — we already have all country stations)
      function onMoveEnd(): void {
        if (moveTimer) clearTimeout(moveTimer)
        const debounce = getActivePerformanceProfile().evDebounceMs
        moveTimer = setTimeout(syncMarkers, debounce)
      }

      // Re-render on zoom change (may switch between cluster/individual modes)
      function onZoomEnd(): void {
        zoomRef.current = map.getZoom()
        syncMarkers()
      }

      map.on('moveend', onMoveEnd)
      map.on('zoomend', onZoomEnd)

      logger.ev.debug('EvMarkerLayer initialized')

      return () => {
        if (moveTimer) clearTimeout(moveTimer)
        map.off('moveend', onMoveEnd)
        map.off('zoomend', onZoomEnd)
        unsubEv(); unsubFilter(); unsubRoute(); unsubCountry()
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
