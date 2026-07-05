// ─── Route Store (module-level) ────────────────────────────────────────
// Owns the active route: destination, polyline, distance, ETA.
// Supports up to 3 routes (primary + 2 OSRM alternatives).
// Tracks live remaining distance, deviation, step-by-step navigation,
// voice announcements and arrival detection via GPS.

import { fetchOSRMRoute as fetchValhalla, fetchRouteViaHemus } from './valhalla.js'
import { fetchOSRMRoute as fetchOSRM } from './osrm.js'
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

/**
 * Haversine distance (metres) from point to the closest point on segment a→b.
 * Projects in equirectangular space (accurate enough for short segments).
 * Used to avoid false deviation alerts on long straight highway segments
 * where vertex spacing can exceed the 200 m deviation threshold.
 */
function _segDistM(
  lat: number, lng: number,
  a: [number, number], b: [number, number],
): number {
  const dx = b[0] - a[0], dy = b[1] - a[1]
  const t = (dx === 0 && dy === 0)
    ? 0
    : Math.max(0, Math.min(1, ((lat - a[0]) * dx + (lng - a[1]) * dy) / (dx * dx + dy * dy)))
  return haversineM(lat, lng, a[0] + t * dx, a[1] + t * dy)
}

/**
 * True perpendicular distance from the GPS fix to the polyline.
 * Finds the closest vertex first (O(n)), then checks the two adjacent
 * segments (O(1)) — total cost equals the existing vertex search.
 *
 * WHY: closestPointIndex gives the nearest *vertex*.  On highways OSRM
 * emits sparse polylines (vertices every 200–500 m on long straights).
 * A car driving perfectly on-route can be 300 m from the nearest vertex,
 * incorrectly triggering the 80 m deviation threshold and forcing a reroute.
 */
function distToPolylineM(lat: number, lng: number, polyline: [number, number][]): number {
  const idx = closestPointIndex(lat, lng, polyline)
  let d = haversineM(lat, lng, polyline[idx]![0], polyline[idx]![1])
  if (idx > 0)
    d = Math.min(d, _segDistM(lat, lng, polyline[idx - 1]!, polyline[idx]!))
  if (idx < polyline.length - 1)
    d = Math.min(d, _segDistM(lat, lng, polyline[idx]!, polyline[idx + 1]!))
  return d
}

// ── Cumulative distance cache ─────────────────────────────────────
// Built once when the route polyline changes. Turns remainingDistanceM()
// from O(n) haversine calls per GPS tick → O(1) array lookup.
// On a 5000-point route this saves ~5000 trig operations per second on old Tesla MCU.
let _cumPolylineRef: [number, number][] | null = null  // reference equality guard
let _cumDistances: Float64Array | null = null           // cumulative metres from start
let _cumTotal = 0                                       // total route length in metres

function _ensureCumulative(polyline: [number, number][]): void {
  if (_cumPolylineRef === polyline) return  // same object — already built
  _cumPolylineRef = polyline
  const n = polyline.length
  _cumDistances = new Float64Array(n)
  let sum = 0
  for (let i = 1; i < n; i++) {
    sum += haversineM(polyline[i - 1]![0], polyline[i - 1]![1], polyline[i]![0], polyline[i]![1])
    _cumDistances[i] = sum
  }
  _cumTotal = sum
}

function remainingDistanceM(fromIdx: number): number {
  if (!_cumDistances) return 0
  return _cumTotal - (_cumDistances[fromIdx] ?? 0)
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
  viaHemus:         false,
}

type Listener = () => void
const _listeners = new Set<Listener>()
let _abort: AbortController | null = null
let _unsubGps: (() => void) | null = null
let _lastRerouteAt = 0
const REROUTE_COOLDOWN_MS    = 8000  // 8s — allows retry after transient network failure
const DEVIATION_THRESHOLD_M  = 80    // metres from polyline before considering off-route
const DEVIATION_CONFIRM_TICKS = 2    // consecutive GPS ticks above threshold → auto-reroute (~2 s)
let _deviationTicks = 0
let _isRerouting    = false          // true while reroute fetch is in-flight

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
  _deviationTicks = 0
  _cumPolylineRef = null  // force cumulative distance rebuild for the new route
}

function _emit(): void { _listeners.forEach((fn) => fn()) }

// ── GPS tracking + step navigation ───────────────────────────────

