// ─── User Settings Store (localStorage) ───────────────────────────────
// Device-local user preferences. No server sync.

export type HeadingMode = 'course-up' | 'north-up'

interface Settings {
  headingMode:  HeadingMode
  showTraffic:  boolean
}

const STORAGE_KEY = 'teslaradar:settings'
const DEFAULTS: Settings = { headingMode: 'north-up', showTraffic: false }

type Listener = () => void
const _listeners = new Set<Listener>()
function _emit(): void { _listeners.forEach((fn) => fn()) }

function _load(): Settings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? { ...DEFAULTS, ...(JSON.parse(raw) as Partial<Settings>) } : { ...DEFAULTS }
  } catch {
    return { ...DEFAULTS }
  }
}

function _save(s: Settings): void {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(s)) } catch { /* full */ }
}

export const settingsStore = {
  get(): Settings { return _load() },

  setHeadingMode(mode: HeadingMode): void {
    const s = _load()
    s.headingMode = mode
    _save(s)
    _emit()
  },

  toggleTraffic(): void {
    const s = _load()
    s.showTraffic = !s.showTraffic
    _save(s)
    _emit()
  },

  subscribe(fn: Listener): () => void {
    _listeners.add(fn)
    return () => { _listeners.delete(fn) }
  },
}
