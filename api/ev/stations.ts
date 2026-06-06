// ─── GET /api/ev/stations ──────────────────────────────────────────────
//
// Serves EV stations ONLY from the Redis weekly snapshot.
// Provider APIs (Tesla/OCM/Overpass) are NEVER called here — only by cron.
//
// Cost-optimized flow:
//   1. in-memory cache hit  → serve, zero Redis, zero rate-limit Redis call
//   2. in-memory rate limit → cheap, no Redis
//   3. Redis snapshot       → 1 Redis read, cache result for 20 min
//   4. Redis empty          → return [], do NOT call providers
//
// Rate limit is checked AFTER in-memory cache so cache hits cost nothing.

import type { VercelRequest, VercelResponse } from '@vercel/node'
import { parseBBox, BULGARIA_BBOX, bboxCacheKey, quantizeBBox, inBBox } from '../_lib/utils/bbox.js'
import { stationDb } from '../_lib/db/stationDb.js'
import { userStationDb } from '../_lib/db/userStationDb.js'
import { cacheGet, cacheSet } from '../_lib/cache/memory.js'
import { setCacheHeaders } from '../_lib/cache/headers.js'
import { captureApiError } from '../_lib/utils/sentryApi.js'
import type { StationsApiResponse, ProviderMeta, NormalizedStation } from '../_lib/normalize/types.js'

const MERGED_CACHE_TTL_MS      = 20 * 60 * 1000
const USER_STATIONS_CACHE_TTL  =  2 * 60 * 1000  // 2 min — new submissions appear quickly
const USER_STATIONS_CACHE_KEY  = 'user-stations-all'
const IS_PRODUCTION = process.env['NODE_ENV'] === 'production' || process.env['VERCEL_ENV'] === 'production'
const EMPTY_META: ProviderMeta = { status: 'error', count: 0, fetchMs: 0 }

// Fetches all user stations with a short in-memory cache (2 min) so that
// even provider-snapshot cache hits include recently-submitted user stations.
// ownerToken is stripped — it must never leave the server.
async function _getUserStations(): Promise<NormalizedStation[]> {
  const hit = cacheGet<NormalizedStation[]>(USER_STATIONS_CACHE_KEY)
  if (hit) return hit
  const raw      = await userStationDb.getAll()
  const stations = raw.map(({ ownerToken: _drop, ...s }) => s)
  cacheSet(USER_STATIONS_CACHE_KEY, stations, USER_STATIONS_CACHE_TTL)
  return stations
}

