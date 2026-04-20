// ─── Tesla Live Data Poller ────────────────────────────────────────────────
//
// Polls /api/tesla/vehicle on a schedule designed to feel live without
// hammering Tesla's Fleet API.
//
// COST POLICY:
//   - Poll once immediately on connect / app resume
//   - Vehicle awake: re-poll every POLL_INTERVAL_MS (3 min)
//     The backend serves a 5-min Redis cache, so actual Tesla API calls
//     happen at most once per 5 min regardless of frontend poll rate.
//   - Vehicle sleeping: SLEEP_BACKOFF_MS (2 min) — check if it woke up
//   - On error / rate-limit: AWAKE_INTERVAL_MS (10 min) backoff
//   - User-triggered refresh: wakes the car if sleeping (explicit user intent)
//   - No polling while tab is hidden
//
// TODO (Fleet Telemetry): Polling vehicle_data every few minutes is the
//   correct approach for now, but Tesla's Fleet Telemetry (streaming WebSocket)
//   would give sub-second updates without any polling cost. When the app is
//   ready to run a persistent server-side listener, replace this poller with
//   a telemetry subscription that pushes battery/charging state to Redis and
//   lets the frontend subscribe via SSE or WebSocket.
//
// DATA FLOW:
//   _poll() → GET /api/tesla/vehicle
//     → batteryStore.setFromTesla(pct)      — re-anchors estimation engine
//     → teslaVehicleStore.setFromVehicleData — raw snapshot for UI display

import { teslaStore } from './teslaStore'
import { teslaVehicleStore } from './teslaVehicleStore'
import { batteryStore } from '@/features/planning/batteryStore'

// Backend Redis cache is 5 min live + 15 min recent.
// 3-min frontend poll means the UI stays within the live window.
// Actual Tesla API calls: at most once per 15 min (backend-enforced).
const POLL_INTERVAL_MS  =  3 * 60 * 1000  // 3 min — awake car
const SLEEP_BACKOFF_MS  =  2 * 60 * 1000  // 2 min — sleeping car
const AWAKE_INTERVAL_MS = 10 * 60 * 1000  // 10 min — error/rate-limit backoff

export type PollStatus =
  | 'idle'
  | 'polling'
  | 'sleeping'
  | 'waking'         // user-triggered wake in progress (~30–45 s)
  | 'rate_limited'
  | 'auth_error'     // 401 — session expired or no vehicleId; user must reconnect
  | 'error'

type Listener = () => void
const _statusListeners = new Set<Listener>()

let _timer:  ReturnType<typeof setTimeout> | null = null
let _status: PollStatus = 'idle'
let _started = false

function _setStatus(s: PollStatus): void {
  _status = s
  _statusListeners.forEach((fn) => fn())
}

// ── Internal ──────────────────────────────────────────────────────────────

function _clearTimer(): void {
  if (_timer) { clearTimeout(_timer); _timer = null }
}

function _schedule(ms: number): void {
  _clearTimer()
  _timer = setTimeout(() => { void _poll() }, ms)
}

// Shape of /api/tesla/vehicle response (matches NormalizedVehicleState from vehicleCache)
interface VehicleResponse {
  batteryPercent: number | null  // null when battery_level missing from Tesla response
  chargingState:  string | null
  sleeping:       boolean
}

