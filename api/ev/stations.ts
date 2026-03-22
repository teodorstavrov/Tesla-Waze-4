// ─── GET /api/ev/stations ──────────────────────────────────────────────
//
// Serves EV stations from Redis snapshot (weekly cron) or live fetch fallback.
//
// Fast path (Redis seeded): in-memory cache → Redis read → bbox filter → serve
// Fallback (Redis empty/unconfigured): parallel Overpass + OCM live fetch

import type { VercelRequest, VercelResponse } from '@vercel/node'
import { parseBBox, BULGARIA_BBOX, bboxCacheKey, quantizeBBox, inBBox } from '../_lib/utils/bbox.js'
import { fetchTeslaStations } from '../_lib/providers/tesla.js'
import { fetchOCMStations } from '../_lib/providers/ocm.js'
import { fetchOverpassStations } from '../_lib/providers/overpass.js'
import { mergeStations } from '../_lib/merge/stations.js'
import { stationDb } from '../_lib/db/stationDb.js'
import { cacheGet, cacheSet } from '../_lib/cache/memory.js'
import { setCacheHeaders } from '../_lib/cache/headers.js'
import { errorMessage } from '../_lib/utils/request.js'
import type { StationsApiResponse, ProviderMeta, ProviderResult } from '../_lib/normalize/types.js'

const MERGED_CACHE_TTL_MS = 5 * 60 * 1000

const EMPTY_META: ProviderMeta = { status: 'error', count: 0, fetchMs: 0 }

function extractMeta(r: PromiseSettledResult<ProviderResult>): ProviderMeta {
  if (r.status === 'fulfilled') return r.value.meta
  return { ...EMPTY_META, error: String(r.reason).slice(0, 80) }
}

function extractResult(r: PromiseSettledResult<ProviderResult>): ProviderResult | null {
  return r.status === 'fulfilled' ? r.value : null
}

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  if (req.method === 'OPTIONS') { setCacheHeaders(res, 600); res.status(204).end(); return }
  if (req.method !== 'GET')     { res.status(405).json({ error: 'Method not allowed' }); return }

  const bbox      = parseBBox(req.query['bbox'] as string | undefined) ?? BULGARIA_BBOX
  const qbbox     = quantizeBBox(bbox)
  const mergedKey = bboxCacheKey('merged', qbbox)
  const t0        = Date.now()

  // ── In-memory cache ───────────────────────────────────────────────
  const cached = cacheGet<StationsApiResponse>(mergedKey)
  if (cached) {
    setCacheHeaders(res, 300, 600)
    cached.meta.cacheHit = true
    res.status(200).json(cached)
    return
  }

  // ── Fast path: Redis snapshot ─────────────────────────────────────
  try {
    const allStations = await stationDb.getAll()

    if (allStations !== null && allStations.length > 0) {
      const syncMeta  = await stationDb.getMeta()
      const stations  = allStations.filter((s) => inBBox(s.lat, s.lng, qbbox))

      const response: StationsApiResponse = {
        stations,
        meta: {
          providers: {
            tesla: { ...(syncMeta?.providers.tesla ?? EMPTY_META), fetchMs: 0 },
            ocm:   { ...(syncMeta?.providers.ocm   ?? EMPTY_META), fetchMs: 0 },
            osm:   { ...(syncMeta?.providers.osm   ?? EMPTY_META), fetchMs: 0 },
          },
          total:        stations.length,
          deduplicated: syncMeta?.deduplicated ?? 0,
          bbox:         { minLat: qbbox.minLat, minLng: qbbox.minLng, maxLat: qbbox.maxLat, maxLng: qbbox.maxLng },
          cachedAt:     syncMeta?.syncedAt ?? new Date().toISOString(),
          cacheHit:     false,
        },
      }

      cacheSet(mergedKey, response, MERGED_CACHE_TTL_MS)
      res.setHeader('X-EV-Debug', JSON.stringify({ source: 'redis', total: stations.length, ms: Date.now() - t0, syncedAt: syncMeta?.syncedAt }))
      setCacheHeaders(res, 300, 600)
      res.status(200).json(response)
      return
    }
  } catch (err) {
    console.error('[ev/stations] Redis read failed:', errorMessage(err))
  }

  // ── Fallback: live fetch ───────────────────────────────────────────
  const [teslaResult, ocmResult, osmResult] = await Promise.allSettled([
    fetchTeslaStations(qbbox),
    fetchOCMStations(qbbox),
    fetchOverpassStations(qbbox),
  ])

  const teslaMeta = extractMeta(teslaResult)
  const ocmMeta   = extractMeta(ocmResult)
  const osmMeta   = extractMeta(osmResult)

  const validResults = [teslaResult, ocmResult, osmResult]
    .map(extractResult)
    .filter((r): r is ProviderResult => r !== null)

  const { stations, deduplicated } = mergeStations(validResults)

  const response: StationsApiResponse = {
    stations,
    meta: {
      providers: { tesla: teslaMeta, ocm: ocmMeta, osm: osmMeta },
      total:        stations.length,
      deduplicated,
      bbox:         { minLat: qbbox.minLat, minLng: qbbox.minLng, maxLat: qbbox.maxLat, maxLng: qbbox.maxLng },
      cachedAt:     new Date().toISOString(),
      cacheHit:     false,
    },
  }

  if (stations.length > 0) cacheSet(mergedKey, response, MERGED_CACHE_TTL_MS)

  res.setHeader('X-EV-Debug', JSON.stringify({ source: 'live', tesla: `${teslaMeta.status}/${teslaMeta.count}`, ocm: `${ocmMeta.status}/${ocmMeta.count}`, osm: `${osmMeta.status}/${osmMeta.count}`, total: stations.length, dedup: deduplicated, ms: Date.now() - t0 }))
  setCacheHeaders(res, 300, 600)
  res.status(200).json(response)
}
