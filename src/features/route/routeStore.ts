// ─── Route Store (module-level) ────────────────────────────────────────
// Owns the active route: destination, polyline, distance, ETA.
// Supports up to 3 routes (primary + 2 OSRM alternatives).
// Tracks live remaining distance and deviation from route via GPS.

import { fetchOSRMRoute } from './osrm.js'
import { gpsStore } from '@/features/gps/gpsStore'
import { logger } from '@/lib/logger'
import type { RouteState, RouteDestination } from './types.js'

// ── Geometry helpers ──────────────────────────────────────────────

function haversineM(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000
  const dLat = (lat2 - lat1) * Math.PI / 180
  const dLng = (lng2 - lng1) * Math.PI / 180
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

function closestPointIndex(lat: number, lng: number, polyline: [number, number][]): number {
  let minDist = Infinity
  let minIdx = 0
  for (let i = 0; i < polyline.length; i++) {
    const [plat, plng] = polyline[i]!
    const d = (lat - plat) ** 2 + (lng - plng) ** 2
    if (d < minDist) { minDist = d; minIdx = i }
  }
  return minIdx
}

function remainingDistanceM(fromIdx: number, polyline: [number, number][]): number {
  let total = 0
  for (let i = fromIdx; i < polyline.length - 1; i++) {
    total += haversineM(polyline[i]![0], polyline[i]![1], polyline[i + 1]![0], polyline[i + 1]![1])
  }
  return total
}

// ── State ─────────────────────────────────────────────────────────

let _state: RouteState = {
  destination:      null,
  routes:           [],
  activeRouteIndex: 0,
  route:            null,
  status:           'idle',
  error:            null,
  deviated:         false,
  remainingM:       null,
}

type Listener = () => void
const _listeners = new Set<Listener>()
let _abort: AbortController | null = null
let _unsubGps: (() => void) | null = null

function _emit(): void { _listeners.forEach((fn) => fn()) }

// ── GPS tracking ──────────────────────────────────────────────────

function _onGpsUpdate(): void {
  const route = _state.routes[_state.activeRouteIndex]
  if (!route || _state.status !== 'ok') return

  const gps = gpsStore.getPosition()
  if (!gps) return

  const idx = closestPointIndex(gps.lat, gps.lng, route.polyline)
  const [closestLat, closestLng] = route.polyline[idx]!
  const distFromRoute = haversineM(gps.lat, gps.lng, closestLat, closestLng)

  const deviated  = distFromRoute > 200
  const remaining = remainingDistanceM(idx, route.polyline)

  if (deviated !== _state.deviated || Math.abs(remaining - (_state.remainingM ?? 0)) > 50) {
    _state = { ..._state, deviated, remainingM: remaining }
    _emit()
  }
}

function _startGpsTracking(): void {
  _unsubGps?.()
  _unsubGps = gpsStore.onPosition(_onGpsUpdate)
}

function _stopGpsTracking(): void {
  _unsubGps?.()
  _unsubGps = null
}

// ── Store ─────────────────────────────────────────────────────────

export const routeStore = {
  getState(): Readonly<RouteState> { return _state },

  subscribe(listener: Listener): () => void {
    _listeners.add(listener)
    return () => { _listeners.delete(listener) }
  },

  async navigateTo(dest: RouteDestination): Promise<void> {
    const gps = gpsStore.getPosition()
    if (!gps) {
      _state = { ..._state, destination: dest, status: 'error', error: 'GPS позицията не е налична', routes: [], route: null, activeRouteIndex: 0, deviated: false, remainingM: null }
      _emit()
      return
    }

    _abort?.abort()
    _abort = new AbortController()
    _stopGpsTracking()

    _state = { destination: dest, routes: [], activeRouteIndex: 0, route: null, status: 'loading', error: null, deviated: false, remainingM: null }
    _emit()

    try {
      const routes = await fetchOSRMRoute(
        [gps.lat, gps.lng],
        [dest.lat, dest.lng],
        _abort.signal,
      )
      const primary = routes[0]!
      _state = {
        ..._state,
        routes,
        activeRouteIndex: 0,
        route:      primary,
        status:     'ok',
        error:      null,
        remainingM: primary.distanceM,
      }
      logger.route.info('Route found', { routes: routes.length, distanceM: primary.distanceM, durationS: primary.durationS })
      _emit()
      _startGpsTracking()
    } catch (err) {
      if ((err as Error).name === 'AbortError') return
      _state = { ..._state, status: 'error', error: (err as Error).message }
      logger.route.warn('Route failed', { err: String(err) })
      _emit()
    }
  },

  /** Switch to an alternative route by index. */
  selectRoute(index: number): void {
    const route = _state.routes[index]
    if (!route) return
    _state = { ..._state, activeRouteIndex: index, route, remainingM: route.distanceM, deviated: false }
    _emit()
  },

  /** Recalculate route from current GPS position. */
  async reroute(): Promise<void> {
    if (!_state.destination) return
    await routeStore.navigateTo(_state.destination)
  },

  clear(): void {
    _abort?.abort()
    _stopGpsTracking()
    _state = { destination: null, routes: [], activeRouteIndex: 0, route: null, status: 'idle', error: null, deviated: false, remainingM: null }
    _emit()
  },
}
