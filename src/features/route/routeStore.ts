// ─── Route Store (module-level) ────────────────────────────────────────
// Owns the active route: destination, polyline, distance, ETA.
// RouteLayer subscribes and draws the polyline imperatively on the map.

import { fetchOSRMRoute } from './osrm.js'
import { gpsStore } from '@/features/gps/gpsStore'
import { logger } from '@/lib/logger'
import type { RouteState, RouteDestination } from './types.js'

let _state: RouteState = {
  destination: null,
  route:       null,
  status:      'idle',
  error:       null,
}

type Listener = () => void
const _listeners = new Set<Listener>()
let _abort: AbortController | null = null

function _emit(): void { _listeners.forEach((fn) => fn()) }

export const routeStore = {
  getState(): Readonly<RouteState> { return _state },

  subscribe(listener: Listener): () => void {
    _listeners.add(listener)
    return () => { _listeners.delete(listener) }
  },

  async navigateTo(dest: RouteDestination): Promise<void> {
    const gps = gpsStore.getPosition()
    if (!gps) {
      _state = { ..._state, destination: dest, status: 'error', error: 'GPS position not available yet', route: null }
      _emit()
      return
    }

    _abort?.abort()
    _abort = new AbortController()

    _state = { destination: dest, route: null, status: 'loading', error: null }
    _emit()

    try {
      const route = await fetchOSRMRoute(
        [gps.lat, gps.lng],
        [dest.lat, dest.lng],
        _abort.signal,
      )
      _state = { ..._state, route, status: 'ok', error: null }
      logger.route.info('Route found', { distanceM: route.distanceM, durationS: route.durationS })
      _emit()
    } catch (err) {
      if ((err as Error).name === 'AbortError') return
      _state = { ..._state, status: 'error', error: (err as Error).message }
      logger.route.warn('Route failed', { err: String(err) })
      _emit()
    }
  },

  clear(): void {
    _abort?.abort()
    _state = { destination: null, route: null, status: 'idle', error: null }
    _emit()
  },
}
