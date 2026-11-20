// ─── GTA VI Mode Store ─────────────────────────────────────────────────────
// Lightweight localStorage-backed pub/sub for GTA VI Vice City mode.
// Same pattern as settingsStore — no external deps.

export type GTAQuality = 'full' | 'lite'

interface GTAModeState {
  active:  boolean
  quality: GTAQuality
}

const STORAGE_KEY = 'tesradar:gtaMode'
const DEFAULTS: GTAModeState = { active: false, quality: 'full' }

type Listener = () => void
const _listeners = new Set<Listener>()
function _emit(): void { _listeners.forEach((fn) => fn()) }

function _load(): GTAModeState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? { ...DEFAULTS, ...(JSON.parse(raw) as Partial<GTAModeState>) } : { ...DEFAULTS }
  } catch {
    return { ...DEFAULTS }
  }
}

function _save(s: GTAModeState): void {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(s)) } catch { /* quota full */ }
}

export const gtaModeStore = {
  getState(): GTAModeState  { return _load() },
  isActive(): boolean       { return _load().active },
  getQuality(): GTAQuality  { return _load().quality },

  toggle(): void {
    const s = _load()
    s.active = !s.active
    _save(s)
    _emit()
  },

  setActive(val: boolean): void {
    const s = _load()
    if (s.active === val) return
    s.active = val
    _save(s)
    _emit()
  },

  setQuality(q: GTAQuality): void {
    const s = _load()
    s.quality = q
    _save(s)
    _emit()
  },

  subscribe(fn: Listener): () => void {
    _listeners.add(fn)
    return () => { _listeners.delete(fn) }
  },
}
