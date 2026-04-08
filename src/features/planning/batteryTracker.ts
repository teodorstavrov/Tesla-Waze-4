// ─── Live Battery Drain Tracker ────────────────────────────────────────
//
// Runs entirely outside React. Subscribes to GPS position ticks and
// drives the battery estimation model forward in time.
//
// WRITES TO: batteryStore (session state) — NOT vehicleProfileStore directly.
// vehicleProfileStore is only updated periodically (every 30s) so the stored
// profile stays roughly in sync without excessive localStorage writes.
//
// ENERGY MODEL per tick:
//   distKm × adjustedWhKm / 1000 = drainKwh
// where adjustedWhKm = baseline × speedFactor × tempFactor
//
// IDLE DRAIN:
//   When speed < MIN_SPEED_KMH, a small idle/HVAC drain is applied
//   (~200W = 0.2 kWh/h) — models the car being on but stationary.

import { gpsStore } from '@/features/gps/gpsStore'
import { vehicleProfileStore } from './store'
import { batteryStore } from './batteryStore'
import { computeAdjustedEfficiency, computeDrainKwh, IDLE_DRAIN_KWH_PER_SEC } from './batteryEngine'
import { haversineMeters } from '@/lib/geo'

const MIN_MOVE_M            = 5       // ignore GPS drift < 5m
const MIN_SPEED_KMH         = 2       // below this = idle (not driving)
const PROFILE_SYNC_INTERVAL = 30_000  // sync to vehicleProfileStore every 30s

let _unsub: (() => void) | null = null
let _lastLat: number | null = null
let _lastLng: number | null = null
let _lastProfileSyncAt = 0
let _idleTickCount = 0

// External temperature — set by a weather integration when available
let _tempCelsius: number | null = null
export function setTrackerTemperature(tempC: number | null): void {
  _tempCelsius = tempC
}

function _onPosition(): void {
  const pos = gpsStore.getPosition()
  if (!pos) return

  const profile = vehicleProfileStore.get()
  if (!profile) return

  // Ensure batteryStore is initialized (handles cold app restart)
  if (!batteryStore.getState()) {
    batteryStore.resetFromProfile(profile)
  }

  const speed = pos.speedKmh ?? 0
  const now = Date.now()

  // ── Idle drain ────────────────────────────────────────────────────
  if (speed < MIN_SPEED_KMH) {
    _idleTickCount++
    _lastLat = pos.lat
    _lastLng = pos.lng
    // Apply 10 seconds of idle drain in one shot to reduce emit frequency
    if (_idleTickCount % 10 === 0) {
      batteryStore.applyDrain(IDLE_DRAIN_KWH_PER_SEC * 10)
    }
    return
  }

  _idleTickCount = 0

  // ── First moving tick — no previous position yet ──────────────────
  if (_lastLat === null || _lastLng === null) {
    _lastLat = pos.lat
    _lastLng = pos.lng
    return
  }

  // ── Distance-based drain ──────────────────────────────────────────
  const distM = haversineMeters([_lastLat, _lastLng], [pos.lat, pos.lng])
  _lastLat = pos.lat
  _lastLng = pos.lng

  if (distM < MIN_MOVE_M) return

  const distKm        = distM / 1000
  const efficiencyWhKm = computeAdjustedEfficiency(profile, speed, _tempCelsius)
  const drainKwh      = computeDrainKwh(distKm, efficiencyWhKm)

  batteryStore.applyDrain(drainKwh)

  // ── Periodic sync back to vehicleProfileStore ─────────────────────
  // Keeps the stored profile roughly current so the next app session
  // starts close to the last known state.
  if (now - _lastProfileSyncAt >= PROFILE_SYNC_INTERVAL) {
    _lastProfileSyncAt = now
    const bs = batteryStore.getState()
    if (bs) {
      vehicleProfileStore.updateBattery(
        Math.round(bs.currentBatteryPercent * 10) / 10,
        profile.degradationPercent,
      )
    }
  }
}

export const batteryTracker = {
  start(): void {
    if (_unsub) return
    _lastLat = null
    _lastLng = null
    _idleTickCount = 0
    _lastProfileSyncAt = 0
    _unsub = gpsStore.onPosition(_onPosition)
  },

  stop(): void {
    _unsub?.()
    _unsub = null
  },
}
