// ─── Geo utilities (server-side) ──────────────────────────────────────
// Intentionally duplicated from src/lib/geo.ts — API code cannot import
// frontend source files (different module targets, no Vite resolution).

/** Haversine distance in meters between two lat/lng pairs */
export function haversineMeters(
  [lat1, lng1]: [number, number],
  [lat2, lng2]: [number, number],
): number {
  const R = 6_371_000
  const dLat = toRad(lat2 - lat1)
  const dLng = toRad(lng2 - lng1)
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

function toRad(deg: number): number {
  return (deg * Math.PI) / 180
}
