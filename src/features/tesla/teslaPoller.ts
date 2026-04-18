// ─── Tesla Live Data Poller ────────────────────────────────────────────────
//
// Polls /api/tesla/vehicle on a conservative schedule.
//
// COST POLICY:
//   - Poll once immediately on connect / app resume
//   - If vehicle awake: re-poll every AWAKE_INTERVAL_MS (10 min)
//   - If vehicle sleeping: SLEEP_BACKOFF_MS (1 hour); never forces wake
//   - No polling while tab is hidden
//   - Respects server 429 rate-limit
//
// DATA FLOW:
//   poll() → GET /api/tesla/vehicle
//     → batteryStore.setFromTesla(pct)      (re-anchors estimation engine)
//     → teslaVehicleStore.setFromVehicleData (raw snapshot for UI display)

import { teslaStore } from './teslaStore'
import { teslaVehicleStore } from './teslaVehicleStore'
import { batteryStore } from '@/features/planning/batteryStore'

const AWAKE_INTERVAL_MS = 10 * 60 * 1000  // 10 min
const SLEEP_BACKOFF_MS  = 60 * 60 * 1000  // 1 hour — sleeping car, don't poke it

export type PollStatus = 'idle' | 'polling' | 'sleeping' | 'rate_limited' | 'error'

type Listener = () => void
const _statusListeners = new Set<Listener>()

let _timer:   ReturnType<typeof setTimeout> | null = null
let _status:  PollStatus = 'idle'
let _started  = false

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

async function _poll(): Promise<void> {
  if (!teslaStore.getState().connected) return
  _setStatus('polling')

  try {
    const res = await fetch('/api/tesla/vehicle', { credentials: 'same-origin' })

    // Server-side rate limit — respect the retry window
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
      vehicle: {
        currentBatteryPercent: number
        chargingState: string | null
      } | null
      sleeping?: boolean
    }

    if (data.sleeping || !data.vehicle) {
      // Vehicle asleep — update store with sleeping flag, long backoff, NO wake
      teslaVehicleStore.setSleeping()
      _setStatus('sleeping')
      _schedule(SLEEP_BACKOFF_MS)
      return
    }

    // Live data received — update both stores
    const { currentBatteryPercent, chargingState } = data.vehicle
    teslaVehicleStore.setFromVehicleData(currentBatteryPercent, chargingState ?? null)
    batteryStore.setFromTesla(currentBatteryPercent)
    _setStatus('idle')
    _schedule(AWAKE_INTERVAL_MS)
  } catch {
    _setStatus('error')
    _schedule(AWAKE_INTERVAL_MS)
  }
}

// ── Public API ────────────────────────────────────────────────────────────

export const teslaPoller = {
  /** Call once at app startup (idempotent). */
  start(): void {
    if (_started) return
    _started = true

    teslaStore.subscribe(() => {
      const { connected } = teslaStore.getState()
      if (connected) {
        _clearTimer()
        _setStatus('idle')
        void _poll()
      } else {
        _clearTimer()
        _setStatus('idle')
        teslaVehicleStore.clear()
      }
    })

    // Poll immediately if already connected on start
    if (teslaStore.getState().connected) {
      void _poll()
    }

    // Pause while tab hidden, resume on return
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

  /** User-triggered refresh — resets sleep backoff, polls immediately. */
  async refresh(): Promise<void> {
    _clearTimer()
    _setStatus('idle')
    await _poll()
  },
}
