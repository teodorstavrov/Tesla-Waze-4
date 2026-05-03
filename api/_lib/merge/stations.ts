// ─── Station merge + deduplication ────────────────────────────────────
//
// Three providers may return overlapping stations — especially OCM and OSM
// which both crowd-source data from the same physical locations.
//
// DEDUPLICATION STRATEGY
// ─────────────────────────────────────────────────────────────────────
// Two stations are considered the same if they are within DEDUP_METERS
// of each other. We iterate in provider priority order (tesla > ocm > osm)
// so the more authoritative record wins on identity.
//
// PRICE ENRICHMENT
// ─────────────────────────────────────────────────────────────────────
// When a Tesla station deduplicates against an OCM entry, Tesla wins the
// id/name/connectors — but OCM may carry real price data that Tesla lacks.
// We copy pricePerKwh / priceCurrency / pricingText / isFree from the
// lower-priority duplicate onto the winner when the winner has null values.
// Same enrichment applies OCM→OSM and Tesla→OSM duplicates.
//
// This is O(n²) but fine for ~200-800 stations per country.

import type { NormalizedStation, ProviderResult } from '../normalize/types.js'
import { haversineMeters } from '../utils/geo.js'

/** Stations within this distance (meters) are considered the same location */
const DEDUP_METERS = 100

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

  for (const result of results) {
    for (const station of result.stations) {
      const existingIdx = merged.findIndex(
        (existing) =>
          haversineMeters([existing.lat, existing.lng], [station.lat, station.lng]) < DEDUP_METERS,
      )

      if (existingIdx >= 0) {
        // Winner keeps identity — but inherit price fields from duplicate when winner has none
        const winner = merged[existingIdx]!
        let enriched = false
        let patch: Partial<NormalizedStation> = {}

        if (winner.pricePerKwh == null && station.pricePerKwh != null) {
          patch = {
            ...patch,
            pricePerKwh:  station.pricePerKwh,
            priceCurrency: station.priceCurrency,
            pricingText:  station.pricingText ?? winner.pricingText,
            isFree:       station.isFree ?? winner.isFree,
          }
          enriched = true
        }

        if (winner.pricingText == null && station.pricingText != null) {
          patch = { ...patch, pricingText: station.pricingText }
          enriched = true
        }

        if (winner.isFree == null && station.isFree != null) {
          patch = { ...patch, isFree: station.isFree }
          enriched = true
        }

        if (enriched) merged[existingIdx] = { ...winner, ...patch }

        deduplicated++
      } else {
        merged.push(station)
      }
    }
  }

  return { stations: merged, deduplicated }
}
