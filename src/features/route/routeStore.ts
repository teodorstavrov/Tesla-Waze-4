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
import { getLang } from '@/lib/locale'
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

// Format distance for voice announcement in the correct language
function fmtDistForVoice(m: number, lang: string): string {
  if (m >= 1000) {
    const km = (m / 1000).toFixed(1)
    if (lang === 'bg') return `${km} километра`
    if (lang === 'fi') return `${km} kilometriä`
    return `${km} kilometer`   // no/sv/en all use "kilometer"
  }
  const r = roundDistM(m)
  if (lang === 'bg') return `${r} метра`
  if (lang === 'fi') return `${r} metriä`
  return `${r} meter`          // no/sv/en all use "meter"
}

// ── State ─────────────────────────────────────────────────────────

let _state: RouteState = {
  destination:      null,
  routes:           [],
  activeRouteIndex: 0,
  route:            null,
  status:           'idle',
  mode:             'preview',
  error:            null,
  deviated:         false,
  remainingM:       null,
  currentStepIndex: 1,
  distToNextStepM:  null,
  arrived:          false,
}

type Listener = () => void
const _listeners = new Set<Listener>()
let _abort: AbortController | null = null
let _unsubGps: (() => void) | null = null
let _lastRerouteAt = 0
const REROUTE_COOLDOWN_MS = 20000  // 20s cooldown — prevents OSRM hammering on GPS jitter

// ── Post-turn advance buffer ──────────────────────────────────────
// The navigator must NOT advance to the next step the moment GPS enters
// the maneuver radius. Instead it waits until the driver has:
//   1. entered the maneuver reach zone  (Phase 1)
//   2. moved >= POST_TURN_BUFFER_M from the reach-zone entry  (Phase 2 → advance)
// This prevents the "next instruction shown while still in the current turn" bug.
const TURN_REACH_M      = 20  // enter pending state within this radius of the maneuver point
const POST_TURN_BUFFER_M = 5  // advance only after moving this many metres from reach entry

interface PendingAdvance {
  targetStepIdx: number         // which step we're buffering past
  reachedAt:     [number, number]  // [lat, lng] where we first entered TURN_REACH_M zone
}
let _pendingAdvance: PendingAdvance | null = null

// Per-route announcement tracking (step index → announced)
const _announced300 = new Set<number>()
const _announced50  = new Set<number>()
let _arrivedAnnounced = false

function _resetAnnouncements(): void {
  _announced300.clear()
  _announced50.clear()
  _arrivedAnnounced = false
  _pendingAdvance = null
}

function _emit(): void { _listeners.forEach((fn) => fn()) }

// ── GPS tracking + step navigation ───────────────────────────────

