// Pure bearing math — no DOM, no MapLibre, safe in Node.js tests.

// Normalize bearing to [0, 360).
export function normalizeBearing(b: number): number {
  return ((b % 360) + 360) % 360
}

// Shortest angular difference from → to, result in [-180, 180].
export function bearingDiff(from: number, to: number): number {
  return ((to - from) + 540) % 360 - 180
}

// Circular EMA: blend `from` toward `to` by `alpha`.
// alpha=0 → no change; alpha=1 → instant snap.
export function lerpBearing(from: number, to: number, alpha: number): number {
  return normalizeBearing(from + bearingDiff(from, to) * alpha)
}

// MapLibre bearing for course-up mode.
// MapLibre: bearing = compass direction that is "up" (0=north, 90=east).
// To put vehicle heading (navBearing) at screen-top: set map bearing = navBearing.
export function courseUpMapBearing(navBearing: number): number {
  return normalizeBearing(navBearing)
}