async function _poll(forceFlag = false): Promise<void> {
  if (!teslaStore.getState().connected) return
  _setStatus('polling')

  try {
    const url = forceFlag ? '/api/tesla/vehicle?force=1' : '/api/tesla/vehicle'
    const res = await fetch(url, { credentials: 'same-origin' })

    if (res.status === 401) {
      const body = await res.json().catch(() => ({})) as { error?: string }
      if (body.error === 'no_vehicle_id') {
        // Vehicle fetch failed during OAuth — session is otherwise valid.
        // vehicle.ts will try to auto-recover on this same request, so
        // reschedule a quick retry (30 s) before giving up and showing auth_error.
        _setStatus('auth_error')
        _schedule(30_000)
      } else {
        // session_expired or any other 401 — session is gone, user must reconnect
        _setStatus('auth_error')
        void teslaStore.checkStatus()
      }
      return
    }

    if (res.status === 429) {
      const data = (await res.json()) as { retryAfterMs?: number }
      _setStatus('rate_limited')
      _schedule(data.retryAfterMs ?? AWAKE_INTERVAL_MS)
      return
    }

    if (!res.ok) {
      _setStatus('error')
      _schedule(AWAKE_INTERVAL_MS)
      return
    }

    const data = (await res.json()) as {
      vehicle:  VehicleResponse | null
      sleeping?: boolean
      error?:    string
    }

    if (data.sleeping || !data.vehicle) {
      const cachedPct = data.vehicle?.batteryPercent ?? null

      // Pass cachedPct directly — null = server had no cache, UI falls back to manual
      teslaVehicleStore.setSleeping(cachedPct)

      if (cachedPct !== null) {
        batteryStore.setFromTesla(cachedPct)
      }
      _setStatus('sleeping')
      _schedule(SLEEP_BACKOFF_MS)
      return
    }

    const v = data.vehicle

    // Only update stores when battery is actually present in the response
    if (v.batteryPercent !== null) {
      teslaVehicleStore.setFromVehicleData(v.batteryPercent, v.chargingState ?? null)
      batteryStore.setFromTesla(v.batteryPercent)
    }

    _setStatus('idle')
    _schedule(POLL_INTERVAL_MS)
  } catch {
    _setStatus('error')
    _schedule(AWAKE_INTERVAL_MS)
  }
}

// ── Wake flow (user-triggered only) ──────────────────────────────────────

async function _wakeAndPoll(): Promise<void> {
  _setStatus('waking')

  try {
    const res = await fetch('/api/tesla/wake', {
      method:      'POST',
      credentials: 'same-origin',
    })

    if (res.status === 429) {
      // Already waking or woke recently — just retry the data poll
      _setStatus('idle')
      await _poll(true)
      return
    }

    if (!res.ok) {
      _setStatus('error')
      _schedule(AWAKE_INTERVAL_MS)
      return
    }

    const data = (await res.json()) as { woke?: boolean; timeout?: boolean }

    if (data.woke) {
      // Car is online — force-fetch fresh data (bypass any stale cache)
      await _poll(true)
    } else {
      // Timed out (45 s) — car didn't wake; keep sleeping state, short backoff
      teslaVehicleStore.setSleeping()
      _setStatus('sleeping')
      _schedule(SLEEP_BACKOFF_MS)
    }
  } catch {
    _setStatus('error')
    _schedule(AWAKE_INTERVAL_MS)
  }
}

// ── Public API ────────────────────────────────────────────────────────────

export const teslaPoller = {
  start(): void {
    if (_started) return
    _started = true

    // Only react to connected→disconnected or disconnected→connected transitions.
    // Ignoring intermediate loading=true emits prevents checkStatus() from
    // triggering a new poll while the car was already connected.
    let _prevConnected = teslaStore.getState().connected
    teslaStore.subscribe(() => {
      const { connected, loading } = teslaStore.getState()
      if (loading) return  // intermediate state — wait for final result
      if (connected && !_prevConnected) {
        _clearTimer()
        _setStatus('idle')
        void _poll()
      } else if (!connected && _prevConnected) {
        _clearTimer()
        _setStatus('idle')
        teslaVehicleStore.clear()
      }
      _prevConnected = connected
    })

    if (teslaStore.getState().connected) {
      void _poll()
    }

    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') {
        if (teslaStore.getState().connected) {
          _clearTimer()
          void _poll()
        }
      } else {
        _clearTimer()
      }
    })
  },

  getStatus(): PollStatus { return _status },

  subscribeStatus(fn: Listener): () => void {
    _statusListeners.add(fn)
    return () => _statusListeners.delete(fn)
  },

  /**
   * User-triggered refresh.
   * If car is sleeping → wake it first, then poll (takes up to 45 s).
   * If car is online → poll immediately.
   */
  async refresh(): Promise<void> {
    _clearTimer()
    const currentStatus = _status

    if (currentStatus === 'sleeping') {
      await _wakeAndPoll()
    } else {
      _setStatus('idle')
      await _poll()
      // If poll reveals car is sleeping, escalate to wake
      if (_status === 'sleeping') {
        await _wakeAndPoll()
      }
    }
  },
}
