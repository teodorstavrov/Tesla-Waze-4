// ─── Station merge + deduplication ────────────────────────────────────
//
// Three providers may return overlapping stations — especially OCM and OSM
// which both crowd-source data from the same physical locations.
//
// DEDUPLICATION STRATEGY
// ─────────────────────────────────────────────────────────────────────
// Two stations are considered the same if they are within DEDUP_METERS
// of each other. We iterate in provider priority order (tesla > ocm > osm)
// so the more authoritative record wins.
//
// This is O(n²) but fine for Bulgaria's station count (~200-800 total).
// If this ever becomes a bottleneck, replace with a grid-cell bucketing
// approach (O(n) average).

import type { NormalizedStation, ProviderResult } from '../normalize/types.ts'
import { haversineMeters } from '../utils/geo.ts'

/** Stations within this distance (meters) are considered the same location */
const DEDUP_METERS = 80

export interface MergeResult {
  stations: NormalizedStation[]
  deduplicated: number
}

/**
 * Merge stations from multiple providers with priority-ordered deduplication.
 * Results must be ordered by provider priority (first = highest priority).
 */
export function mergeStations(results: ProviderResult[]): MergeResult {
  const merged: NormalizedStation[] = []
  let deduplicated = 0

  // Process providers in priority order: tesla → ocm → osm
  // First provider's station always wins when two are within DEDUP_METERS.
  for (const result of results) {
    for (const station of result.stations) {
      const duplicate = merged.some(
        (existing) =>
          haversineMeters([existing.lat, existing.lng], [station.lat, station.lng]) < DEDUP_METERS,
      )

      if (duplicate) {
        deduplicated++
      } else {
        merged.push(station)
      }
    }
  }

  return { stations: merged, deduplicated }
}
