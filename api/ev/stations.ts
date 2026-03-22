// ─── GET /api/ev/stations ──────────────────────────────────────────────
//
// Query params:
//   bbox=minLat,minLng,maxLat,maxLng   (optional — defaults to Bulgaria)
//
// Response: StationsApiResponse (see normalize/types.ts)
//
// ARCHITECTURE
// ─────────────────────────────────────────────────────────────────────
// 1. Parse + validate bbox. Default to all of Bulgaria.
// 2. Check merged-response cache (server-side memory, 10 min TTL).
// 3. Fetch all 3 providers IN PARALLEL via Promise.allSettled.
//    - allSettled guarantees we always get a result even if 1-2 fail.
//    - Each provider has its own timeout + internal cache.
// 4. Normalize + merge + dedup.
// 5. Cache the merged response.
// 6. Return with stale-while-revalidate CDN headers.
//
// PROVIDER FAILURE BEHAVIOR
// ─────────────────────────────────────────────────────────────────────
// If Tesla fails  → OCM + OSM still returned (most stations covered)
// If OCM fails    → Tesla + OSM still returned
// If OSM fails    → Tesla + OCM still returned
// If all fail     → empty stations array with error meta (never a 500)

import type { VercelRequest, VercelResponse } from '@vercel/node'
import { parseBBox, BULGARIA_BBOX, bboxCacheKey, quantizeBBox } from '../_lib/utils/bbox.js'
import { fetchTeslaStations } from '../_lib/providers/tesla.js'
import { fetchOCMStations } from '../_lib/providers/ocm.js'
import { fetchOverpassStations } from '../_lib/providers/overpass.js'
import { mergeStations } from '../_lib/merge/stations.js'
import { cacheGet, cacheSet } from '../_lib/cache/memory.js'
import { setCacheHeaders } from '../_lib/cache/headers.js'
import type { StationsApiResponse, ProviderMeta, ProviderResult } from '../_lib/normalize/types.js'

const MERGED_CACHE_TTL_MS = 10 * 60 * 1000  // 10 min merged response cache

const EMPTY_META: ProviderMeta = { status: 'error', count: 0, fetchMs: 0 }

function extractMeta(result: PromiseSettledResult<ProviderResult>): ProviderMeta {
  if (result.status === 'fulfilled') return result.value.meta
  return { ...EMPTY_META, error: String(result.reason).slice(0, 80) }
}

function extractResult(result: PromiseSettledResult<ProviderResult>): ProviderResult | null {
  return result.status === 'fulfilled' ? result.value : null
}

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  // CORS preflight
  if (req.method === 'OPTIONS') {
    setCacheHeaders(res, 600)
    res.status(204).end()
    return
  }

  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Method not allowed' })
    return
  }

  // ── Parse bbox ────────────────────────────────────────────────
  const bbox = parseBBox(req.query['bbox'] as string | undefined) ?? BULGARIA_BBOX
  const qbbox = quantizeBBox(bbox)
  const mergedKey = bboxCacheKey('merged', qbbox)

  // ── Check merged-response cache ───────────────────────────────
  const cachedResponse = cacheGet<StationsApiResponse>(mergedKey)
  if (cachedResponse) {
    setCacheHeaders(res, 600, 1200)
    cachedResponse.meta.cacheHit = true
    res.status(200).json(cachedResponse)
    return
  }

  // ── Fetch all providers in parallel ───────────────────────────
  const t0 = Date.now()

  const [teslaResult, ocmResult, osmResult] = await Promise.allSettled([
    fetchTeslaStations(qbbox),
    fetchOCMStations(qbbox),
    fetchOverpassStations(qbbox),
  ])

  const teslaMeta  = extractMeta(teslaResult)
  const ocmMeta    = extractMeta(ocmResult)
  const osmMeta    = extractMeta(osmResult)

  // ── Merge + dedup (priority: tesla > ocm > osm) ───────────────
  const validResults = [teslaResult, ocmResult, osmResult]
    .map(extractResult)
    .filter((r): r is ProviderResult => r !== null)

  const { stations, deduplicated } = mergeStations(validResults)

  // ── Build response ────────────────────────────────────────────
  const response: StationsApiResponse = {
    stations,
    meta: {
      providers: {
        tesla: teslaMeta,
        ocm:   ocmMeta,
        osm:   osmMeta,
      },
      total: stations.length,
      deduplicated,
      bbox: { minLat: qbbox.minLat, minLng: qbbox.minLng, maxLat: qbbox.maxLat, maxLng: qbbox.maxLng },
      cachedAt: new Date().toISOString(),
      cacheHit: false,
    },
  }

  // ── Cache merged response ─────────────────────────────────────
  // Only cache if at least one provider succeeded (don't cache all-error responses)
  if (stations.length > 0) {
    cacheSet(mergedKey, response, MERGED_CACHE_TTL_MS)
  }

  // ── Debug header ──────────────────────────────────────────────
  // Quick sanity check visible in DevTools Network tab
  res.setHeader('X-EV-Debug', JSON.stringify({
    tesla: `${teslaMeta.status}/${teslaMeta.count}`,
    ocm:   `${ocmMeta.status}/${ocmMeta.count}`,
    osm:   `${osmMeta.status}/${osmMeta.count}`,
    total: stations.length,
    dedup: deduplicated,
    ms:    Date.now() - t0,
  }))

  setCacheHeaders(res, 600, 1200)
  res.status(200).json(response)
}
