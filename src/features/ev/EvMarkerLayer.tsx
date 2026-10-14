// ─── EV Marker Layer ───────────────────────────────────────────────────
//
// Null-render React component managing MapLibre markers imperatively.
//
// ZOOM-AWARE RENDERING
// ──────────────────────────────────────────────────────────────────────
// zoom < CLUSTER_ZOOM  → cluster mode: one circle per 0.5° grid cell
// zoom >= CLUSTER_ZOOM → individual markers, stable registry diff
//
// clearAll() is used only on zoom-mode switch — never on incremental updates.

import { useEffect, useRef } from 'react'
import * as maplibregl from 'maplibre-gl'
import { getMap } from '@/components/MapShell'
import { evStore } from './evStore.js'
import { filterStore } from './filterStore.js'
import { routeStore } from '@/features/route/routeStore'
import { countryStore } from '@/lib/countryStore'
import { logger } from '@/lib/logger'
import { getLang } from '@/lib/locale'
import { getActivePerformanceProfile } from '@/config/performanceProfiles'
import type { NormalizedStation } from './types.js'

const CLUSTER_ZOOM     = 11
const CLUSTER_CELL_DEG = 0.5

function stationColor(s: NormalizedStation): string {
  if (s.source === 'user' && s.approvalStatus === 'pending') return '#a855f7'
  if (s.status === 'offline' || s.status === 'planned') return '#888'
  if (s.source === 'tesla')                              return '#e31937'
  if (s.maxPowerKw != null && s.maxPowerKw >= 150)       return '#F59E0B'
  if (s.maxPowerKw != null && s.maxPowerKw >= 50)        return '#22c55e'
  return '#FACC15'
}

function makeStationElement(s: NormalizedStation, nearRoute = false): HTMLDivElement {
  const color   = stationColor(s)
  const opacity = s.status === 'offline' || s.status === 'planned' ? 0.5 : 1
  const isPendingUser = s.source === 'user' && s.approvalStatus === 'pending'
  const icon  = isPendingUser ? '❓' : '⚡'
  const bord  = isPendingUser
    ? '2.5px dashed rgba(168,85,247,0.8)'
    : nearRoute ? '3px solid #FFD700' : '2.5px solid rgba(255,255,255,0.9)'
  const shad  = isPendingUser
    ? '0 0 0 2px rgba(168,85,247,0.3), 0 3px 12px rgba(0,0,0,0.6)'
    : nearRoute ? '0 0 0 2px #FFD700, 0 3px 12px rgba(0,0,0,0.6)' : '0 3px 12px rgba(0,0,0,0.55)'

  const wrap = document.createElement('div')
  wrap.className = 'marker-scale-wrap'
  wrap.style.cssText = 'width:44px;height:44px;display:flex;align-items:center;justify-content:center;cursor:pointer'

  const inner = document.createElement('div')
  inner.style.cssText = [
    'width:34px', 'height:34px', 'border-radius:50%',
    `background:${color}`, `opacity:${opacity}`,
    `border:${bord}`, `box-shadow:${shad}`,
    'display:flex', 'align-items:center', 'justify-content:center',
    'font-size:18px', 'line-height:1',
    'user-select:none', '-webkit-user-select:none',
  ].join(';')
  inner.textContent = icon
  wrap.appendChild(inner)
  return wrap
}

function updateStationElement(el: HTMLDivElement, s: NormalizedStation, nearRoute: boolean): void {
  const color   = stationColor(s)
  const opacity = s.status === 'offline' || s.status === 'planned' ? 0.5 : 1
  const isPendingUser = s.source === 'user' && s.approvalStatus === 'pending'
  const icon  = isPendingUser ? '❓' : '⚡'
  const bord  = isPendingUser
    ? '2.5px dashed rgba(168,85,247,0.8)'
    : nearRoute ? '3px solid #FFD700' : '2.5px solid rgba(255,255,255,0.9)'
  const shad  = isPendingUser
    ? '0 0 0 2px rgba(168,85,247,0.3), 0 3px 12px rgba(0,0,0,0.6)'
    : nearRoute ? '0 0 0 2px #FFD700, 0 3px 12px rgba(0,0,0,0.6)' : '0 3px 12px rgba(0,0,0,0.55)'

  const inner = el.firstElementChild as HTMLElement | null
  if (!inner) return
  inner.style.background = color
  inner.style.opacity = `${opacity}`
  inner.style.border = bord
  inner.style.boxShadow = shad
  inner.textContent = icon
}

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

function makeClusterElement(count: number, maxPower: number | null): HTMLDivElement {
  const r     = clusterRadius(count)
  const color = clusterColor(maxPower)
  const size  = r * 2

  const wrap = document.createElement('div')
  wrap.className = 'marker-scale-wrap'
  const inner = document.createElement('div')
  inner.style.cssText = [
    `width:${size}px`, `height:${size}px`, 'border-radius:50%',
    `background:${color}`, 'opacity:0.88',
    'border:2px solid #fff',
    'box-shadow:0 2px 8px rgba(0,0,0,0.45)',
    'display:flex', 'align-items:center', 'justify-content:center',
    `font-size:${count >= 100 ? 10 : 12}px`, 'font-weight:700', 'color:#fff',
    'line-height:1', 'cursor:pointer',
  ].join(';')
  inner.textContent = `${count}`
  wrap.appendChild(inner)
  return wrap
}

