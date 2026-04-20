// ─── Tesla Live Data Poller ────────────────────────────────────────────────
//
// Polls /api/tesla/vehicle on a conservative schedule.
//
// COST POLICY:
//   - Poll once immediately on connect / app resume
//   - If vehicle awake: re-poll every POLL_INTERVAL_MS (20 min)
//   - If vehicle sleeping: SLEEP_BACKOFF_MS retry, no auto-wake
//   - On error / rate-limit: AWAKE_INTERVAL_MS backoff
//   - User-triggered refresh: wakes the car if sleeping (explicit user intent)
//   - No polling while tab is hidden
//
// DATA FLOW:
//   _poll() → GET /api/tesla/vehicle
//     → batteryStore.setFromTesla(pct)      — re-anchors estimation engine
//     → teslaVehicleStore.setFromVehicleData — raw snapshot for UI display

import { teslaStore } from './teslaStore'
import { teslaVehicleStore } from './teslaVehicleStore'
import { batteryStore } from '@/features/planning/batteryStore'


// Backend caches vehicle state for 15 min, so polling every 20 min is enough.
const POLL_INTERVAL_MS  = 20 * 60 * 1000  // 20 min — normal awake cycle
const SLEEP_BACKOFF_MS  =  2 * 60 * 1000  // 2 min  — retry while sleeping
const AWAKE_INTERVAL_MS = 10 * 60 * 1000  // 10 min — backoff after error/rate-limit
                                           // (was missing → ReferenceError killed poller)

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
  console.log('[TESLA_FIX] _poll start | force:', forceFlag)

  try {
    const url = forceFlag ? '/api/tesla/vehicle?force=1' : '/api/tesla/vehicle'
    const res = await fetch(url, { credentials: 'same-origin' })
    console.log('[TESLA_FIX] raw response status:', res.status)

    if (res.status === 401) {
      // Session expired or vehicleId missing — re-check status so UI reflects reality
      const body = await res.json().catch(() => ({})) as { error?: string }
      console.log('[TESLA_FIX] 401 from /api/tesla/vehicle:', body.error)
      _setStatus('auth_error')
      // Re-sync connection state — this will show "disconnected" if session is truly gone
      void teslaStore.checkStatus()
      return  // no retry — user must reconnect
    }

    if (res.status === 429) {
      const data = (await res.json()) as { retryAfterMs?: number }
      _setStatus('rate_limited')
      _schedule(data.retryAfterMs ?? AWAKE_INTERVAL_MS)
      return
    }

    if (!res.ok) {
      console.log('[TESLA_FIX] non-ok response, scheduling AWAKE_INTERVAL_MS backoff')
      _setStatus('error')
      _schedule(AWAKE_INTERVAL_MS)
      return
    }

    const data = (await res.json()) as {
      vehicle:  VehicleResponse | null
      sleeping?: boolean
      error?:    string
    }

    console.log('[BATTERY_FIX] poll response battery:', data.vehicle?.batteryPercent ?? null,
      '| sleeping flag:', data.sleeping ?? false,
      '| vehicle null:', data.vehicle === null)

    if (data.sleeping || !data.vehicle) {
      // sleeping=true OR vehicle=null: use cached battery if available.
      // sleeping does NOT suppress a valid batteryPercent — it passes through unchanged.
      const cachedPct = data.vehicle?.batteryPercent ?? null
      console.log('[BATTERY_FIX] sleeping flag: true | cached battery from server:', cachedPct)

      // Pass cachedPct directly — null = server had no cache, UI will fall back to manual
      teslaVehicleStore.setSleeping(cachedPct)
      console.log('[BATTERY_FIX] teslaVehicleStore battery:', teslaVehicleStore.getSnapshot()?.batteryPercent ?? null)

      if (cachedPct !== null) {
        batteryStore.setFromTesla(cachedPct)
        console.log('[BATTERY_FIX] batteryStore tesla battery:', batteryStore.getState()?.currentBatteryPercent ?? null,
          '| source:', batteryStore.getState()?.source)
      } else {
        console.log('[BATTERY_FIX] batteryStore tesla battery: skipped — no cached % from server')
      }
      _setStatus('sleeping')
      _schedule(SLEEP_BACKOFF_MS)
      return
    }

    const v = data.vehicle
    console.log('[BATTERY_FIX] sleeping flag: false | live battery from server:', v.batteryPercent)

    // Guard: only update stores when battery is actually present
    if (v.batteryPercent !== null) {
      teslaVehicleStore.setFromVehicleData(v.batteryPercent, v.chargingState ?? null)
      batteryStore.setFromTesla(v.batteryPercent)
    } else {
      console.log('[BATTERY_FIX] live battery is null — stores NOT updated, keeping last known values')
    }

    console.log('[BATTERY_FIX] teslaVehicleStore battery:', teslaVehicleStore.getSnapshot()?.batteryPercent ?? null)
    console.log('[BATTERY_FIX] batteryStore tesla battery:', batteryStore.getState()?.currentBatteryPercent ?? null,
      '| source:', batteryStore.getState()?.source)
    _setStatus('idle')
    _schedule(POLL_INTERVAL_MS)
  } catch (err) {
    console.log('[TESLA_FIX] _poll caught error:', String(err))
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
  } catch (err) {
    console.log('[TESLA_FIX] _wakeAndPoll caught error:', String(err))
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
