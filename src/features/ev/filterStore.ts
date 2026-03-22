// ─── EV Filter Store ───────────────────────────────────────────────────
// Module-level store for active station filters.
// Kept separate from evStore so filters can change without re-fetching.
//
// EvMarkerLayer and FloatingStatsCard both read getFilteredStations()
// which applies filters to the current evStore.stations on each call.

import { evStore } from './evStore.js'
import type { NormalizedStation } from './types.js'

export type ConnectorFilter = 'Tesla' | 'CCS' | 'CHAdeMO' | 'Type2' | null
export type PowerFilter = 50 | 150 | null

interface FilterState {
  connector: ConnectorFilter
  minPowerKw: PowerFilter
  onlyAvailable: boolean
}

let _state: FilterState = {
  connector:     null,
  minPowerKw:    null,
  onlyAvailable: false,
}

type Listener = () => void
const _listeners = new Set<Listener>()

function _emit(): void {
  _listeners.forEach((fn) => fn())
}

// ── Filter logic ──────────────────────────────────────────────────

export function matchesFilters(s: NormalizedStation, state: FilterState): boolean {
  // Connector filter — Tesla source always counts as having Tesla connectors
  if (state.connector != null) {
    const has =
      s.connectors.some((c) => c.type === state.connector) ||
      (state.connector === 'Tesla' && s.source === 'tesla')
    if (!has) return false
  }

  // Power filter — skip stations that explicitly report lower power
  // (stations with null maxPowerKw pass through — we don't know their power)
  if (state.minPowerKw != null && s.maxPowerKw != null && s.maxPowerKw < state.minPowerKw) {
    return false
  }

  // Availability filter
  if (state.onlyAvailable && s.status !== 'available') return false

  return true
}

// ── Public API ────────────────────────────────────────────────────

export const filterStore = {
  getState(): Readonly<FilterState> {
    return _state
  },

  /** Returns evStore.stations with active filters applied */
  getFilteredStations(): NormalizedStation[] {
    const stations = evStore.getState().stations
    if (!_state.connector && !_state.minPowerKw && !_state.onlyAvailable) return stations
    return stations.filter((s) => matchesFilters(s, _state))
  },

  isActive(): boolean {
    return _state.connector != null || _state.minPowerKw != null || _state.onlyAvailable
  },

  subscribe(listener: Listener): () => void {
    _listeners.add(listener)
    return () => { _listeners.delete(listener) }
  },

  /** Toggle connector filter — clicking the active one clears it */
  setConnector(connector: ConnectorFilter): void {
    _state = { ..._state, connector: _state.connector === connector ? null : connector }
    _emit()
  },

  /** Toggle power filter */
  setMinPower(minPowerKw: PowerFilter): void {
    _state = { ..._state, minPowerKw: _state.minPowerKw === minPowerKw ? null : minPowerKw }
    _emit()
  },

  toggleAvailable(): void {
    _state = { ..._state, onlyAvailable: !_state.onlyAvailable }
    _emit()
  },

  reset(): void {
    _state = { connector: null, minPowerKw: null, onlyAvailable: false }
    _emit()
  },
}
