// ─── Locale / Translation Helper ─────────────────────────────────────
//
// LANGUAGE RESOLUTION ORDER (highest priority first):
//   1. User override in localStorage  ('teslaradar:lang')
//   2. Country default  (BG → 'bg', NO → 'en')
//   3. Hard fallback → 'bg'
//
// TRANSLATION LOOKUP (t function):
//   t('alerts.police')  →  looks up DICTIONARY[lang]['alerts']['police']
//   Fallback chain: current lang → English → raw key string
//   This makes partial translations safe — a missing key never crashes.
//
// REACTIVITY:
//   langStore is a pub/sub store (same pattern as settingsStore).
//   It auto-notifies listeners when the country changes, so components
//   using useSyncExternalStore(langStore.subscribe, langStore.getLang)
//   will re-render when the user switches country or overrides the lang.
//
// USAGE IN REACT:
//   const lang = useSyncExternalStore(langStore.subscribe, langStore.getLang)
//   // then call t() anywhere in the render — it reads the live lang
//
// USAGE IN NON-REACT (e.g. alertEngine.ts):
//   t('alerts.police')   ← called at alert time, always reads current lang

import { DICTIONARY } from '@/config/i18n'
import { countryStore } from '@/lib/countryStore'

export type Lang = 'bg' | 'en' | 'no' | 'sv' | 'fi'

const STORAGE_KEY = 'teslaradar:lang'

// ── Language resolution ──────────────────────────────────────────────

const VALID_LANGS = new Set<Lang>(['bg', 'en', 'no', 'sv', 'fi'])

export function getLang(): Lang {
  try {
    const override = localStorage.getItem(STORAGE_KEY) as Lang | null
    if (override && VALID_LANGS.has(override)) return override
  } catch { /* localStorage unavailable */ }
  // Derive from stored country; default to 'bg' if nothing chosen yet
  return (countryStore.getCountryOrDefault().locale as Lang) ?? 'bg'
}

// ── t() — the translation function ───────────────────────────────────
//
// Accepts dot-notation keys: t('alerts.police'), t('map.satellite')
// Returns a string — never throws, never returns undefined.

export function t(key: string): string {
  const lang = getLang()

  // Try current language
  const primary = _lookup(lang, key)
  if (primary !== undefined) return primary

  // Fallback to English
  if (lang !== 'en') {
    const fallback = _lookup('en', key)
    if (fallback !== undefined) return fallback
  }

  // Last resort: return the key itself (makes missing keys obvious in UI)
  return key
}

function _lookup(lang: Lang, key: string): string | undefined {
  // Split once on dot — max 2 parts (group.name)
  const dot = key.indexOf('.')
  if (dot === -1) return undefined
  const group = key.slice(0, dot)
  const name  = key.slice(dot + 1)

  const dict = DICTIONARY[lang]
  if (!dict) return undefined
  const section = (dict as Record<string, Record<string, string>>)[group]
  if (!section) return undefined
  return section[name]
}

// ── langStore — reactive language store ──────────────────────────────
// Notifies subscribers when language changes (user override or country switch).

type Listener = () => void
const _listeners = new Set<Listener>()
function _emit(): void { _listeners.forEach((fn) => fn()) }

// Subscribe to countryStore so language updates automatically on country change.
// This runs once at module load — zero overhead per render.
countryStore.subscribe(_emit)

export const langStore = {
  /** Current language code. */
  getLang,

  /** Manually override language (stored in localStorage). */
  setLang(lang: Lang): void {
    try { localStorage.setItem(STORAGE_KEY, lang) } catch { /* full */ }
    _emit()
  },

  /** Remove manual override — language reverts to country default. */
  clearOverride(): void {
    try { localStorage.removeItem(STORAGE_KEY) } catch { /* full */ }
    _emit()
  },

  subscribe(fn: Listener): () => void {
    _listeners.add(fn)
    return () => { _listeners.delete(fn) }
  },
}
