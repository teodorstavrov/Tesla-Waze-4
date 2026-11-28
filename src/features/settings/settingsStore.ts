// ─── User Settings Store (localStorage) ───────────────────────────────
// Device-local user preferences. No server sync.

import type { PerformanceMode } from '@/config/performanceProfiles'

export type HeadingMode = 'north-up' | 'course-up'

export const PITCH_STEP = 15
export const PITCH_MIN  = 0
export const PITCH_MAX  = 45

interface Settings {
  showTraffic:          boolean
  performanceMode:      PerformanceMode
  headingMode:          HeadingMode
  mapPitch:             number
  avgSpeedSections:     boolean
}

const STORAGE_KEY = 'teslaradar:settings'
const DEFAULTS: Settings = {
  showTraffic:          false,
  performanceMode:      'auto',
  headingMode:          'north-up',
  mapPitch:             45,
  avgSpeedSections:     true,
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

  toggleAvgSpeedSections(): void {
    const s = _load()
    s.avgSpeedSections = !s.avgSpeedSections
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

  setMapPitch(pitch: number): void {
    const s = _load()
    s.mapPitch = Math.max(PITCH_MIN, Math.min(PITCH_MAX, pitch))
    _save(s)
    _emit()
  },

  subscribe(fn: Listener): () => void {
    _listeners.add(fn)
    return () => { _listeners.delete(fn) }
  },
}
