// ─── Vehicle Profile Store (localStorage) ──────────────────────────────
// Persists the user's Tesla vehicle profile locally.
// No server sync — device-local, like savedPlacesStore.

import type { VehicleProfile } from './types'

const STORAGE_KEY = 'teslaradar:vehicle_profile'

type Listener = () => void
const _listeners = new Set<Listener>()
function _emit(): void { _listeners.forEach((fn) => fn()) }

function _load(): VehicleProfile | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? (JSON.parse(raw) as VehicleProfile) : null
  } catch {
    return null
  }
}

function _save(p: VehicleProfile): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(p))
  } catch { /* storage full */ }
}

export const vehicleProfileStore = {
  get(): VehicleProfile | null {
    return _load()
  },

  save(profile: Omit<VehicleProfile, 'updatedAt'>): void {
    _save({ ...profile, updatedAt: Date.now() })
    _emit()
  },

  updateBattery(currentBatteryPercent: number, degradationPercent: number | null): void {
    const p = _load()
    if (!p) return
    _save({ ...p, currentBatteryPercent, degradationPercent, updatedAt: Date.now() })
    _emit()
  },

  clear(): void {
    try { localStorage.removeItem(STORAGE_KEY) } catch { /* ignore */ }
    _emit()
  },

  subscribe(fn: Listener): () => void {
    _listeners.add(fn)
    return () => { _listeners.delete(fn) }
  },
}
