// ─── EV stations along the active route ────────────────────────────────
// Finds stations within ROUTE_RADIUS_M of the polyline, sorted by their
// position along the route (closest to driver first → furthest last).

import { haversineMeters } from '@/lib/geo'
import type { NormalizedStation } from '@/features/ev/types'

const ROUTE_RADIUS_M = 1500  // 1.5 km corridor on each side of the route
const MAX_RESULTS    = 8

export interface StationOnRoute {
  station:        NormalizedStation
  distFromRouteM: number   // perpendicular distance from polyline
  polylineIdx:    number   // closest polyline point index — used for route-order sort
}

/**
 * Returns stations within ROUTE_RADIUS_M of the polyline, sorted so that
 * stations closer to the *start* of the remaining route come first.
 *
 * @param polyline   [lat, lng] points of the active route
 * @param stations   full station list from evStore
 * @param fromIdx    start scanning from this polyline index (skip passed section)
 */
export function findStationsAlongRoute(
  polyline:  [number, number][],
  stations:  NormalizedStation[],
  fromIdx = 0,
): StationOnRoute[] {
  if (polyline.length === 0 || stations.length === 0) return []

  const results: StationOnRoute[] = []

  for (const station of stations) {
    let minDist = Infinity
    let minIdx  = fromIdx

    // Walk every polyline point starting from current position
    for (let i = fromIdx; i < polyline.length; i++) {
      const d = haversineMeters([station.lat, station.lng], polyline[i]!)
      if (d < minDist) { minDist = d; minIdx = i }
      // Early exit: if we're moving away, no closer point ahead
      if (d > minDist + 500 && minDist < ROUTE_RADIUS_M) break
    }

    if (minDist <= ROUTE_RADIUS_M) {
      results.push({ station, distFromRouteM: Math.round(minDist), polylineIdx: minIdx })
    }
  }

  return results
    .sort((a, b) => a.polylineIdx - b.polylineIdx)
    .slice(0, MAX_RESULTS)
}

// ── Color helper (mirrors EvMarkerLayer logic) ────────────────────

export function stationDotColor(s: NormalizedStation): string {
  if (s.source === 'tesla')                   return '#e31937'
  if (s.maxPowerKw !== null && s.maxPowerKw >= 150) return '#F59E0B'
  if (s.maxPowerKw !== null && s.maxPowerKw >= 50)  return '#22c55e'
  return '#2B7FFF'
}