function _onGpsUpdate(): void {
  const route = _state.routes[_state.activeRouteIndex]
  if (!route || _state.status !== 'ok' || _state.mode !== 'navigating') return

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
        const _l = getLang()
        speak(({ bg: 'Пристигнахте на вашата дестинация', no: 'Du har ankommet din destinasjon', sv: 'Du har nått din destination', fi: 'Olet saapunut määränpäähäsi' } as Record<string,string>)[_l] ?? 'You have arrived at your destination')
      }
      _state = { ..._state, deviated, remainingM: remaining, arrived: true }
      _emit()
      return
    }
  }

  // ── Step navigation — two-phase post-turn buffer ────────────────
  // Phase 1: GPS enters TURN_REACH_M radius → record position, do NOT advance.
  // Phase 2: GPS moves POST_TURN_BUFFER_M from Phase-1 position → advance.
  // This ensures the next instruction appears only after the turn is truly done.
  const steps = route.steps
  let stepIdx = _state.currentStepIndex
  let stepChanged = false

  if (stepIdx < steps.length - 1) {   // never skip past the final 'arrive' step
    const step: RouteStep = steps[stepIdx]!
    const distToStep = haversineM(gps.lat, gps.lng, step.lat, step.lng)

    // Clear stale pending if it belongs to a different step index
    if (_pendingAdvance && _pendingAdvance.targetStepIdx !== stepIdx) {
      _pendingAdvance = null
    }

    if (_pendingAdvance) {
      // Phase 2 — measure how far we've moved from the reach-zone entry point
      const distFromReach = haversineM(
        gps.lat, gps.lng,
        _pendingAdvance.reachedAt[0], _pendingAdvance.reachedAt[1],
      )
      if (distFromReach >= POST_TURN_BUFFER_M) {
        // Buffer satisfied — advance to next step
        stepIdx++
        stepChanged = true
        _pendingAdvance = null
      } else if (distToStep > TURN_REACH_M * 2) {
        // User backed significantly away (GPS jump / reverse) — cancel pending
        _pendingAdvance = null
      }
      // Else: still executing the turn; keep current step visible
    } else if (distToStep < TURN_REACH_M) {
      // Phase 1 — first time entering reach zone; record position but don't advance
      _pendingAdvance = { targetStepIdx: stepIdx, reachedAt: [gps.lat, gps.lng] }
    }
  }

  // Voice announcement + live distance to next step
  const newStep = stepIdx   // stepIdx was potentially incremented above
  const nextStep = steps[newStep]
  const lang = getLang()

  let distToNextStepM: number | null = null
  if (nextStep && nextStep.type !== 'depart' && nextStep.type !== 'arrive') {
    const d = haversineM(gps.lat, gps.lng, nextStep.lat, nextStep.lng)

    // While in the post-turn buffer, hide the HUD counter so it doesn't awkwardly
    // count up from 0 while the driver is still executing the maneuver.
    distToNextStepM = (_pendingAdvance?.targetStepIdx === newStep) ? null : Math.round(d)

    // Far announcement: 80–350m
    // Skip if we just advanced this tick (stepChanged) or are mid-turn (pending).
    if (!stepChanged && !_pendingAdvance && d < 350 && d > 80 && !_announced300.has(newStep)) {
      _announced300.add(newStep)
      const distVoice = fmtDistForVoice(d, lang)
      const prefix: Record<string,string> = {
        bg: `След ${distVoice}, `,
        no: `Om ${distVoice}, `,
        sv: `Om ${distVoice}, `,
        fi: `${distVoice} päässä, `,
      }
      speak(`${prefix[lang] ?? `In ${distVoice}, `}${maneuverVoiceText(nextStep)}`)
    }

    // Imminent announcement: 20–80m (skip if mid-turn pending)
    if (!_pendingAdvance && d < 80 && d > 20 && !_announced50.has(newStep)) {
      _announced50.add(newStep)
      speak(maneuverVoiceText(nextStep))
    }
  }

  const distDelta = Math.abs((distToNextStepM ?? 0) - (_state.distToNextStepM ?? 0))
  const changed =
    deviated !== _state.deviated ||
    stepChanged ||
    Math.abs(remaining - (_state.remainingM ?? 0)) > 50 ||
    distDelta > 20   // update HUD counter every ~20m

  if (changed) {
    const justDeviated = !_state.deviated && deviated
    _state = { ..._state, deviated, remainingM: remaining, currentStepIndex: newStep, distToNextStepM }
    _emit()
    if (justDeviated) void routeStore.reroute()
  }
}

