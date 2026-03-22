// ─── Follow Mode Store (module-level, NOT React state) ───────────────
//
// DESIGN RATIONALE
// ─────────────────────────────────────────────────────────────────────
// Follow mode MUST NOT live in React/Zustand state because:
//
//   1. GPS ticks arrive at ~1 Hz. If each tick caused a React setState,
//      the entire component tree would re-render every second — unacceptable
//      on Tesla browser.
//
//   2. Leaflet operations (panTo, setView) are imperative. They must be
//      called directly from GPS callbacks without going through React.
//
//   3. The "is move programmatic?" mutex must be readable synchronously
//      inside Leaflet dragstart handlers without any closure staleness.
//
// Solution: a plain-JS module-level store with manual pub/sub.
// React components that need to reflect follow state (e.g. LocationButton
// icon) subscribe via useSyncExternalStore — the minimum-cost React hook
// for external stores. Only those specific components re-render when
// follow mode changes.
// ─────────────────────────────────────────────────────────────────────

import { useSyncExternalStore } from 'react'

// ── Private state ─────────────────────────────────────────────────
let _following = true
// Mutex: raised during programmatic panTo/setView to prevent the
// Leaflet 'dragstart' event from falsely disabling follow mode.
let _programmatic = false

type FollowListener = (following: boolean) => void
const _listeners = new Set<FollowListener>()

function _emit(): void {
  _listeners.forEach((fn) => fn(_following))
}

// ── Public API ───────────────────────────────────────────────────
export const followStore = {
  isFollowing: (): boolean => _following,

  setFollowing(value: boolean): void {
    if (_following === value) return
    _following = value
    _emit()
  },

  /** Call BEFORE any programmatic map.panTo / map.setView */
  beginProgrammaticMove(): void {
    _programmatic = true
  },

  /** Call AFTER the move completes (uses timeout to let Leaflet events fire) */
  endProgrammaticMove(): void {
    setTimeout(() => { _programmatic = false }, 150)
  },

  isProgrammaticMove: (): boolean => _programmatic,

  subscribe(listener: FollowListener): () => void {
    _listeners.add(listener)
    return () => { _listeners.delete(listener) }
  },
}

// ─── React hook ───────────────────────────────────────────────────
// Only components that render based on follow state use this.
// GPS processing code reads followStore directly — no hook needed.
export function useFollowing(): boolean {
  return useSyncExternalStore(
    (cb) => followStore.subscribe(() => { cb() }),
    () => followStore.isFollowing(),
    () => true,
  )
}
