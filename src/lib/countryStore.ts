// ─── Country Store ─────────────────────────────────────────────────────
//
// Persists the user's country selection in localStorage.
// Same pub/sub pattern as settingsStore — zero React deps.
//
// Reading:
//   countryStore.getCountryOrDefault()   → always returns a CountryConfig
//   countryStore.getCode()               → null until user has chosen
//   countryStore.isChosen()              → boolean
//
// Writing:
//   countryStore.setCountry('NO')        → persists + notifies subscribers
//
// Subscribing (for React via useSyncExternalStore):
//   countryStore.subscribe(fn)           → returns unsubscribe fn

import type { CountryCode, CountryConfig } from '@/config/countries'
import { COUNTRIES } from '@/config/countries'

const STORAGE_KEY = 'teslaradar:country'

type Listener = () => void
const _listeners = new Set<Listener>()
function _emit(): void { _listeners.forEach((fn) => fn()) }

function _load(): CountryCode | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw && raw in COUNTRIES) return raw as CountryCode
    return null
  } catch { return null }
}

function _save(code: CountryCode): void {
  try { localStorage.setItem(STORAGE_KEY, code) } catch { /* storage full */ }
}

export const countryStore = {
  /** Stored country code, or null if the user has not chosen yet. */
  getCode(): CountryCode | null {
    return _load()
  },

  /** Full config for stored country, or null if not yet chosen. */
  getCountry(): CountryConfig | null {
    const code = _load()
    return code ? (COUNTRIES[code] ?? null) : null
  },

  /**
   * Full config for stored country.
   * Falls back to Bulgaria when nothing is stored (e.g. during first-load
   * before the picker is confirmed — the map must still initialize somewhere).
   */
  getCountryOrDefault(): CountryConfig {
    const code = _load()
    return (code ? COUNTRIES[code] : null) ?? COUNTRIES.BG
  },

  /** True once the user has completed the country picker. */
  isChosen(): boolean {
    return _load() !== null
  },

  setCountry(code: CountryCode): void {
    _save(code)
    _emit()
  },

  subscribe(fn: Listener): () => void {
    _listeners.add(fn)
    return () => { _listeners.delete(fn) }
  },
}
