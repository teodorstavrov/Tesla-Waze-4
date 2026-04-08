// ─── Station database layer ────────────────────────────────────────────
//
// Wraps Redis with a typed interface for the station store.
//
// Key schema:
//   stations:v1          — full merged + deduped station list (all countries)
//   stations:v1:meta     — sync metadata (last sync time, counts, etc.)
//
// The station list is fetched from Overpass/OCM once per week by the
// cron job and written here. The /api/ev/stations endpoint reads from
// here instead of hitting external APIs on every request.

import { redis } from './redis.js'
import type { NormalizedStation } from '../normalize/types.js'
import type { ProviderMeta } from '../normalize/types.js'

const STATIONS_KEY    = 'teslaradar:stations:v1'
const META_KEY        = 'teslaradar:stations:v1:meta'
const STATIONS_KEY_V0 = 'stations:v1'       // legacy key — migrate on first read
const META_KEY_V0     = 'stations:v1:meta'

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

/** Validates that data looks like a NormalizedStation array (not another project's data) */
function _isValidStations(data: unknown): data is NormalizedStation[] {
  if (!Array.isArray(data) || data.length === 0) return false
  const first = data[0] as Record<string, unknown>
  return (
    typeof first.id  === 'string' &&
    typeof first.lat === 'number' &&
    typeof first.lng === 'number' &&
    isFinite(first.lat as number) &&
    isFinite(first.lng as number)
  )
}

export const stationDb = {
  /** Returns all stored stations, or null if not yet seeded. */
  async getAll(): Promise<NormalizedStation[] | null> {
    if (!redis.isConfigured()) return null
    const data = await redis.get<NormalizedStation[]>(STATIONS_KEY)
    if (data !== null && _isValidStations(data)) return data
    // Migrate: try legacy key (written before namespace change)
    const legacy = await redis.get<unknown>(STATIONS_KEY_V0)
    if (_isValidStations(legacy)) {
      // Promote to new key so future reads skip this step
      void redis.set(STATIONS_KEY, legacy)
      return legacy
    }
    return null
  },

  /** Returns sync metadata, or null if not yet synced. */
  async getMeta(): Promise<StationSyncMeta | null> {
    if (!redis.isConfigured()) return null
    const meta = await redis.get<StationSyncMeta>(META_KEY)
    if (meta !== null) return meta
    return redis.get<StationSyncMeta>(META_KEY_V0)
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
