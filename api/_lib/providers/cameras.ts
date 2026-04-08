// ─── Speed Camera provider (OpenStreetMap / Overpass) ─────────────────
//
// Two-tier storage: Redis (persistent, written by cron) → in-memory cache.
// The /api/cameras endpoint reads from Redis — no live Overpass calls on
// user requests (Norway's bbox is too large for a per-request query).
//
// The cron job calls fetchCamerasFromOverpass() to refresh Redis.
// Fallback to mirror endpoint on Overpass primary failure.

import { fetchWithTimeout } from '../utils/request.js'
import { cacheGet, cacheSet } from '../cache/memory.js'
import { redis, isRedisConfigured } from '../db/redis.js'
import type { BBox } from '../utils/bbox.js'
import { toOverpassBBox } from '../utils/bbox.js'

export interface SpeedCamera {
  id:       string
  lat:      number
  lng:      number
  maxspeed: number | null   // enforced speed limit (km/h) if tagged in OSM
  direction: number | null  // camera facing direction in degrees (0=N, 90=E)
}

const MEM_CACHE_TTL_MS = 24 * 60 * 60 * 1000  // 24h in-memory cache
const FETCH_TIMEOUT    = 55_000                 // 55s — cron only, large bbox
const OVERPASS_URL     = 'https://overpass-api.de/api/interpreter'
const OVERPASS_MIRROR  = 'https://overpass.kumi.systems/api/interpreter'

export function redisKeyForCountry(country: string): string {
  return `teslaradar:cameras:${country.toLowerCase()}`
}

function buildQuery(bboxStr: string): string {
  return [
    '[out:json][timeout:50];',
    '(',
    `  node["highway"="speed_camera"](${bboxStr});`,
    `  node["enforcement"="maxspeed"](${bboxStr});`,
    ');',
    'out body qt;',
  ].join('\n')
}

interface OverpassNode {
  id: number
  lat: number
  lon: number
  tags?: Record<string, string | undefined>
}

interface OverpassResponse {
  elements: OverpassNode[]
}

async function _overpassQuery(q: string, url: string): Promise<OverpassResponse> {
  const res = await fetchWithTimeout(
    url,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: `data=${encodeURIComponent(q)}`,
    },
    FETCH_TIMEOUT,
  )
  if (!res.ok) throw new Error(`Overpass HTTP ${res.status}`)
  return res.json() as Promise<OverpassResponse>
}

function _normalize(el: OverpassNode): SpeedCamera | null {
  if (!isFinite(el.lat) || !isFinite(el.lon)) return null
  const tags = el.tags ?? {}
  const rawSpeed = tags['maxspeed:enforcement'] ?? tags['maxspeed']
  const maxspeed = rawSpeed ? parseInt(rawSpeed, 10) : null
  const rawDir   = tags['direction']
  const direction = rawDir ? parseFloat(rawDir) : null
  return {
    id:        `cam:${el.id}`,
    lat:       el.lat,
    lng:       el.lon,
    maxspeed:  maxspeed != null && isFinite(maxspeed) ? maxspeed : null,
    direction: direction != null && isFinite(direction) ? direction : null,
  }
}

/**
 * Called by cron: fetches cameras from Overpass and stores in Redis.
 * Returns the fetched cameras.
 */
export async function fetchCamerasFromOverpass(bbox: BBox, country: string): Promise<SpeedCamera[]> {
  const bboxStr = toOverpassBBox(bbox)
  const q = buildQuery(bboxStr)

  let data: OverpassResponse
  try {
    data = await _overpassQuery(q, OVERPASS_URL)
  } catch {
    data = await _overpassQuery(q, OVERPASS_MIRROR)
  }

  const cameras: SpeedCamera[] = []
  for (const el of data.elements) {
    const cam = _normalize(el)
    if (cam) cameras.push(cam)
  }

  if (isRedisConfigured()) {
    await redis.set(redisKeyForCountry(country), cameras)
  }

  const memKey = redisKeyForCountry(country)
  cacheSet(memKey, cameras, MEM_CACHE_TTL_MS)

  return cameras
}

/**
 * Called by /api/cameras: reads from in-memory → Redis.
 * Never calls Overpass directly (too slow for large bboxes).
 */
export async function getCamerasFromCache(country: string): Promise<SpeedCamera[]> {
  const memKey = redisKeyForCountry(country)

  const memCached = cacheGet<SpeedCamera[]>(memKey)
  if (memCached) return memCached

  if (isRedisConfigured()) {
    const redisCached = await redis.get<SpeedCamera[]>(memKey)
    if (redisCached && redisCached.length > 0) {
      cacheSet(memKey, redisCached, MEM_CACHE_TTL_MS)
      return redisCached
    }
  }

  return []
}
