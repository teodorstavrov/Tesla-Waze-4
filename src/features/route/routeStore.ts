// ─── Route Store (module-level) ────────────────────────────────────────
// Owns the active route: destination, polyline, distance, ETA.
// Supports up to 3 routes (primary + 2 OSRM alternatives).
// Tracks live remaining distance, deviation, step-by-step navigation,
// voice announcements and arrival detection via GPS.

import { fetchOSRMRoute } from './osrm.js'
import { maneuverVoiceText } from './maneuver.js'
import { gpsStore } from '@/features/gps/gpsStore'
import { audioManager } from '@/features/audio/audioManager'
import { logger } from '@/lib/logger'
import type { RouteState, RouteDestination, RouteStep } from './types.js'

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

// ── Voice announcement helpers ────────────────────────────────────

function speak(text: string): void {
  audioManager.beep(880, 80)
  setTimeout(() => audioManager.speak(text), 150)
}

function roundDistM(m: number): number {
  if (m >= 500) return Math.round(m / 100) * 100
  return Math.round(m / 50) * 50
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
  currentStepIndex: 1,
  arrived:          false,
}

type Listener = () => void
const _listeners = new Set<Listener>()
let _abort: AbortController | null = null
let _unsubGps: (() => void) | null = null

// Per-route announcement tracking (step index → announced)
const _announced300 = new Set<number>()
const _announced50  = new Set<number>()
let _arrivedAnnounced = false

function _resetAnnouncements(): void {
  _announced300.clear()
  _announced50.clear()
  _arrivedAnnounced = false
}

function _emit(): void { _listeners.forEach((fn) => fn()) }

// ── GPS tracking + step navigation ───────────────────────────────

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

  // ── Arrival detection ───────────────────────────────────────────
  if (_state.destination) {
    const distToDest = haversineM(gps.lat, gps.lng, _state.destination.lat, _state.destination.lng)
    if (distToDest < 50 && !_state.arrived) {
      if (!_arrivedAnnounced) {
        _arrivedAnnounced = true
        speak('Пристигнахте на вашата дестинация')
      }
      _state = { ..._state, deviated, remainingM: remaining, arrived: true }
      _emit()
      return
    }
  }

  // ── Step navigation ─────────────────────────────────────────────
  const steps = route.steps
  let stepIdx = _state.currentStepIndex
  let stepChanged = false

  // Advance past steps we've already passed (within 25m of their maneuver point)
  while (stepIdx < steps.length - 1) {  // don't skip 'arrive'
    const step: RouteStep = steps[stepIdx]!
    const distToStep = haversineM(gps.lat, gps.lng, step.lat, step.lng)
    if (distToStep < 25) {
      stepIdx++
      stepChanged = true
    } else {
      break
    }
  }

  // Voice announcement for the current next step
  const nextStep = steps[stepIdx]
  if (nextStep && nextStep.type !== 'depart' && nextStep.type !== 'arrive') {
    const distToStep = haversineM(gps.lat, gps.lng, nextStep.lat, nextStep.lng)

    // Far announcement: 150–350m
    if (distToStep < 350 && distToStep > 80 && !_announced300.has(stepIdx)) {
      _announced300.add(stepIdx)
      const roundedM = roundDistM(distToStep)
      speak(`След ${roundedM} метра, ${maneuverVoiceText(nextStep)}`)
    }

    // Imminent announcement: 20–80m
    if (distToStep < 80 && distToStep > 20 && !_announced50.has(stepIdx)) {
      _announced50.add(stepIdx)
      speak(maneuverVoiceText(nextStep))
    }
  }

  const newStep = stepChanged ? stepIdx : _state.currentStepIndex
  const changed =
    deviated !== _state.deviated ||
    stepChanged ||
    Math.abs(remaining - (_state.remainingM ?? 0)) > 50

  if (changed) {
    _state = { ..._state, deviated, remainingM: remaining, currentStepIndex: newStep }
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
      _state = { ..._state, destination: dest, status: 'error', error: 'GPS позицията не е налична', routes: [], route: null, activeRouteIndex: 0, deviated: false, remainingM: null, currentStepIndex: 1, arrived: false }
      _emit()
      return
    }

    _abort?.abort()
    _abort = new AbortController()
    _stopGpsTracking()
    _resetAnnouncements()

    _state = { destination: dest, routes: [], activeRouteIndex: 0, route: null, status: 'loading', error: null, deviated: false, remainingM: null, currentStepIndex: 1, arrived: false }
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
        route:            primary,
        status:           'ok',
        error:            null,
        remainingM:       primary.distanceM,
        currentStepIndex: 1,  // skip 'depart' step
        arrived:          false,
      }
      logger.route.info('Route found', { routes: routes.length, distanceM: primary.distanceM, durationS: primary.durationS, steps: primary.steps.length })
      _emit()
      _startGpsTracking()

      // Announce departure
      const firstStep = primary.steps[1]
      if (firstStep) {
        const roundedM = roundDistM(firstStep.distanceM)
        speak(`Маршрутът е зареден. ${roundedM > 0 ? `След ${roundedM} метра, ` : ''}${maneuverVoiceText(firstStep)}`)
      }
    } catch (err) {
      if ((err as Error).name === 'AbortError') return
      const isOffline = !navigator.onLine || (err as Error).message.toLowerCase().includes('fetch')
      const errorMsg = isOffline
        ? 'Без интернет — маршрутът не може да се изчисли'
        : (err as Error).message
      _state = { ..._state, status: 'error', error: errorMsg }
      logger.route.warn('Route failed', { err: String(err), offline: isOffline })
      _emit()
    }
  },

  /** Switch to an alternative route by index. */
  selectRoute(index: number): void {
    const route = _state.routes[index]
    if (!route) return
    _resetAnnouncements()
    _state = { ..._state, activeRouteIndex: index, route, remainingM: route.distanceM, deviated: false, currentStepIndex: 1, arrived: false }
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
    _resetAnnouncements()
    _state = { destination: null, routes: [], activeRouteIndex: 0, route: null, status: 'idle', error: null, deviated: false, remainingM: null, currentStepIndex: 1, arrived: false }
    _emit()
  },
}