function updateClusterElement(el: HTMLDivElement, count: number, maxPower: number | null): void {
  const r     = clusterRadius(count)
  const color = clusterColor(maxPower)
  const size  = r * 2
  const inner = el.firstElementChild as HTMLElement | null
  if (!inner) return
  inner.style.width = `${size}px`
  inner.style.height = `${size}px`
  inner.style.background = color
  inner.style.fontSize = `${count >= 100 ? 10 : 12}px`
  inner.textContent = `${count}`
}

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

type StationEntry  = { marker: maplibregl.Marker; el: HTMLDivElement }
type ClusterEntry  = { marker: maplibregl.Marker; el: HTMLDivElement }

export function EvMarkerLayer() {
  const registryRef        = useRef<Map<string, StationEntry>>(new Map())
  const clusterRegistryRef = useRef<Map<string, ClusterEntry>>(new Map())
  const nearRouteRef       = useRef<Set<string>>(new Set())
  const zoomRef            = useRef<number>(13)

  useEffect(() => {
    let cancelled = false
    let moveTimer: ReturnType<typeof setTimeout> | null = null

    function init(map: maplibregl.Map): () => void {
      const registry        = registryRef.current
      const clusterRegistry = clusterRegistryRef.current
      zoomRef.current       = map.getZoom()

      function clearAll(): void {
        for (const e of registry.values()) e.marker.remove()
        registry.clear()
        for (const e of clusterRegistry.values()) e.marker.remove()
        clusterRegistry.clear()
      }

      function syncClusters(): void {
        const stations = filterStore.getFilteredStations()
        const cells    = buildClusters(stations)
        const incoming = new Set(cells.keys())

        for (const [key, entry] of clusterRegistry) {
          if (!incoming.has(key)) { entry.marker.remove(); clusterRegistry.delete(key) }
        }

        for (const [key, cell] of cells) {
          const existing = clusterRegistry.get(key)
          if (existing) {
            updateClusterElement(existing.el, cell.count, cell.maxPower)
          } else {
            const el = makeClusterElement(cell.count, cell.maxPower)
            el.addEventListener('click', () => {
              map.easeTo({ center: [cell.lng, cell.lat], zoom: CLUSTER_ZOOM, duration: 400 })
            })
            const marker = new maplibregl.Marker({ element: el, anchor: 'center' })
              .setLngLat([cell.lng, cell.lat])
              .addTo(map)
            clusterRegistry.set(key, { marker, el })
          }
        }
      }

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
        for (const [id, entry] of registry) {
          const station = filterStore.getFilteredStations().find((s) => s.id === id)
          if (station) updateStationElement(entry.el, station, next.has(id))
        }
      }

      function syncMarkers(): void {
        const { markersVisible } = evStore.getState()
        if (!markersVisible) { clearAll(); return }

        if (zoomRef.current < CLUSTER_ZOOM) {
          for (const e of registry.values()) e.marker.remove()
          registry.clear()
          syncClusters()
          return
        }

        for (const e of clusterRegistry.values()) e.marker.remove()
        clusterRegistry.clear()

        const allStations = filterStore.getFilteredStations()
        const nearRoute   = nearRouteRef.current

        const bounds = map.getBounds()
        const pad    = 0.2
        const minLat = bounds.getSouth() - pad
        const maxLat = bounds.getNorth() + pad
        const minLng = bounds.getWest()  - pad
        const maxLng = bounds.getEast()  + pad
        const stations = allStations.filter(
          (s) => s.lat >= minLat && s.lat <= maxLat && s.lng >= minLng && s.lng <= maxLng,
        )

        const incoming = new Set(stations.map((s) => s.id))

        for (const [id, entry] of registry) {
          if (!incoming.has(id)) { entry.marker.remove(); registry.delete(id) }
        }

        for (const station of stations) {
          if (registry.has(station.id)) continue
          const el = makeStationElement(station, nearRoute.has(station.id))
          el.addEventListener('click', () => {
            evStore.selectStation(station)
            logger.ev.debug('Station selected', { id: station.id })
          })
          // Tooltip skipped on Tesla (no hover) — station info is in the tap panel
          const marker = new maplibregl.Marker({ element: el, anchor: 'center' })
            .setLngLat([station.lng, station.lat])
            .addTo(map)
          registry.set(station.id, { marker, el })
        }
      }

      const unsubEv     = evStore.subscribe(syncMarkers)
      const unsubFilter = filterStore.subscribe(() => { syncNearRoute(); syncMarkers() })
      const unsubRoute  = routeStore.subscribe(() => { syncNearRoute() })

      syncMarkers()

      function fetchCountry(): void {
        const [[swLat, swLng], [neLat, neLng]] = countryStore.getCountryOrDefault().bounds
        evStore.fetch({ minLat: swLat, minLng: swLng, maxLat: neLat, maxLng: neLng })
      }
      fetchCountry()

      const unsubCountry = countryStore.subscribe(fetchCountry)

      function onVisibilityChange(): void {
        if (!document.hidden && evStore.getState().stations.length === 0) {
          logger.ev.debug('Tab became visible with no stations — retrying fetch')
          fetchCountry()
        }
      }
      document.addEventListener('visibilitychange', onVisibilityChange)

      function onMoveEnd(): void {
        if (moveTimer) clearTimeout(moveTimer)
        const debounce = getActivePerformanceProfile().evDebounceMs
        moveTimer = setTimeout(syncMarkers, debounce)
      }

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
        document.removeEventListener('visibilitychange', onVisibilityChange)
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
