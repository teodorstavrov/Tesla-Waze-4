// ─── Add Station Store ──────────────────────────────────────────────────
// Simple signal store that opens/closes the AddStationForm modal.
// The map's imperative long-press handler calls open(); the React form
// component subscribes and renders when open === true.

type Listener = () => void

interface AddStationState {
  open: boolean
  lat:  number
  lng:  number
  address: string
}

let _state: AddStationState = { open: false, lat: 0, lng: 0, address: '' }
const _listeners = new Set<Listener>()

function _emit() { _listeners.forEach((fn) => fn()) }

export const addStationStore = {
  getState(): Readonly<AddStationState> { return _state },

  subscribe(fn: Listener): () => void {
    _listeners.add(fn)
    return () => { _listeners.delete(fn) }
  },

  open(lat: number, lng: number, address: string): void {
    _state = { open: true, lat, lng, address }
    _emit()
  },

  close(): void {
    _state = { ..._state, open: false }
    _emit()
  },
}
