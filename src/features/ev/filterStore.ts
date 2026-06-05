// ─── EV Filter Store ───────────────────────────────────────────────────
// Module-level store for active station filters.
// Kept separate from evStore so filters can change without re-fetching.
//
// EvMarkerLayer and FloatingStatsCard both read getFilteredStations()
// which applies filters to the current evStore.stations on each call.
//
// TWO visibility flags:
//   filtersBarEnabled — Settings toggle; false = hide FilterBar entirely (no button)
//   filtersExpanded   — expand/collapse the bar (collapsed = show only "⚡ Филтри" chip)

import { evStore } from './evStore.js'
import type { NormalizedStation } from './types.js'

export type ConnectorFilter = 'Tesla' | 'CCS' | 'CHAdeMO' | 'Type2' | null
export type PowerFilter = 50 | 150 | null

interface FilterState {
  connector:        ConnectorFilter
  minPowerKw:       PowerFilter
  onlyAvailable:    boolean
  filtersBarEnabled: boolean   // Settings toggle — hides FilterBar completely when false
  filtersExpanded:   boolean   // expand/collapse state within the bar
}

const _LS_ENABLED  = 'teslaradar:ev-filters-enabled'
const _LS_EXPANDED = 'teslaradar:ev-filters-expanded'

function _load(key: string, def: boolean): boolean {
  try {
    const v = localStorage.getItem(key)
    if (v === null) return def
    return v !== '0'
  } catch { return def }
}

let _state: FilterState = {
  connector:         null,
  minPowerKw:        null,
  onlyAvailable:     false,
  filtersBarEnabled: _load(_LS_ENABLED,  true),
  filtersExpanded:   _load(_LS_EXPANDED, true),
}

type Listener = () => void
const _listeners = new Set<Listener>()
function _emit(): void { _listeners.forEach((fn) => fn()) }

// ── Filter logic ──────────────────────────────────────────────────

export function matchesFilters(s: NormalizedStation, state: FilterState): boolean {
  if (state.connector != null) {
    const has =
      s.connectors.some((c) => c.type === state.connector) ||
      (state.connector === 'Tesla' && s.source === 'tesla')
    if (!has) return false
  }
  if (state.minPowerKw != null && s.maxPowerKw != null && s.maxPowerKw < state.minPowerKw) {
    return false
  }
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

  setConnector(connector: ConnectorFilter): void {
    _state = { ..._state, connector: _state.connector === connector ? null : connector }
    _emit()
  },

  setMinPower(minPowerKw: PowerFilter): void {
    _state = { ..._state, minPowerKw: _state.minPowerKw === minPowerKw ? null : minPowerKw }
    _emit()
  },

  toggleAvailable(): void {
    _state = { ..._state, onlyAvailable: !_state.onlyAvailable }
    _emit()
  },

  reset(): void {
    _state = { ..._state, connector: null, minPowerKw: null, onlyAvailable: false }
    _emit()
  },

  /** Settings toggle — hides/shows the entire FilterBar (including collapsed button) */
  toggleFiltersBarEnabled(): void {
    const next = !_state.filtersBarEnabled
    _state = { ..._state, filtersBarEnabled: next }
    try { localStorage.setItem(_LS_ENABLED, next ? '1' : '0') } catch { /* ignore */ }
    _emit()
  },

  /** Expand/collapse the filter chips (collapsed shows only "⚡ Филтри" button) */
  toggleFiltersExpanded(): void {
    const next = !_state.filtersExpanded
    _state = { ..._state, filtersExpanded: next }
    try { localStorage.setItem(_LS_EXPANDED, next ? '1' : '0') } catch { /* ignore */ }
    _emit()
  },

  /** @deprecated use toggleFiltersExpanded */
  toggleFiltersVisible(): void { this.toggleFiltersExpanded() },
}
