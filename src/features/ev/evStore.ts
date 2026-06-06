// ─── EV Station Store (module-level, NOT React state) ─────────────────
//
// Fetch flow:
//   1. Hydrate immediately from localStorage (instant markers on load)
//   2. Fetch full country bbox from server (Redis snapshot, no live providers)
//   3. Merge result into existing stations by id — never replace, never clear
//   4. Skip fetch if same bbox and data is < 30 min old
//   5. On network error: keep whatever is in memory (stale-while-revalidate)

import type { NormalizedStation, StationsApiResponse } from './types'
import { logger } from '@/lib/logger'
import { countryStore } from '@/lib/countryStore'

const STALE_MS      = 30 * 60 * 1000       // re-fetch after 30 min
const LS_PREFIX     = 'ev-stations-cache'
const LS_TTL        = 24 * 60 * 60 * 1000  // discard localStorage after 24 h
const LS_MAX_STATIONS = 5_000              // cap stored stations to prevent Tesla browser OOM

// ── localStorage persistence (country-keyed) ─────────────────────

function _lsKey(country: string): string {
  return `${LS_PREFIX}:${country}`
}

function _saveToLocalStorage(country: string, stations: NormalizedStation[]): void {
  if (stations.length === 0) return  // never overwrite a good cache with empty
  // Cap stored stations — Tesla browser OOM with > ~6000 Leaflet markers
  const toStore = stations.length > LS_MAX_STATIONS ? stations.slice(0, LS_MAX_STATIONS) : stations
  try {
    localStorage.setItem(_lsKey(country), JSON.stringify({ stations: toStore, savedAt: Date.now() }))
  } catch { /* quota exceeded — non-fatal */ }
}

function _loadFromLocalStorage(country: string): NormalizedStation[] {
  try {
    const raw = localStorage.getItem(_lsKey(country))
    if (!raw) return []
    const { stations, savedAt } = JSON.parse(raw) as { stations: NormalizedStation[], savedAt: number }
    if (!Array.isArray(stations) || stations.length === 0) return []
    if (Date.now() - savedAt > LS_TTL) return []
    return stations
  } catch { return [] }
}

// ── State ─────────────────────────────────────────────────────────

type FetchStatus = 'idle' | 'loading' | 'ok' | 'error'

interface EvState {
  stations:        NormalizedStation[]
  status:          FetchStatus
  error:           string | null
  fetchedAt:       number | null
  bboxKey:         string | null
  meta:            StationsApiResponse['meta'] | null
  selectedStation: NormalizedStation | null
  markersVisible:  boolean
}

const _initCountry = countryStore.getCode() ?? 'BG'
const _cached      = _loadFromLocalStorage(_initCountry)

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
  logger.ev.debug('Hydrated from localStorage', { count: _cached.length })
}

type Listener = () => void
const _listeners = new Set<Listener>()

let _abortController: AbortController | null = null
let _fetchVersion = 0
let _lastCountry  = _initCountry

// ── Helpers ───────────────────────────────────────────────────────

function _emit(): void { _listeners.forEach((fn) => fn()) }

function _bboxKey(b: { minLat: number; minLng: number; maxLat: number; maxLng: number }): string {
  const r = (n: number) => Math.round(n * 100) / 100
  return `${r(b.minLat)},${r(b.minLng)},${r(b.maxLat)},${r(b.maxLng)}`
}

function _isStale(): boolean {
  return _state.fetchedAt == null || Date.now() - _state.fetchedAt >= STALE_MS
}

function _countryBbox() {
  const [[swLat, swLng], [neLat, neLng]] = countryStore.getCountryOrDefault().bounds
  return { minLat: swLat, minLng: swLng, maxLat: neLat, maxLng: neLng }
}

function _mergeStations(incoming: NormalizedStation[]): NormalizedStation[] {
  if (incoming.length === 0) return _state.stations  // never shrink with empty response
  // If incoming is a substantial full-country response (> 200 stations),
  // use it as the authoritative base — prevents unbounded accumulation across
  // sessions that crashes the Tesla browser (OOM with 30k+ markers).
  if (incoming.length > 200) return incoming
  // Small incoming (partial bbox top-up) — merge with existing
  const map = new Map(_state.stations.map((s) => [s.id, s]))
  for (const s of incoming) map.set(s.id, s)
  return [...map.values()]
}

// ── Public API ────────────────────────────────────────────────────

