// ─── Server-side Tesla Vehicle State Cache ────────────────────────────────
//
// Normalized vehicle state cached in Redis per session.
// This is the primary cost-saving mechanism: the backend serves cached data
// to the frontend without hitting Tesla's API on every request.
//
// FRESHNESS TIERS:
//   live   — updated < 5 min ago   → serve as-is, no Tesla call needed
//   recent — updated 5–15 min ago  → acceptable; serve unless user forced refresh
//   stale  — updated > 15 min ago  → try Tesla API if car likely awake
//
// CACHE TTL: 30 min — keeps stale data available as a fallback even after
// the car sleeps, so we never show "no data" when cached data exists.
//
// SLEEPING BEHAVIOR:
//   When vehicle_data returns 408, we mark the cache as sleeping.
//   Subsequent requests return the cached % with sleeping=true.
//   We NEVER auto-wake the car — only user-explicit taps do that.

import { redis } from '../db/redis.js'
import type { TeslaVehicleDataPayload } from './normalize.js'
import { normalizeVehicleData } from './normalize.js'

const CACHE_TTL_S    = 30 * 60              // keep stale data for 30 min
const LIVE_MS        =  5 * 60 * 1000       // < 5 min = live
const RECENT_MS      = 15 * 60 * 1000       // < 15 min = recent; > 15 = stale

function _key(sessionId: string): string {
  return `tesla:vehicle_cache:${sessionId}`
}

// ── Types ─────────────────────────────────────────────────────────────────

export type Freshness = 'live' | 'recent' | 'stale'
export type VehicleSource = 'vehicle_data' | 'telemetry'

export interface NormalizedVehicleState {
  source:         VehicleSource
  batteryPercent: number
  chargingState:  string | null
  speedKph:       number | null
  latitude:       number | null
  longitude:      number | null
  updatedAt:      number         // Unix ms
  freshness:      Freshness      // derived at read time — not stored
  sleeping:       boolean
}

// Stored shape (freshness is derived at read time)
type StoredState = Omit<NormalizedVehicleState, 'freshness'>

// ── Freshness ──────────────────────────────────────────────────────────────

export function computeFreshness(updatedAt: number): Freshness {
  const age = Date.now() - updatedAt
  if (age < LIVE_MS)   return 'live'
  if (age < RECENT_MS) return 'recent'
  return 'stale'
}

// ── CRUD ──────────────────────────────────────────────────────────────────

/** Read cached state. Freshness is computed at read time from updatedAt. */
export async function getCachedState(
  sessionId: string,
): Promise<NormalizedVehicleState | null> {
  const raw = await redis.get<StoredState>(_key(sessionId))
  if (!raw) return null
  return { ...raw, freshness: computeFreshness(raw.updatedAt) }
}

/** Persist a fresh vehicle_data response. */
export async function setCachedState(
  sessionId: string,
  raw:       TeslaVehicleDataPayload,
): Promise<NormalizedVehicleState> {
  const v = normalizeVehicleData(raw)
  const stored: StoredState = {
    source:         'vehicle_data',
    batteryPercent: v.currentBatteryPercent,
    chargingState:  v.chargingState,
    speedKph:       v.currentSpeedKmh,
    latitude:       v.lat,
    longitude:      v.lng,
    updatedAt:      Date.now(),
    sleeping:       false,
  }
  await redis.setWithExpiry(_key(sessionId), stored, CACHE_TTL_S)
  return { ...stored, freshness: 'live' }
}

/**
 * Mark vehicle as sleeping in the cache.
 * Preserves last-known values — only flips the sleeping flag and resets TTL.
 * If no cache exists yet, creates a minimal sleeping entry only if we have data.
 */
export async function markSleeping(
  sessionId: string,
): Promise<NormalizedVehicleState | null> {
  const existing = await redis.get<StoredState>(_key(sessionId))
  if (!existing) return null   // no prior data — nothing to preserve

  const updated: StoredState = { ...existing, sleeping: true }
  await redis.setWithExpiry(_key(sessionId), updated, CACHE_TTL_S)
  return { ...updated, freshness: computeFreshness(updated.updatedAt) }
}

/** Clear cache on disconnect. */
export async function clearCachedState(sessionId: string): Promise<void> {
  await redis.del(_key(sessionId))
}
