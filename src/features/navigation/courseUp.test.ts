import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  normalizeBearing,
  bearingDiff,
  lerpBearing,
  courseUpMapBearing,
} from '../../lib/bearingUtils.js'

// ── normalizeBearing ────────────────────────────────────────────────────────

test('normalizeBearing: 0 stays 0', () => assert.equal(normalizeBearing(0), 0))
test('normalizeBearing: 360 wraps to 0', () => assert.equal(normalizeBearing(360), 0))
test('normalizeBearing: -90 becomes 270', () => assert.equal(normalizeBearing(-90), 270))
test('normalizeBearing: 450 becomes 90', () => assert.equal(normalizeBearing(450), 90))
test('normalizeBearing: -1 becomes 359', () => assert.equal(normalizeBearing(-1), 359))

// ── bearingDiff ─────────────────────────────────────────────────────────────

test('bearingDiff: 0→90 = +90 (turn right)', () => assert.equal(bearingDiff(0, 90), 90))
test('bearingDiff: 90→0 = -90 (turn left)', () => assert.equal(bearingDiff(90, 0), -90))
test('bearingDiff: 350→10 = +20 (short wrap)', () => assert.equal(bearingDiff(350, 10), 20))
test('bearingDiff: 10→350 = -20 (short wrap)', () => assert.equal(bearingDiff(10, 350), -20))
test('bearingDiff: 0→180 magnitude is 180', () => assert.equal(Math.abs(bearingDiff(0, 180)), 180))
test('bearingDiff: 270→90 = +180 or -180', () => assert.equal(Math.abs(bearingDiff(270, 90)), 180))

// ── lerpBearing ─────────────────────────────────────────────────────────────

test('lerpBearing: alpha=1 snaps to target', () => assert.equal(lerpBearing(0, 90, 1), 90))
test('lerpBearing: alpha=0 stays at source', () => assert.equal(lerpBearing(0, 90, 0), 0))
test('lerpBearing: alpha=1 wraps correctly (350→10)', () => assert.equal(lerpBearing(350, 10, 1), 10))
test('lerpBearing: midpoint 0→60 = 30', () => assert.equal(lerpBearing(0, 60, 0.5), 30))
test('lerpBearing: midpoint 340→20 wraps to 0', () => assert.equal(lerpBearing(340, 20, 0.5), 0))

// ── courseUpMapBearing ───────────────────────────────────────────────────────
// MapLibre: bearing = compass direction that is "up" (0=north, 90=east).
// So courseUpMapBearing(navBearing) = normalizeBearing(navBearing).

test('courseUp: heading north → map bearing 0', () => assert.equal(courseUpMapBearing(0), 0))
test('courseUp: heading east → map bearing 90', () => assert.equal(courseUpMapBearing(90), 90))
test('courseUp: heading south → map bearing 180', () => assert.equal(courseUpMapBearing(180), 180))
test('courseUp: heading west → map bearing 270', () => assert.equal(courseUpMapBearing(270), 270))
test('courseUp: normalizes negative input', () => assert.equal(courseUpMapBearing(-90), 270))
test('courseUp: normalizes >360 input', () => assert.equal(courseUpMapBearing(450), 90))
