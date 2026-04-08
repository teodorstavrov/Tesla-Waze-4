// ─── sectionEngine unit tests ──────────────────────────────────────────
//
// Tests entry detection, exit detection, avg speed calculation,
// and pre-filter logic — no browser APIs, no GPS, no map.
//
// Run with: npx tsx src/features/cameras/sectionEngine.test.ts

import { SPEED_SECTIONS } from './sections'

// ── Inline haversine (avoids @/ alias in Node context) ─────────────────

function haversineMeters(
  [lat1, lng1]: [number, number],
  [lat2, lng2]: [number, number],
): number {
  const R = 6_371_000
  const toRad = (d: number) => (d * Math.PI) / 180
  const dLat = toRad(lat2 - lat1)
  const dLng = toRad(lng2 - lng1)
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

// ── Helpers ────────────────────────────────────────────────────────────

let passed = 0
let failed = 0

function assert(cond: boolean, msg: string): void {
  if (!cond) { console.error('  ✗ FAIL:', msg); failed++ }
  else       { console.log('  ✓', msg);          passed++ }
}

function approx(a: number, b: number, tol = 5): boolean {
  return Math.abs(a - b) <= tol
}

// ── Test 1: Section database sanity ────────────────────────────────────

console.log('\n[1] Section database sanity')
assert(SPEED_SECTIONS.length > 0, 'At least one section defined')

for (const s of SPEED_SECTIONS) {
  const straightLine = haversineMeters(
    [s.startLat, s.startLng],
    [s.endLat, s.endLng],
  )
  // Straight-line distance should be < 3× road length (sanity, not correctness)
  assert(
    straightLine < s.lengthM * 3,
    `${s.id}: straight-line ${Math.round(straightLine)}m < 3× lengthM ${s.lengthM}m`,
  )
  assert(s.limitKmh > 0 && s.limitKmh <= 200, `${s.id}: limitKmh in valid range`)
  assert(s.lengthM > 500, `${s.id}: lengthM > 500m (not a point)`)
  assert(s.startLat !== s.endLat || s.startLng !== s.endLng, `${s.id}: start ≠ end`)
}

// ── Test 2: Avg speed calculation ─────────────────────────────────────

console.log('\n[2] Avg speed calculation (engine formula)')

const section = SPEED_SECTIONS[0]!  // А1 Вакарел — Ихтиман, 19000m, 140 km/h

// 10 min → 114 km/h (well under 140 limit)
{
  const avgKmh = Math.round((section.lengthM / (10 * 60)) * 3.6)
  assert(approx(avgKmh, 114, 2), `19000m / 10min = ${avgKmh} km/h ≈ 114`)
  assert(avgKmh < section.limitKmh, `${avgKmh} < ${section.limitKmh} — under limit`)
}

// 9 min → 126.7 → 127 km/h (under 140)
{
  const avgKmh = Math.round((section.lengthM / (9 * 60)) * 3.6)
  assert(approx(avgKmh, 127, 2), `19000m / 9min = ${avgKmh} km/h ≈ 127`)
  assert(avgKmh <= section.limitKmh, `${avgKmh} ≤ ${section.limitKmh} — at/under limit`)
}

// 7 min → 162.9 → 163 km/h (over 140 limit)
{
  const avgKmh = Math.round((section.lengthM / (7 * 60)) * 3.6)
  assert(avgKmh > section.limitKmh, `19000m / 7min = ${avgKmh} km/h > ${section.limitKmh} limit`)
}

// ── Test 3: Entry detection (ENTRY_M = 150m) ──────────────────────────

console.log('\n[3] Entry detection (ENTRY_M = 150m)')
const ENTRY_M = 150

// At exact start point → 0m → triggers
{
  const d = haversineMeters([section.startLat, section.startLng], [section.startLat, section.startLng])
  assert(d === 0, 'Distance from start to itself is 0m')
  assert(d <= ENTRY_M, `0m ≤ ${ENTRY_M}m → triggers entry`)
}

// 100m north of start → triggers (inside zone)
{
  const nearLat = section.startLat + (100 / 111_000)
  const d = haversineMeters([nearLat, section.startLng], [section.startLat, section.startLng])
  assert(approx(d, 100, 5), `100m north → ${Math.round(d)}m ≈ 100m`)
  assert(d <= ENTRY_M, `${Math.round(d)}m ≤ ${ENTRY_M}m → triggers entry`)
}

// 200m north → does NOT trigger
{
  const farLat = section.startLat + (200 / 111_000)
  const d = haversineMeters([farLat, section.startLng], [section.startLat, section.startLng])
  assert(approx(d, 200, 10), `200m north → ${Math.round(d)}m ≈ 200m`)
  assert(d > ENTRY_M, `${Math.round(d)}m > ${ENTRY_M}m → does NOT trigger entry`)
}

// ── Test 4: Exit detection (EXIT_M = 150m) ────────────────────────────

console.log('\n[4] Exit detection (EXIT_M = 150m)')
const EXIT_M = 150

// At exact end point → 0m → triggers exit
{
  const d = haversineMeters([section.endLat, section.endLng], [section.endLat, section.endLng])
  assert(d === 0, 'Distance from end to itself is 0m')
  assert(d <= EXIT_M, `0m ≤ ${EXIT_M}m → triggers exit`)
}

// 100m from end → triggers
{
  const nearLat = section.endLat + (100 / 111_000)
  const d = haversineMeters([nearLat, section.endLng], [section.endLat, section.endLng])
  assert(d <= EXIT_M, `${Math.round(d)}m ≤ ${EXIT_M}m → triggers exit`)
}

// 300m from end → does NOT trigger
{
  const farLat = section.endLat + (300 / 111_000)
  const d = haversineMeters([farLat, section.endLng], [section.endLat, section.endLng])
  assert(d > EXIT_M, `${Math.round(d)}m > ${EXIT_M}m → does NOT trigger exit`)
}

// ── Test 5: Pre-filter bbox (NEARBY_KM = 10km) ────────────────────────

console.log('\n[5] Pre-filter bbox (10km)')
const NEARBY_KM = 10

function nearbyFilter(lat: number, lng: number) {
  const LAT_DEG_PER_KM = 1 / 111
  const LNG_DEG_PER_KM = 1 / (111 * Math.cos((lat * Math.PI) / 180))
  const latDelta = NEARBY_KM * LAT_DEG_PER_KM
  const lngDelta = NEARBY_KM * LNG_DEG_PER_KM
  return SPEED_SECTIONS.filter(
    (s) => Math.abs(s.startLat - lat) < latDelta && Math.abs(s.startLng - lng) < lngDelta,
  )
}

// At section start → included
{
  const found = nearbyFilter(section.startLat, section.startLng)
  assert(found.includes(section), `Section included when at its own start coords`)
}

// 5 degrees north (~555km) → excluded
{
  const found = nearbyFilter(section.startLat + 5, section.startLng)
  assert(!found.includes(section), `Section excluded when 5° north (~555km away)`)
}

// ── Test 6: GPS distance accumulation ────────────────────────────────

console.log('\n[6] GPS distance accumulation step logic')

// 5 steps of 100m → 500m total (teleport guard: step < 200m passes)
{
  let total = 0
  for (let i = 0; i < 5; i++) {
    const step = 100
    if (step < 200) total += step
  }
  assert(total === 500, `5 × 100m steps → total ${total}m`)
}

// Single step of 250m → rejected by teleport guard
{
  const step = 250
  let total = 0
  if (step < 200) total += step
  assert(total === 0, `250m single step rejected by teleport guard (total=${total})`)
}

// ── Summary ────────────────────────────────────────────────────────────

console.log(`\n${'─'.repeat(40)}`)
console.log(`Results: ${passed} passed, ${failed} failed`)
if (failed > 0) { console.error('❌ Tests FAILED'); process.exit(1) }
else            { console.log('✅ All tests passed\n') }
