// ─── normalizeVehicleData regression tests ───────────────────────────────
//
// Run with: npx tsx --test api/_lib/tesla/normalize.test.ts
// (Node 18+ built-in test runner; no additional framework needed)
//
// These tests guard against the two main failure modes that caused live
// battery % to not reach the UI:
//   1. battery_level present → must survive normalization as a number
//   2. battery_level absent  → must become null (not 0 or undefined)
//   3. VehicleState.source must always be 'tesla_live'

import { strict as assert } from 'node:assert'
import { describe, it } from 'node:test'
import { normalizeVehicleData } from './normalize.js'

describe('normalizeVehicleData', () => {
  it('extracts battery_level when present', () => {
    const result = normalizeVehicleData({
      charge_state: { battery_level: 72, charging_state: 'Stopped' },
    })
    assert.strictEqual(result.currentBatteryPercent, 72)
    assert.strictEqual(result.chargingState, 'Stopped')
    assert.strictEqual(result.source, 'tesla_live')
  })

  it('returns null battery when battery_level is absent', () => {
    const result = normalizeVehicleData({
      charge_state: { charging_state: 'Disconnected' },
    })
    assert.strictEqual(result.currentBatteryPercent, null,
      'missing battery_level must become null, not 0 or undefined')
  })

  it('returns null battery when charge_state is entirely absent', () => {
    const result = normalizeVehicleData({})
    assert.strictEqual(result.currentBatteryPercent, null)
  })

  it('does NOT convert battery 0% to null (valid edge case)', () => {
    const result = normalizeVehicleData({
      charge_state: { battery_level: 0 },
    })
    assert.strictEqual(result.currentBatteryPercent, 0,
      'battery at 0% is valid — must not be coerced to null')
  })

  it('converts battery_range from miles to km', () => {
    const result = normalizeVehicleData({
      charge_state: { battery_level: 80, battery_range: 100 },
    })
    assert.ok(result.batteryRangeKm !== null)
    assert.ok(Math.abs((result.batteryRangeKm ?? 0) - 161) < 1,
      '100 miles should be ~161 km')
  })

  it('returns null speed when vehicle is parked', () => {
    const result = normalizeVehicleData({
      drive_state: { speed: null, shift_state: null },
    })
    assert.strictEqual(result.currentSpeedKmh, null)
    assert.strictEqual(result.vehicleParked, true)
  })
})