export const evStore = {
  getState(): Readonly<EvState> { return _state },

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

  /** Bust server in-memory cache and reload the full country station set. */
  async forceRefresh(): Promise<void> {
    const bbox = _countryBbox()
    const key  = _bboxKey(bbox)

    _abortController?.abort()
    _abortController = new AbortController()
    const version = ++_fetchVersion

    _state = { ..._state, status: 'loading', error: null }
    _emit()

    const sq  = (n: number) => Math.round(n * 20) / 20
    const url = `/api/ev/stations?bbox=${sq(bbox.minLat)},${sq(bbox.minLng)},${sq(bbox.maxLat)},${sq(bbox.maxLng)}&bust=1`
    logger.ev.info('Force-refreshing stations', { url })

    try {
      const res = await fetch(url, { signal: _abortController.signal })
      if (version !== _fetchVersion) return
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = (await res.json()) as StationsApiResponse
      if (version !== _fetchVersion) return

      const merged = _mergeStations(data.stations)
      _state = { ..._state, stations: merged, status: 'ok', error: null, fetchedAt: Date.now(), bboxKey: key, meta: data.meta }
      _saveToLocalStorage(countryStore.getCode() ?? 'BG', merged)
      logger.ev.info('Force-refresh complete', { fetched: data.stations.length, total: merged.length })
      _emit()
    } catch (err) {
      if (version !== _fetchVersion) return
      if ((err as Error).name === 'AbortError') return
      logger.ev.warn('Force-refresh failed — keeping cached stations', { err: String(err) })
      _state = { ..._state, status: _state.stations.length > 0 ? 'ok' : 'error', error: String(err) }
      _emit()
    }
  },

  async fetch(bbox: { minLat: number; minLng: number; maxLat: number; maxLng: number }): Promise<void> {
    if (typeof document !== 'undefined' && document.hidden) return

    // Country changed — swap immediately to the new country's cached stations (if any)
    const currentCountry = countryStore.getCode() ?? 'BG'
    if (currentCountry !== _lastCountry) {
      _lastCountry = currentCountry
      _abortController?.abort()
      const cached = _loadFromLocalStorage(currentCountry)
      _state = {
        ..._state,
        stations:  cached,
        fetchedAt: null,
        bboxKey:   null,
        status:    cached.length > 0 ? 'ok' : 'idle',
        error:     null,
      }
      if (cached.length > 0) _emit()
    }

    const key = _bboxKey(bbox)

    // Skip if same bbox and data is still fresh
    if (_state.bboxKey === key && !_isStale() && _state.status !== 'error') {
      logger.ev.debug('EV fetch skipped (fresh)', { key })
      return
    }

    if (_state.bboxKey !== key) _abortController?.abort()

    const hadData = _state.stations.length > 0
    _abortController  = new AbortController()
    const version     = ++_fetchVersion

    _state = { ..._state, status: 'loading', bboxKey: key, error: null }
    if (!hadData) _emit()  // show loading state only when we have nothing to display yet

    // Snap to 0.05° grid so nearby viewports share the same CDN-cached response
    const sq  = (n: number) => Math.round(n * 20) / 20
    const url = `/api/ev/stations?bbox=${sq(bbox.minLat)},${sq(bbox.minLng)},${sq(bbox.maxLat)},${sq(bbox.maxLng)}`
    logger.ev.debug('Fetching stations', { url, version })

    try {
      const res = await fetch(url, { signal: _abortController.signal })
      if (version !== _fetchVersion) return
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = (await res.json()) as StationsApiResponse
      if (version !== _fetchVersion) return

      const merged = _mergeStations(data.stations)
      _state = { ..._state, stations: merged, status: 'ok', error: null, fetchedAt: Date.now(), meta: data.meta }
      _saveToLocalStorage(countryStore.getCode() ?? 'BG', merged)
      logger.ev.info('Stations loaded', { fetched: data.stations.length, total: merged.length, cacheHit: data.meta.cacheHit })
      _emit()
    } catch (err) {
      if (version !== _fetchVersion) return
      if ((err as Error).name === 'AbortError') return
      logger.ev.warn('Stations fetch failed — keeping cached stations', { err: String(err) })
      // Keep existing stations visible; only go to error state if we have nothing
      _state = { ..._state, status: _state.stations.length > 0 ? 'ok' : 'error', error: String(err) }
      _emit()
    }
  },
}
