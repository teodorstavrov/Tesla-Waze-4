// ─── GTA Wanted Level Store ────────────────────────────────────────────
//
// Computes a 0–5 wanted level from GPS speed + nearest police event.
// Runs outside React — same module-level pub/sub pattern as alertEngine.
//
// THROTTLE: 2000ms (2× more conservative than alertEngine) to protect
// MCU1 (Tegra 3) which is the most constrained Tesla processor.
// At 100 km/h the car travels ~56m in 2s — acceptable latency for a fun HUD.
//
// FORMULA:
//   Speed stars (0–3): <70 km/h = 0, 70–99 = 1, 100–129 = 2, ≥130 = 3
//   Police stars (0–2): >500m = 0, 200–500m = 1, ≤200m = 2
//   Total = min(speed + police, 5)

import { gpsStore } from '@/features/gps/gpsStore'
import { eventStore } from '@/features/events/eventStore'
import { haversineMeters } from '@/lib/geo'

let _level     = 0
let _unsub: (() => void) | null = null
let _lastScanAt = 0
const THROTTLE_MS = 2000

type Listener = () => void
const _listeners = new Set<Listener>()
function _emit(): void { _listeners.forEach((fn) => fn()) }

function _speedStars(kmh: number | null): number {
  if (kmh === null) return 0
  if (kmh >= 130) return 3
  if (kmh >= 100) return 2
  if (kmh >= 70)  return 1
  return 0
}

function _policeStars(distM: number | null): number {
  if (distM === null) return 0
  if (distM <= 200)   return 2
  if (distM <= 500)   return 1
  return 0
}

function _onPosition(): void {
  const now = Date.now()
  if (now - _lastScanAt < THROTTLE_MS) return
  _lastScanAt = now

  const pos = gpsStore.getPosition()
  if (!pos) return

  const police = eventStore.getState().events.filter((e) => e.type === 'police')
  let nearestPoliceM: number | null = null
  for (const p of police) {
    const d = haversineMeters([pos.lat, pos.lng], [p.lat, p.lng])
    if (nearestPoliceM === null || d < nearestPoliceM) nearestPoliceM = d
  }

  const next = Math.min(5, _speedStars(pos.speedKmh) + _policeStars(nearestPoliceM))
  if (next !== _level) {
    _level = next
    _emit()
  }
}

export const wantedLevelStore = {
  getLevel: (): number => _level,

  subscribe(fn: Listener): () => void {
    _listeners.add(fn)
    return () => { _listeners.delete(fn) }
  },

  start(): void {
    if (_unsub) return
    _unsub = gpsStore.onPosition(_onPosition)
  },

  stop(): void {
    _unsub?.()
    _unsub = null
  },
}
