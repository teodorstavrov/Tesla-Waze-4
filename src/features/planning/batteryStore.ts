// ─── Battery Session Store ───────────────────────────────────────────────
//
// Holds the LIVE / EVOLVING battery state for the current session.
//
// SEPARATION OF CONCERNS:
//   vehicleProfileStore  — user-entered static data: model, year, initial %
//   batteryStore         — evolving session state: tracks drain over time
//
// This separation means the user's manually entered battery % is never
// silently overwritten by the estimation engine. The profile stays clean;
// only the session state drifts.
//
// SOURCE TRACKING:
//   'user_entered'  — the % was set explicitly by the user (trusted)
//   'estimated'     — the % has been modified by the drive model (an estimate)
//
// The UI must reflect source = 'estimated' with a visible "~" or "(оценка)"
// label so the user always knows this is a calculation, not a car reading.
//
// PERSISTENCE:
//   Session state → teslaradar:battery_session (separate key)
//   On app start: resume session if < SESSION_MAX_AGE_MS old
//   Otherwise: initialize fresh from vehicleProfileStore
//
// RESET / MANUAL CORRECTION:
//   batteryStore.resetFromProfile(profile) — called after user saves profile
//   This re-anchors the session to the freshly entered % (source: user_entered)

import { vehicleProfileStore } from './store'
import { initStateFromProfile } from './batteryEngine'
import type { VehicleProfile } from './types'

const SESSION_KEY = 'teslaradar:battery_session'
const SESSION_MAX_AGE_MS = 4 * 60 * 60 * 1000  // resume sessions up to 4h old

// ── Types ─────────────────────────────────────────────────────────────

export type BatterySource = 'user_entered' | 'estimated' | 'tesla_live'

export interface BatterySessionState {
  currentEnergyKwh:          number
  usableKwhAfterDegradation: number
  currentBatteryPercent:     number
  source:                    BatterySource
  initializedAt:             number   // when this session was first created
  lastUpdatedAt:             number   // last drain tick timestamp
}

// ── Internal state ────────────────────────────────────────────────────

type Listener = () => void
const _listeners = new Set<Listener>()
let _state: BatterySessionState | null = null

function _emit(): void { _listeners.forEach((fn) => fn()) }

// ── Private helpers ───────────────────────────────────────────────────

function _fromProfile(profile: VehicleProfile, source: BatterySource): BatterySessionState {
  const eng = initStateFromProfile(profile)
  const now = Date.now()
  return { ...eng, source, initializedAt: now, lastUpdatedAt: now }
}

function _persist(s: BatterySessionState): void {
  try { localStorage.setItem(SESSION_KEY, JSON.stringify(s)) } catch { /* storage full */ }
}

function _loadSession(): BatterySessionState | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY)
    if (!raw) return null
    const s = JSON.parse(raw) as BatterySessionState
    // Reject stale sessions
    if (Date.now() - s.lastUpdatedAt > SESSION_MAX_AGE_MS) return null
    return s
  } catch { return null }
}

// ── Initialization (runs at module load, before any component mounts) ─

function _init(): void {
  const session = _loadSession()
  if (session) {
    _state = session
    return
  }
  const profile = vehicleProfileStore.get()
  if (profile) {
    _state = _fromProfile(profile, 'user_entered')
    _persist(_state)
  }
}

_init()

// ── Public API ────────────────────────────────────────────────────────

export const batteryStore = {
  getState(): BatterySessionState | null {
    return _state
  },

  /**
   * Apply energy drain from a driving tick.
   * Called by batteryTracker on each GPS position update.
   * This is the hot path — kept minimal.
   */
  applyDrain(drainKwh: number): void {
    if (!_state) return
    const newEnergy = Math.max(0, _state.currentEnergyKwh - drainKwh)
    const usable = _state.usableKwhAfterDegradation
    const newPct = usable > 0 ? (newEnergy / usable) * 100 : 0
    _state = {
      ..._state,
      currentEnergyKwh: newEnergy,
      currentBatteryPercent: Math.round(newPct * 10) / 10,
      source: 'estimated',
      lastUpdatedAt: Date.now(),
    }
    _persist(_state)
    _emit()
  },

  /**
   * Re-anchor session to a freshly saved vehicle profile.
   * Called immediately after the user clicks "Запази" in VehicleProfileModal.
   * Resets source to 'user_entered' — the user has just corrected the value.
   */
  resetFromProfile(profile: VehicleProfile): void {
    _state = _fromProfile(profile, 'user_entered')
    _persist(_state)
    _emit()
  },

  /**
   * Wipe session state and reinitialize from the current vehicle profile.
   * Use this if the estimate has drifted and the user wants a clean reset.
   */
  clearSession(): void {
    try { localStorage.removeItem(SESSION_KEY) } catch { /* ignore */ }
    const profile = vehicleProfileStore.get()
    if (profile) {
      _state = _fromProfile(profile, 'user_entered')
      _persist(_state)
    } else {
      _state = null
    }
    _emit()
  },

  /**
   * Override battery % with a live reading from the Tesla Fleet API.
   * Called by the Tesla polling loop (Phase 2) when fresh vehicle data arrives.
   * Re-anchors the energy model so subsequent drain estimates start from the
   * real value rather than drifting from an old estimate.
   */
  setFromTesla(pct: number): void {
    if (!_state) return
    const usable    = _state.usableKwhAfterDegradation
    const newEnergy = (pct / 100) * usable
    _state = {
      ..._state,
      currentEnergyKwh:      newEnergy,
      currentBatteryPercent: pct,
      source:                'tesla_live',
      lastUpdatedAt:         Date.now(),
    }
    _persist(_state)
    _emit()
  },

  subscribe(fn: Listener): () => void {
    _listeners.add(fn)
    return () => { _listeners.delete(fn) }
  },
}
