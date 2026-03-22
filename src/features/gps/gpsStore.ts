// ─── GPS Position Store (module-level, NOT React state) ──────────────
//
// GPS position updates drive two imperative operations:
//   1. Move the avatar marker (Leaflet setLatLng)
//   2. Pan the map if follow mode is on (Leaflet panTo)
//
// Neither of these should go through React state. We use a module-level
// pub/sub store — subscribers are called synchronously on each GPS update.
//
// React components that need GPS data (e.g. stats card showing accuracy)
// can subscribe via useSyncExternalStore. For Phase 2 nothing in React
// needs raw GPS — only Leaflet operations consume it.

import type { GpsPosition, GpsStatus } from './types'

let _position: GpsPosition | null = null
let _status: GpsStatus = 'idle'

type PosListener = (pos: GpsPosition) => void
type StatusListener = (status: GpsStatus) => void

const _posListeners = new Set<PosListener>()
const _statusListeners = new Set<StatusListener>()

export const gpsStore = {
  getPosition: (): GpsPosition | null => _position,
  getStatus: (): GpsStatus => _status,

  setPosition(pos: GpsPosition): void {
    _position = pos
    if (_status !== 'active') {
      _status = 'active'
      _statusListeners.forEach((fn) => fn(_status))
    }
    _posListeners.forEach((fn) => fn(pos))
  },

  setStatus(status: GpsStatus): void {
    if (_status === status) return
    _status = status
    _statusListeners.forEach((fn) => fn(status))
  },

  /** Subscribe to position updates */
  onPosition(listener: PosListener): () => void {
    _posListeners.add(listener)
    return () => { _posListeners.delete(listener) }
  },

  /** Subscribe to status changes */
  onStatus(listener: StatusListener): () => void {
    _statusListeners.add(listener)
    return () => { _statusListeners.delete(listener) }
  },
}