function _onGpsUpdate(): void {
  const route = _state.routes[_state.activeRouteIndex]
  // Continue processing during rerouting (status='loading') so HUD stays live.
  // Also allow processing after failed reroute (status='error') so auto-retry can trigger.
  if (!route || _state.mode !== 'navigating') return

  const gps = gpsStore.getPosition()
  if (!gps) return

  _ensureCumulative(route.polyline)

  const idx         = closestPointIndex(gps.lat, gps.lng, route.polyline)
  const distFromRoute = distToPolylineM(gps.lat, gps.lng, route.polyline)

  // Require DEVIATION_CONFIRM_TICKS consecutive GPS ticks above DEVIATION_THRESHOLD_M
  // before flagging as off-route. This eliminates false reroutes from GPS jitter.
  const rawDeviated = distFromRoute > DEVIATION_THRESHOLD_M
  if (rawDeviated) {
    _deviationTicks = Math.min(_deviationTicks + 1, DEVIATION_CONFIRM_TICKS)
  } else {
    _deviationTicks = 0
  }
  const deviated = _deviationTicks >= DEVIATION_CONFIRM_TICKS
  const remaining = remainingDistanceM(idx)

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
      setTimeout(() => { routeStore.clear() }, 20_000)
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
    // Road distance to next maneuver: remaining polyline distance minus segments after this step.
    const distAfterM = steps.slice(newStep + 1).reduce((acc, s) => acc + (s.distanceM ?? 0), 0)
    const d = Math.max(0, remainingDistanceM(idx) - distAfterM)

    // While in the post-turn buffer, hide the HUD counter so it doesn't awkwardly
    // count up from 0 while the driver is still executing the maneuver.
    distToNextStepM = (_pendingAdvance?.targetStepIdx === newStep) ? null : Math.round(d)

    // Far announcement: 80–350m
    // Skip if we just advanced this tick (stepChanged), are mid-turn (pending), or rerouting.
    if (!stepChanged && !_pendingAdvance && !_isRerouting && d < 350 && d > 80 && !_announced300.has(newStep)) {
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

    // Imminent announcement: 20–80m (skip if mid-turn pending or rerouting)
    if (!_pendingAdvance && !_isRerouting && d < 80 && d > 20 && !_announced50.has(newStep)) {
      _announced50.add(newStep)
      speak(maneuverVoiceText(nextStep))
    }
  }

  const distDelta = Math.abs((distToNextStepM ?? 0) - (_state.distToNextStepM ?? 0))
  const changed =
    deviated !== _state.deviated ||
    stepChanged ||
    Math.abs(remaining - (_state.remainingM ?? 0)) > 20 ||
    distDelta > 10   // update HUD every ~10m (at 60 km/h GPS gives ~17m/tick)

  if (changed) {
    const justDeviated = !_state.deviated && deviated && !_isRerouting
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

    const viaHemus = _state.viaHemus
    _state = { destination: dest, routes: [], activeRouteIndex: 0, route: null, status: 'loading', mode: 'preview', error: null, deviated: false, remainingM: null, currentStepIndex: 1, distToNextStepM: null, arrived: false, viaHemus }
    _emit()

    try {
      const routes = viaHemus
        ? await fetchRouteViaHemus([gps.lat, gps.lng], [dest.lat, dest.lng], _abort.signal)
        : await fetchValhalla([gps.lat, gps.lng], [dest.lat, dest.lng], _abort.signal)
            .catch(() => fetchOSRM([gps.lat, gps.lng], [dest.lat, dest.lng], _abort!.signal))
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
      const isOffline = !navigator.onLine
      const msg = (err as Error).message
      const isFetchError = !isOffline && (
        msg.toLowerCase().includes('fetch') ||
        msg.toLowerCase().includes('network') ||
        msg.includes('timeout') ||
        msg.includes('408') || msg.includes('503') || msg.includes('504')
      )
      const _lang = getLang()
      const offlineMsg: Record<string, string> = {
        bg: 'Без интернет — маршрутът не може да се изчисли',
        no: 'Ingen internett — kan ikke beregne rute',
        sv: 'Ingen internet — kan inte beräkna rutt',
        fi: 'Ei internetyhteyttä — reittiä ei voi laskea',
        nl: 'Geen internet — route kan niet worden berekend',
      }
      const serviceMsg: Record<string, string> = {
        bg: 'Маршрутната услуга е недостъпна — опитайте отново',
        no: 'Rutetjeneste utilgjengelig — prøv igjen',
        sv: 'Rutttjänsten är otillgänglig — försök igen',
        fi: 'Reitityspalvelu ei saatavilla — yritä uudelleen',
        nl: 'Routeservice niet beschikbaar — probeer opnieuw',
      }
      const errorMsg = isOffline
        ? (offlineMsg[_lang] ?? 'No internet — route cannot be calculated')
        : isFetchError
          ? (serviceMsg[_lang] ?? 'Routing service unavailable — try again')
          : msg
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
    _isRerouting = true  // GPS tracking stays live; HUD keeps updating with old route

    const dest     = _state.destination
    const viaHemus = _state.viaHemus
    _state = { ..._state, status: 'loading', deviated: false }
    _emit()

    try {
      // Single route — no alternatives popup on reroute
      const routes = viaHemus
        ? await fetchRouteViaHemus([gps.lat, gps.lng], [dest.lat, dest.lng], _abort.signal)
        : await fetchValhalla([gps.lat, gps.lng], [dest.lat, dest.lng], _abort.signal)
            .catch(() => fetchOSRM([gps.lat, gps.lng], [dest.lat, dest.lng], _abort!.signal))
      const primary = routes[0]!
      _resetAnnouncements()  // clear old-route tracking before switching to new route
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
      _isRerouting = false
      _emit()
      _startGpsTracking()  // re-subscribe to ensure clean state after abort

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
      _isRerouting = false
      _state = { ..._state, status: 'error', error: (err as Error).message }
      logger.route.warn('Reroute failed', { err: String(err) })
      _emit()
    }
  },

  /** Toggle Via Хемус waypoint and re-fetch the current route. */
  async toggleViaHemus(): Promise<void> {
    const newViaHemus = !_state.viaHemus
    _state = { ..._state, viaHemus: newViaHemus }
    if (_state.destination) {
      await routeStore.navigateTo(_state.destination)
    } else {
      _emit()
    }
  },

  clear(): void {
    _abort?.abort()
    _stopGpsTracking()
    _resetAnnouncements()
    _state = { destination: null, routes: [], activeRouteIndex: 0, route: null, status: 'idle', mode: 'preview', error: null, deviated: false, remainingM: null, currentStepIndex: 1, distToNextStepM: null, arrived: false, viaHemus: false }
    _emit()
  },
}
