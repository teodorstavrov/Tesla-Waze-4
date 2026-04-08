// ─── Battery Arrival Estimator ──────────────────────────────────────────
// Estimates battery % remaining when arriving at destination.
//
// This is an APPROXIMATION based on model specs and known correction factors.
// It is NOT a guarantee. Many real-world variables cannot be known in advance.
//
// Methodology:
// 1. Look up baseline usable kWh and Wh/km for the vehicle trim
// 2. Apply degradation to reduce usable capacity
// 3. Estimate energy needed for the route (distance × efficiency)
// 4. Apply speed correction (higher speed = more consumption)
// 5. Apply temperature correction (cold = more consumption)
// 6. Calculate remaining battery after the journey

import { getTrimConfig } from './vehicleConfig'
import { getEffectiveUsableKwh } from './degradation'
import type { VehicleProfile } from './types'

export interface EstimatorInput {
  profile:       VehicleProfile
  distanceKm:    number           // route distance
  speedKmh?:     number | null    // current speed (optional)
  tempCelsius?:  number | null    // ambient temperature (optional)
}

export interface EstimatorResult {
  arrivalBatteryPercent: number   // estimated % at arrival (clamped 0–100)
  energyUsedKwh:         number   // estimated kWh consumed
  note:                  string   // explanation / confidence note
  isRough:               boolean  // true if key inputs were missing/defaulted
}

// ── Correction factors ────────────────────────────────────────────────
// Speed: baseline efficiency is at ~100 km/h.
// Above 120 km/h, consumption rises ~2% per 10 km/h.
// Below 80 km/h, consumption is slightly lower.
export function speedFactor(speedKmh: number): number {
  if (speedKmh <= 60)  return 0.88
  if (speedKmh <= 80)  return 0.93
  if (speedKmh <= 100) return 1.00
  if (speedKmh <= 120) return 1.08
  if (speedKmh <= 140) return 1.18
  return 1.30
}

// Temperature: Li-ion loses capacity and increases resistance in cold.
// Below 0°C: significant impact. Below -10°C: severe.
// Above 25°C: minor positive effect.
export function tempFactor(tempC: number): number {
  if (tempC >= 25)  return 0.97
  if (tempC >= 15)  return 1.00
  if (tempC >= 5)   return 1.06
  if (tempC >= 0)   return 1.12
  if (tempC >= -10) return 1.22
  return 1.35
}

export function estimateArrivalBattery(input: EstimatorInput): EstimatorResult {
  const { profile, distanceKm, speedKmh, tempCelsius } = input
  let isRough = false
  const notes: string[] = []

  // 1. Get vehicle config
  const trim = getTrimConfig(profile.model, profile.year, profile.trim)
  if (!trim) {
    return {
      arrivalBatteryPercent: Math.max(0, profile.currentBatteryPercent - Math.round((distanceKm / 400) * 100)),
      energyUsedKwh: 0,
      note: 'Приблизителна оценка — непознат модел',
      isRough: true,
    }
  }

  // 2. Apply degradation to usable capacity (via shared degradation module)
  if (profile.degradationPercent === null) {
    notes.push('деградацията е оценена по възрастта на автомобила')
    isRough = true
  }
  const usableKwh = getEffectiveUsableKwh(trim.usableKwh, profile.degradationPercent, profile.year)

  // 3. Baseline energy for route
  let efficiencyWhKm = trim.efficiencyWhKm

  // 4. Speed correction
  if (speedKmh != null && speedKmh > 5) {
    efficiencyWhKm *= speedFactor(speedKmh)
  } else {
    notes.push('скоростта е непозната — използвана базова')
    isRough = true
  }

  // 5. Temperature correction
  if (tempCelsius != null) {
    efficiencyWhKm *= tempFactor(tempCelsius)
  } else {
    // neutral — no note, doesn't add uncertainty meaningfully
  }

  // 6. Energy needed
  const energyUsedKwh = (efficiencyWhKm * distanceKm) / 1000

  // 7. Current energy in battery
  const currentKwh = usableKwh * (profile.currentBatteryPercent / 100)

  // 8. Remaining after journey
  const remainingKwh = Math.max(0, currentKwh - energyUsedKwh)
  const arrivalPct    = Math.min(100, Math.round((remainingKwh / usableKwh) * 100))

  const noteStr = notes.length > 0
    ? `Приблизителна оценка (${notes.join(', ')})`
    : 'Оценка по модел и маршрут'

  return {
    arrivalBatteryPercent: arrivalPct,
    energyUsedKwh:         Math.round(energyUsedKwh * 10) / 10,
    note:                  noteStr,
    isRough,
  }
}
