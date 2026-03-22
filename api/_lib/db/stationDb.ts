// ─── Station database layer ────────────────────────────────────────────
//
// Wraps Redis with a typed interface for the station store.
//
// Key schema:
//   stations:v1          — full merged + deduped station list for Bulgaria
//   stations:v1:meta     — sync metadata (last sync time, counts, etc.)
//
// The station list is fetched from Overpass/OCM once per week by the
// cron job and written here. The /api/ev/stations endpoint reads from
// here instead of hitting external APIs on every request.

import { redis } from './redis.js'
import type { NormalizedStation } from '../normalize/types.js'
import type { ProviderMeta } from '../normalize/types.js'

const STATIONS_KEY = 'stations:v1'
const META_KEY     = 'stations:v1:meta'

export interface StationSyncMeta {
  syncedAt:    string   // ISO 8601
  count:       number   // total after dedup
  deduplicated: number
  providers: {
    tesla: Pick<ProviderMeta, 'status' | 'count'>
    ocm:   Pick<ProviderMeta, 'status' | 'count'>
    osm:   Pick<ProviderMeta, 'status' | 'count'>
  }
}

export const stationDb = {
  /** Returns all stored stations, or null if not yet seeded. */
  async getAll(): Promise<NormalizedStation[] | null> {
    if (!redis.isConfigured()) return null
    return redis.get<NormalizedStation[]>(STATIONS_KEY)
  },

  /** Returns sync metadata, or null if not yet synced. */
  async getMeta(): Promise<StationSyncMeta | null> {
    if (!redis.isConfigured()) return null
    return redis.get<StationSyncMeta>(META_KEY)
  },

  /** Persists the full station list + metadata. No TTL — cron owns updates. */
  async save(stations: NormalizedStation[], meta: Omit<StationSyncMeta, 'syncedAt'>): Promise<void> {
    if (!redis.isConfigured()) return
    const record: StationSyncMeta = { ...meta, syncedAt: new Date().toISOString() }
    // Write data + meta in parallel
    await Promise.all([
      redis.set(STATIONS_KEY, stations),
      redis.set(META_KEY, record),
    ])
  },
}
