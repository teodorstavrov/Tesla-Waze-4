// ─── Battery Engine — Pure Computation Layer ────────────────────────────
//
// All functions here are PURE — no stores, no side effects, no imports
// that have module-level state. Safe to call from anywhere.
//
// Used by:
//   batteryTracker.ts  — per-GPS-tick energy drain
//   estimator.ts       — route arrival prediction
//   batteryStore.ts    — initial state construction
//
// ENERGY MODEL:
//   1. Effective pack size = nominal kWh × (1 - degradation%)
//   2. Starting energy     = effective kWh × (currentBatteryPercent / 100)
//   3. Drain per tick      = distanceKm × adjustedWhKm / 1000
//   4. New energy          = max(0, currentEnergy − drain)
//   5. New %               = (newEnergy / effectiveKwh) × 100

import { getTrimConfig } from './vehicleConfig'
import { getEffectiveUsableKwh } from './degradation'
import { speedFactor, tempFactor } from './estimator'
import type { VehicleProfile } from './types'

// ── Types ─────────────────────────────────────────────────────────────

export interface BatteryEngineState {
  currentEnergyKwh:          number  // absolute energy remaining in kWh
  usableKwhAfterDegradation: number  // effective pack size (denominator)
  currentBatteryPercent:     number  // derived: currentEnergy / usableKwh × 100
}

// ── Idle / HVAC drain ─────────────────────────────────────────────────
// When the car is stopped but navigation is active, small loads continue:
//   - 12V systems, infotainment, climate hold: ~200W average
//   - 200W = 0.2 kWh/h = 0.2/3600 kWh/s ≈ 0.0000556 kWh/s
// This is very small per tick (~2.7 mWh/s) but compounds over long stops.
export const IDLE_DRAIN_KWH_PER_SEC = 0.0000556

// ── Core functions ────────────────────────────────────────────────────

/**
 * Compute the effective usable kWh for a vehicle profile.
 * Falls back to 60 kWh if trim is unknown (safe middle ground).
 */
export function computeUsableKwh(profile: VehicleProfile): number {
  const trim = getTrimConfig(profile.model, profile.year, profile.trim)
  if (!trim) return 60
  return getEffectiveUsableKwh(trim.usableKwh, profile.degradationPercent, profile.year)
}

/**
 * Build the initial engine state from a vehicle profile.
 * Called when the user saves/updates their profile.
 */
export function initStateFromProfile(profile: VehicleProfile): BatteryEngineState {
  const usableKwh = computeUsableKwh(profile)
  const currentEnergyKwh = usableKwh * (profile.currentBatteryPercent / 100)
  return {
    currentEnergyKwh,
    usableKwhAfterDegradation: usableKwh,
    currentBatteryPercent: profile.currentBatteryPercent,
  }
}

/**
 * Compute adjusted Wh/km for current speed and temperature.
 * Falls back to 160 Wh/km if trim is unknown.
 */
export function computeAdjustedEfficiency(
  profile: VehicleProfile,
  speedKmh: number,
  tempCelsius: number | null,
): number {
  const trim = getTrimConfig(profile.model, profile.year, profile.trim)
  let eff = trim?.efficiencyWhKm ?? 160
  eff *= speedFactor(speedKmh)
  if (tempCelsius !== null) eff *= tempFactor(tempCelsius)
  return eff
}

/**
 * Compute energy drain kWh for a given distance and efficiency.
 */
export function computeDrainKwh(distKm: number, efficiencyWhKm: number): number {
  return (distKm * efficiencyWhKm) / 1000
}

/**
 * Apply a drain amount to an existing engine state.
 * Returns a new state (immutable).
 */
export function applyDrain(
  state: BatteryEngineState,
  drainKwh: number,
): BatteryEngineState {
  const newEnergy = Math.max(0, state.currentEnergyKwh - drainKwh)
  const usable = state.usableKwhAfterDegradation
  const newPct = usable > 0 ? (newEnergy / usable) * 100 : 0
  return {
    ...state,
    currentEnergyKwh: newEnergy,
    currentBatteryPercent: Math.round(newPct * 10) / 10,
  }
}