function _startGpsTracking(): void {
  _unsubGps?.()
  // Use queueMicrotask so _onGpsUpdate (which calls routeStore._emit) fires
  // AFTER gpsStore._posListeners.forEach completes. Without this, React can
  // receive a routeStore update mid-forEach (from _onGpsUpdate) while another
  // listener in the same forEach is also notifying React (FloatingStatsCard's
  // gpsStore.onPosition subscription) — causing React error #310.
  _unsubGps = gpsStore.onPosition(() => { queueMicrotask(_onGpsUpdate) })
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
      _state = { ..._state, destination: dest, status: 'error', mode: 'preview', error: getLang() === 'bg' ? 'GPS позицията не е налична' : 'GPS position unavailable', routes: [], route: null, activeRouteIndex: 0, deviated: false, remainingM: null, currentStepIndex: 1, distToNextStepM: null, arrived: false }
      _emit()
      return
    }

    _abort?.abort()
    _abort = new AbortController()
    _stopGpsTracking()
    _resetAnnouncements()

    _state = { destination: dest, routes: [], activeRouteIndex: 0, route: null, status: 'loading', mode: 'preview', error: null, deviated: false, remainingM: null, currentStepIndex: 1, distToNextStepM: null, arrived: false }
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
        mode:             'preview',
        error:            null,
        remainingM:       primary.distanceM,
        currentStepIndex: 1,
        distToNextStepM:  null,
        arrived:          false,
      }
      logger.route.info('Route found', { routes: routes.length, distanceM: primary.distanceM, durationS: primary.durationS, steps: primary.steps.length })
      _emit()
      // GPS tracking and voice start only when user explicitly presses Старт
    } catch (err) {
      if ((err as Error).name === 'AbortError') return
      const isOffline = !navigator.onLine || (err as Error).message.toLowerCase().includes('fetch')
      const errorMsg = isOffline
        ? (getLang() === 'bg' ? 'Без интернет — маршрутът не може да се изчисли' : 'No internet — route cannot be calculated')
        : (err as Error).message
      _state = { ..._state, status: 'error', error: errorMsg }
      logger.route.warn('Route failed', { err: String(err), offline: isOffline })
      _emit()
    }
  },

  /** Called when the user explicitly presses "Старт" in the route preview panel. */
  startNavigation(): void {
    if (_state.status !== 'ok' || _state.mode === 'navigating') return
    _resetAnnouncements()
    _state = { ..._state, mode: 'navigating' }
    _emit()
    _startGpsTracking()

    // Announce departure
    const route = _state.routes[_state.activeRouteIndex]
    if (route) {
      const firstStep = route.steps[1]
      if (firstStep) {
        const roundedM = roundDistM(firstStep.distanceM)
        const _sl = getLang()
        const _sd = roundedM > 0 ? fmtDistForVoice(roundedM, _sl) + ', ' : ''
        const _sv = maneuverVoiceText(firstStep)
        speak(({ bg: `Маршрутът е зареден. ${_sd}${_sv}`, no: `Rute lastet. ${_sd}${_sv}`, sv: `Rutt laddad. ${_sd}${_sv}`, fi: `Reitti ladattu. ${_sd}${_sv}` } as Record<string,string>)[_sl]
          ?? `Route loaded. ${_sd}${_sv}`)
      }
    }
  },

  /** Switch to an alternative route by index. */
  selectRoute(index: number): void {
    const route = _state.routes[index]
    if (!route) return
    _resetAnnouncements()
    _state = { ..._state, activeRouteIndex: index, route, remainingM: route.distanceM, deviated: false, currentStepIndex: 1, distToNextStepM: null, arrived: false }
    _emit()
  },

  /** Recalculate route from current GPS position.
   *  Fetches a single best route (no alternatives), stays in navigating mode. */
  async reroute(): Promise<void> {
    if (!_state.destination) return
    const now = Date.now()
    if (now - _lastRerouteAt < REROUTE_COOLDOWN_MS) return
    _lastRerouteAt = now

    const gps = gpsStore.getPosition()
    if (!gps) return

    _abort?.abort()
    _abort = new AbortController()
    _stopGpsTracking()
    _resetAnnouncements()

    const dest = _state.destination
    _state = { ..._state, status: 'loading', deviated: false, remainingM: null, currentStepIndex: 1, distToNextStepM: null }
    _emit()

    try {
      // Single route — no alternatives popup on reroute
      const routes = await fetchOSRMRoute(
        [gps.lat, gps.lng],
        [dest.lat, dest.lng],
        _abort.signal,
        0,
      )
      const primary = routes[0]!
      _state = {
        ..._state,
        routes,
        activeRouteIndex: 0,
        route:            primary,
        status:           'ok',
        mode:             'navigating',
        error:            null,
        remainingM:       primary.distanceM,
        currentStepIndex: 1,
        distToNextStepM:  null,
        arrived:          false,
        deviated:         false,
      }
      _emit()
      _startGpsTracking()

      const firstStep = primary.steps[1]
      if (firstStep) {
        const roundedM = roundDistM(firstStep.distanceM)
        const _rl = getLang()
        const _rd = roundedM > 0 ? fmtDistForVoice(roundedM, _rl) + ', ' : ''
        const _rv = maneuverVoiceText(firstStep)
        speak(({ bg: `Преизчислен маршрут. ${_rd}${_rv}`, no: `Rute beregnet på nytt. ${_rd}${_rv}`, sv: `Rutt omberäknad. ${_rd}${_rv}`, fi: `Reitti laskettu uudelleen. ${_rd}${_rv}` } as Record<string,string>)[_rl]
          ?? `Route recalculated. ${_rd}${_rv}`)
      }
    } catch (err) {
      if ((err as Error).name === 'AbortError') return
      _state = { ..._state, status: 'error', error: (err as Error).message }
      logger.route.warn('Reroute failed', { err: String(err) })
      _emit()
    }
  },

  clear(): void {
    _abort?.abort()
    _stopGpsTracking()
    _resetAnnouncements()
    _state = { destination: null, routes: [], activeRouteIndex: 0, route: null, status: 'idle', mode: 'preview', error: null, deviated: false, remainingM: null, currentStepIndex: 1, distToNextStepM: null, arrived: false }
    _emit()
  },
}
