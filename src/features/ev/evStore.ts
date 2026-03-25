// ─── EV Station Store (module-level, NOT React state) ─────────────────
//
// Manages EV station data with:
//   • stale-while-revalidate: serve cached data immediately, refresh silently
//   • request versioning: discard responses from superseded fetches
//   • bbox-aware fetching: re-fetch when map view changes significantly
//   • stable identity: station list only replaces, never patches, so marker
//     registry in EvMarkerLayer can diff by id
//
// STALE threshold matches the server's merged-response cache TTL (10 min).
// If data is fresh enough for the same bbox, skip the fetch entirely.

import type { NormalizedStation, StationsApiResponse } from './types'
import { logger } from '@/lib/logger'

const STALE_MS = 10 * 60 * 1000           // 10 minutes — mirrors server cache TTL
const LS_KEY   = 'ev-stations-cache'
const LS_TTL   = 24 * 60 * 60 * 1000     // 24 hours — offline fallback max age

// ── localStorage persistence ──────────────────────────────────────

function _saveToLocalStorage(stations: NormalizedStation[]): void {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify({ stations, savedAt: Date.now() }))
  } catch { /* quota exceeded — non-fatal */ }
}

function _loadFromLocalStorage(): NormalizedStation[] {
  try {
    const raw = localStorage.getItem(LS_KEY)
    if (!raw) return []
    const { stations, savedAt } = JSON.parse(raw) as { stations: NormalizedStation[], savedAt: number }
    if (!Array.isArray(stations) || stations.length === 0) return []
    if (Date.now() - savedAt > LS_TTL) return []  // too stale — discard
    return stations
  } catch { return [] }
}

// ── State shape ───────────────────────────────────────────────────

type FetchStatus = 'idle' | 'loading' | 'ok' | 'error'

interface EvState {
  stations: NormalizedStation[]
  status: FetchStatus
  error: string | null
  fetchedAt: number | null
  bboxKey: string | null
  meta: StationsApiResponse['meta'] | null
  selectedStation: NormalizedStation | null
  markersVisible: boolean
}

// ── Module-level state ────────────────────────────────────────────

// Eagerly hydrate from localStorage so the map shows stations on first
// render even before the first network request completes (or when offline).
const _cached = _loadFromLocalStorage()

let _state: EvState = {
  stations:        _cached,
  status:          _cached.length > 0 ? 'ok' : 'idle',
  error:           null,
  fetchedAt:       null,
  bboxKey:         null,
  meta:            null,
  selectedStation: null,
  markersVisible:  true,
}

if (_cached.length > 0) {
  logger.ev.debug('Hydrated from localStorage cache', { count: _cached.length })
}

type Listener = () => void
const _listeners = new Set<Listener>()

let _abortController: AbortController | null = null
let _fetchVersion = 0

// ── Internal helpers ──────────────────────────────────────────────

function _emit(): void {
  _listeners.forEach((fn) => fn())
}

function _bboxKey(b: { minLat: number; minLng: number; maxLat: number; maxLng: number }): string {
  // Round to 2 decimal places (~1km resolution) to avoid refetching on tiny pans
  const r = (n: number) => Math.round(n * 100) / 100
  return `${r(b.minLat)},${r(b.minLng)},${r(b.maxLat)},${r(b.maxLng)}`
}

function _isStale(): boolean {
  return _state.fetchedAt == null || Date.now() - _state.fetchedAt >= STALE_MS
}

// ── Public API ────────────────────────────────────────────────────

export const evStore = {
  getState(): Readonly<EvState> {
    return _state
  },

  subscribe(listener: Listener): () => void {
    _listeners.add(listener)
    return () => { _listeners.delete(listener) }
  },

  selectStation(station: NormalizedStation | null): void {
    if (_state.selectedStation?.id === station?.id) return
    _state = { ..._state, selectedStation: station }
    _emit()
  },

  toggleMarkersVisible(): void {
    _state = { ..._state, markersVisible: !_state.markersVisible }
    _emit()
  },

  async fetch(bbox: { minLat: number; minLng: number; maxLat: number; maxLng: number }): Promise<void> {
    const key = _bboxKey(bbox)

    // Same bbox, data is fresh → skip
    if (
      _state.bboxKey === key &&
      !_isStale() &&
      _state.status !== 'error'
    ) {
      logger.ev.debug('EV fetch skipped (fresh cache)', { key })
      return
    }

    // Abort any in-flight request for a different bbox
    if (_state.bboxKey !== key) {
      _abortController?.abort()
    }

    // If we have stale data for a different bbox, emit immediately so markers
    // update from old data while the new fetch is in flight (stale-while-revalidate)
    const hadData = _state.stations.length > 0

    _abortController = new AbortController()
    const version = ++_fetchVersion

    _state = {
      ..._state,
      status: 'loading',
      bboxKey: key,
      error: null,
    }

    // Only re-emit if this is a visible state change (no data yet, or new bbox)
    if (!hadData || _state.bboxKey !== key) _emit()

    const url = `/api/ev/stations?bbox=${bbox.minLat},${bbox.minLng},${bbox.maxLat},${bbox.maxLng}`
    logger.ev.debug('Fetching stations', { url, version })

    try {
      const res = await fetch(url, { signal: _abortController.signal })

      if (version !== _fetchVersion) return  // superseded by newer request

      if (!res.ok) throw new Error(`HTTP ${res.status}`)

      const data = (await res.json()) as StationsApiResponse

      if (version !== _fetchVersion) return

      _state = {
        ..._state,
        stations: data.stations,
        status: 'ok',
        error: null,
        fetchedAt: Date.now(),
        meta: data.meta,
      }

      _saveToLocalStorage(data.stations)

      logger.ev.info('Stations loaded', {
        count: data.stations.length,
        dedup: data.meta.deduplicated,
        cacheHit: data.meta.cacheHit,
      })

      _emit()
    } catch (err) {
      if (version !== _fetchVersion) return
      if ((err as Error).name === 'AbortError') return

      logger.ev.warn('Stations fetch failed', { err: String(err) })

      // If we already have data (possibly from SW cache), keep showing it
      // rather than switching to error state — user sees stale data, not broken UI
      if (_state.stations.length > 0) {
        _state = { ..._state, status: 'ok' }
      } else {
        _state = { ..._state, status: 'error', error: String(err) }
      }
      _emit()
    }
  },
}
