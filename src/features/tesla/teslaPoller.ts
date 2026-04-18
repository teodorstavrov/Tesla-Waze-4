// ─── Tesla Live Data Poller ────────────────────────────────────────────────
//
// Polls /api/tesla/vehicle on a conservative schedule to keep battery %
// fresh without excessive Tesla API calls or unnecessary vehicle wake-ups.
//
// COST POLICY (cheap-first):
//   - Poll once immediately when Tesla connects (or on app start if already connected)
//   - If vehicle awake: re-poll every AWAKE_INTERVAL_MS (10 min)
//   - If vehicle sleeping: SLEEP_BACKOFF_MS (1 hour); never forces wake-up
//   - No polling while browser tab is hidden (Tesla screen off / switched away)
//   - Respects server 429 rate-limit — backs off by retryAfterMs from response
//
// DATA FLOW:
//   poll() → GET /api/tesla/vehicle → batteryStore.setFromTesla(pct)
//   batteryStore emits → FloatingStatsCard re-renders

import { teslaStore } from './teslaStore'
import { batteryStore } from '@/features/planning/batteryStore'

const AWAKE_INTERVAL_MS = 10 * 60 * 1000  // 10 min — conservative, cheap
const SLEEP_BACKOFF_MS  = 60 * 60 * 1000  // 1 hour — sleeping car, don't poke it

export type PollStatus = 'idle' | 'polling' | 'sleeping' | 'rate_limited'

let _timer:  ReturnType<typeof setTimeout> | null = null
let _status: PollStatus = 'idle'
let _started = false

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
  _status = 'polling'

  try {
    const res = await fetch('/api/tesla/vehicle', { credentials: 'same-origin' })

    // Server-side rate limit — respect the retry window
    if (res.status === 429) {
      const data = (await res.json()) as { retryAfterMs?: number }
      _status = 'rate_limited'
      _schedule(data.retryAfterMs ?? AWAKE_INTERVAL_MS)
      return
    }

    if (!res.ok) {
      _status = 'idle'
      _schedule(AWAKE_INTERVAL_MS)
      return
    }

    const data = (await res.json()) as {
      vehicle: { currentBatteryPercent: number } | null
      sleeping?: boolean
    }

    if (data.sleeping || !data.vehicle) {
      // Vehicle asleep — long backoff; never force wake-up
      _status = 'sleeping'
      _schedule(SLEEP_BACKOFF_MS)
      return
    }

    // Re-anchor battery estimation from live Tesla reading
    batteryStore.setFromTesla(data.vehicle.currentBatteryPercent)
    _status = 'idle'
    _schedule(AWAKE_INTERVAL_MS)
  } catch {
    // Network error — retry at normal interval
    _status = 'idle'
    _schedule(AWAKE_INTERVAL_MS)
  }
}

// ── Public API ────────────────────────────────────────────────────────────

export const teslaPoller = {
  /** Call once at app startup (safe to call multiple times — idempotent). */
  start(): void {
    if (_started) return
    _started = true

    // React to Tesla connection state changes
    teslaStore.subscribe(() => {
      const { connected } = teslaStore.getState()
      if (connected) {
        // Just connected → poll immediately
        _clearTimer()
        _status = 'idle'
        void _poll()
      } else {
        // Disconnected → stop polling
        _clearTimer()
        _status = 'idle'
      }
    })

    // Also poll immediately if already connected when app starts
    if (teslaStore.getState().connected) {
      void _poll()
    }

    // Pause polling while Tesla screen / tab is hidden; resume on return
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

  /** User-triggered manual refresh — resets any sleep backoff. */
  async refresh(): Promise<void> {
    _clearTimer()
    _status = 'idle'
    await _poll()
  },
}
