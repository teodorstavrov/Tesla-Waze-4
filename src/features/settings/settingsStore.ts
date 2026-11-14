// ─── User Settings Store (localStorage) ───────────────────────────────
// Device-local user preferences. No server sync.

import type { PerformanceMode } from '@/config/performanceProfiles'

export type HeadingMode = 'north-up' | 'course-up'

interface Settings {
  showTraffic:          boolean
  performanceMode:      PerformanceMode
  headingMode:          HeadingMode
  wantedLevelEnabled:   boolean
  wantedLevelEffects:   boolean
}

const STORAGE_KEY = 'teslaradar:settings'
const DEFAULTS: Settings = {
  showTraffic:          false,
  performanceMode:      'auto',
  headingMode:          'north-up',
  wantedLevelEnabled:   true,
  wantedLevelEffects:   false,  // default OFF — safe for all Tesla hardware (MCU1/MCU2/MCU3)
}

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

  toggleTraffic(): void {
    const s = _load()
    s.showTraffic = !s.showTraffic
    _save(s)
    _emit()
  },

  setPerformanceMode(mode: PerformanceMode): void {
    const s = _load()
    s.performanceMode = mode
    _save(s)
    _emit()
  },

  setHeadingMode(mode: HeadingMode): void {
    const s = _load()
    s.headingMode = mode
    _save(s)
    _emit()
  },

  toggleWantedLevel(): void {
    const s = _load()
    s.wantedLevelEnabled = !s.wantedLevelEnabled
    _save(s)
    _emit()
  },

  toggleWantedLevelEffects(): void {
    const s = _load()
    s.wantedLevelEffects = !s.wantedLevelEffects
    _save(s)
    _emit()
  },

  subscribe(fn: Listener): () => void {
    _listeners.add(fn)
    return () => { _listeners.delete(fn) }
  },
}
