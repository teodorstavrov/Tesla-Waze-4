// ─── Camera Store (module-level, NOT React state) ──────────────────────
//
// Fetches static speed cameras for the active country once on first use.
// localStorage cache (24h) per country — cameras rarely change.
// Stale-while-revalidate: serves cached data immediately, refreshes silently.
// Reloads automatically when the user switches country.

import type { SpeedCamera } from './types'
import { countryStore } from '@/lib/countryStore'

const LS_PREFIX = 'speed-cameras-cache'
const LS_TTL    = 24 * 60 * 60 * 1000   // 24h — mirrors server cache
const STALE_MS  =  1 * 60 * 60 * 1000   // 1h — refetch after this long

// ── localStorage (per-country) ────────────────────────────────────

function _lsKey(country: string): string {
  return `${LS_PREFIX}:${country}`
}

function _save(country: string, cameras: SpeedCamera[]): void {
  try { localStorage.setItem(_lsKey(country), JSON.stringify({ cameras, savedAt: Date.now() })) }
  catch { /* quota — non-fatal */ }
}

function _load(country: string): SpeedCamera[] {
  try {
    const raw = localStorage.getItem(_lsKey(country))
    if (!raw) return []
    const { cameras, savedAt } = JSON.parse(raw) as { cameras: SpeedCamera[]; savedAt: number }
    if (!Array.isArray(cameras)) return []
    if (Date.now() - savedAt > LS_TTL) return []
    return cameras
  } catch { return [] }
}

// ── State ─────────────────────────────────────────────────────────

type Listener = () => void
const _listeners = new Set<Listener>()

interface CameraState {
  cameras:   SpeedCamera[]
  status:    'idle' | 'loading' | 'ok' | 'error'
  fetchedAt: number | null
  country:   string
}

const _initCountry = countryStore.getCode() ?? 'BG'
const _initial     = _load(_initCountry)

let _state: CameraState = {
  cameras:   _initial,
  status:    _initial.length > 0 ? 'ok' : 'idle',
  fetchedAt: _initial.length > 0 ? Date.now() : null,
  country:   _initCountry,
}

let _fetchVersion = 0

function _emit(): void { _listeners.forEach((fn) => fn()) }

// ── Fetch ─────────────────────────────────────────────────────────

async function _fetch(country: string): Promise<void> {
  const version = ++_fetchVersion

  console.log(`[NO_CAM] fetch:start country=${country} version=${version} stored=${_state.cameras.length} fetchedAt=${_state.fetchedAt}`)

  // Stale-while-revalidate: if we have fresh data for this country, skip
  if (
    _state.country   === country &&
    _state.fetchedAt !== null &&
    Date.now() - _state.fetchedAt < STALE_MS &&
    _state.cameras.length > 0
  ) {
    console.log(`[NO_CAM] fetch:skip-stale country=${country} cameras=${_state.cameras.length}`)
    return
  }

  if (_state.status !== 'loading') {
    _state = { ..._state, status: 'loading', country }
    _emit()
  }

  try {
    const res = await fetch(`/api/cameras?country=${country}`)
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const data = await res.json() as { cameras: SpeedCamera[] }

    if (version !== _fetchVersion) {
      console.log(`[NO_CAM] fetch:superseded country=${country} version=${version} current=${_fetchVersion}`)
      return
    }

    console.log(`[NO_CAM] fetch:result country=${country} cameras=${data.cameras.length}`)
    _state = { cameras: data.cameras, status: 'ok', fetchedAt: Date.now(), country }
    _save(country, data.cameras)
    _emit()
  } catch (err) {
    if (version !== _fetchVersion) return
    console.error(`[NO_CAM] fetch:error country=${country}`, err)
    // Keep existing data on error — don't wipe the map
    _state = { ..._state, status: 'error' }
    _emit()
  }
}

// ── Country switch — reload when user switches country ─────────────

countryStore.subscribe(() => {
  const newCountry = countryStore.getCode()
  if (!newCountry || newCountry === _state.country) return

  // Immediately serve localStorage cache for the new country (may be empty)
  const cached = _load(newCountry)
  _state = {
    cameras:   cached,
    status:    cached.length > 0 ? 'ok' : 'idle',
    fetchedAt: cached.length > 0 ? Date.now() : null,
    country:   newCountry,
  }
  _emit()

  void _fetch(newCountry)
})

// ── Public API ────────────────────────────────────────────────────

export const cameraStore = {
  getState(): Readonly<CameraState> { return _state },

  subscribe(fn: Listener): () => void {
    _listeners.add(fn)
    return () => { _listeners.delete(fn) }
  },

  /** Trigger initial fetch for the current country (called once by CameraMarkerLayer on mount) */
  load(): void { void _fetch(countryStore.getCode() ?? 'BG') },
}