// ── In-memory rate limit (no Redis cost) ─────────────────────────────
// Stations is a read-only GET — per-instance limiting is sufficient.
// No need for cross-instance Redis coordination for a read endpoint.
const _rl = new Map<string, { count: number; resetAt: number }>()
function _rateLimit(ip: string): boolean {
  const now = Date.now()
  const e = _rl.get(ip)
  if (!e || now > e.resetAt) { _rl.set(ip, { count: 1, resetAt: now + 60_000 }); return true }
  if (e.count >= 60) return false
  e.count++
  return true
}

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS')

  if (req.method === 'OPTIONS') { setCacheHeaders(res, 600); res.status(204).end(); return }
  if (req.method !== 'GET')     { res.status(405).json({ error: 'Method not allowed' }); return }

  const bbox      = parseBBox(req.query['bbox'] as string | undefined) ?? BULGARIA_BBOX
  const qbbox     = quantizeBBox(bbox)
  const mergedKey = bboxCacheKey('merged', qbbox)
  const t0        = Date.now()
  const bust      = req.query['bust'] === '1'  // manual refresh — skip in-memory cache

  // ── 1. In-memory cache — serve immediately with freshly-checked user stations
  // Provider snapshot is cached for 20 min; user stations use their own 2-min
  // cache so new submissions appear on the map within ~2 minutes without a bust.
  if (!bust) {
    const cached = cacheGet<StationsApiResponse>(mergedKey)
    if (cached) {
      const userStations   = await _getUserStations()
      const userInBBox     = userStations.filter((s) => inBBox(s.lat, s.lng, qbbox))
      const withUsers: StationsApiResponse = {
        ...cached,
        stations: [...cached.stations, ...userInBBox],
        meta: {
          ...cached.meta,
          cacheHit: true,
          total: cached.stations.length + userInBBox.length,
          providers: { ...cached.meta.providers, user: { status: 'ok', count: userInBBox.length, fetchMs: 0 } },
        },
      }
      setCacheHeaders(res, 300, 600)
      res.status(200).json(withUsers)
      return
    }
  }

  // ── 2. Rate limit AFTER cache (in-memory, no Redis) ───────────────
  const ip = (req.headers['x-forwarded-for'] as string | undefined)?.split(',')[0]?.trim() ?? 'unknown'
  if (!_rateLimit(ip)) {
    res.status(429).json({ error: 'Too many requests — please wait a moment' })
    return
  }

  // ── 3. Redis weekly snapshot ───────────────────────────────────────
  try {
    const allStations = await stationDb.getAll()

    const allUserStations = await _getUserStations()
    const userInBBox = allUserStations.filter((s) => inBBox(s.lat, s.lng, qbbox))

    if (allStations !== null && allStations.length > 0) {
      const syncMeta = await stationDb.getMeta()
      // Cap provider stations at 6000 per request — Tesla browser OOM with more markers.
      // Priority: tesla > ocm > osm (most specific sources first).
      const filtered = allStations.filter((s) => inBBox(s.lat, s.lng, qbbox))
      const providerStations = filtered.length > 6000
        ? [
            ...filtered.filter((s) => s.source === 'tesla'),
            ...filtered.filter((s) => s.source === 'ocm'),
            ...filtered.filter((s) => s.source === 'osm'),
          ].slice(0, 6000)
        : filtered
      const stations = [...providerStations, ...userInBBox]

      const response: StationsApiResponse = {
        stations,
        meta: {
          providers: {
            tesla: { ...(syncMeta?.providers.tesla ?? EMPTY_META), fetchMs: 0 },
            ocm:   { ...(syncMeta?.providers.ocm   ?? EMPTY_META), fetchMs: 0 },
            osm:   { ...(syncMeta?.providers.osm   ?? EMPTY_META), fetchMs: 0 },
            user:  { status: 'ok', count: userInBBox.length, fetchMs: 0 },
          },
          total:        stations.length,
          deduplicated: syncMeta?.deduplicated ?? 0,
          bbox:         { minLat: qbbox.minLat, minLng: qbbox.minLng, maxLat: qbbox.maxLat, maxLng: qbbox.maxLng },
          cachedAt:     syncMeta?.syncedAt ?? new Date().toISOString(),
          cacheHit:     false,
        },
      }

      // Cache only provider stations response (user stations always fetched fresh)
      const providerOnlyResponse: StationsApiResponse = {
        ...response,
        stations: providerStations,
        meta: { ...response.meta, total: providerStations.length },
      }
      cacheSet(mergedKey, providerOnlyResponse, MERGED_CACHE_TTL_MS)

      if (!IS_PRODUCTION) {
        res.setHeader('X-EV-Debug', JSON.stringify({
          source: 'redis', total: stations.length, user: userInBBox.length,
          ms: Date.now() - t0, syncedAt: syncMeta?.syncedAt,
        }))
      }

      setCacheHeaders(res, 300, 600)
      res.status(200).json(response)
      return
    }

    // Provider snapshot empty but user stations may still exist
    if (userInBBox.length > 0) {
      const response: StationsApiResponse = {
        stations: userInBBox,
        meta: {
          providers: { tesla: EMPTY_META, ocm: EMPTY_META, osm: EMPTY_META, user: { status: 'ok', count: userInBBox.length, fetchMs: 0 } },
          total: userInBBox.length, deduplicated: 0,
          bbox:     { minLat: qbbox.minLat, minLng: qbbox.minLng, maxLat: qbbox.maxLat, maxLng: qbbox.maxLng },
          cachedAt: new Date().toISOString(),
          cacheHit: false,
        },
      }
      setCacheHeaders(res, 60)
      res.status(200).json(response)
      return
    }
  } catch (err) {
    await captureApiError(err, 'ev/stations Redis read')
  }

  // ── 4. Redis empty — return [] without calling any provider ────────
  const emptyResponse: StationsApiResponse = {
    stations: [],
    meta: {
      providers: { tesla: EMPTY_META, ocm: EMPTY_META, osm: EMPTY_META },
      total: 0, deduplicated: 0,
      bbox:     { minLat: qbbox.minLat, minLng: qbbox.minLng, maxLat: qbbox.maxLat, maxLng: qbbox.maxLng },
      cachedAt: new Date().toISOString(),
      cacheHit: false,
    },
  }

  setCacheHeaders(res, 0)
  res.status(200).json(emptyResponse)
}
