// ─── GET /api/cron/sync-stations ──────────────────────────────────────
//
// Scheduled weekly by Vercel Cron (see vercel.json).
// Can also be triggered manually: GET /api/cron/sync-stations?secret=CRON_SECRET
//
// SECURITY
// ──────────────────────────────────────────────────────────────────────
// Vercel Cron automatically adds:
//   Authorization: Bearer {CRON_SECRET}
// We verify this header. Manual triggers pass ?secret= instead.
//
// WHAT IT DOES
// ──────────────────────────────────────────────────────────────────────
// 1. Fetch all 3 providers for Bulgaria + Norway in parallel (6 requests)
// 2. Merge + dedup per country, then combine (tesla > ocm > osm priority)
// 3. Compare with existing DB snapshot — skip write if nothing changed
// 4. Save to Upstash Redis (single key, filtered by viewport at read time)
// 5. Return sync stats as JSON

import type { VercelRequest, VercelResponse } from '@vercel/node'
import { BULGARIA_BBOX, NORWAY_BBOX } from '../_lib/utils/bbox.js'
import { fetchTeslaStations } from '../_lib/providers/tesla.js'
import { fetchOCMStations } from '../_lib/providers/ocm.js'
import { fetchOverpassStations } from '../_lib/providers/overpass.js'
import { mergeStations } from '../_lib/merge/stations.js'
import { stationDb } from '../_lib/db/stationDb.js'
import { isRedisConfigured } from '../_lib/db/redis.js'
import type { ProviderResult } from '../_lib/normalize/types.js'

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  // ── Auth ──────────────────────────────────────────────────────────
  // IMPORTANT: require CRON_SECRET to be explicitly configured.
  // An empty/missing secret would previously allow unauthenticated
  // access via short-circuit evaluation of the `if` condition.
  const secret = process.env['CRON_SECRET']
  if (!secret) {
    res.status(503).json({
      error: 'CRON_SECRET not configured',
      hint: 'Set CRON_SECRET in Vercel environment variables',
    })
    return
  }

  const headerAuth = (req.headers['authorization'] ?? '').replace(/^Bearer\s+/i, '')
  const querySecret = String(req.query['secret'] ?? '')

  if (headerAuth !== secret && querySecret !== secret) {
    res.status(401).json({ error: 'Unauthorized' })
    return
  }

  if (!isRedisConfigured()) {
    res.status(503).json({
      error: 'Redis not configured',
      hint: 'Set UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN in Vercel env vars',
    })
    return
  }

  // ── Fetch all providers for Bulgaria + Norway in parallel ─────────
  const t0 = Date.now()

  const [
    bgTeslaResult, bgOcmResult, bgOsmResult,
    noTeslaResult, noOcmResult, noOsmResult,
  ] = await Promise.allSettled([
    fetchTeslaStations(BULGARIA_BBOX),
    fetchOCMStations(BULGARIA_BBOX),
    fetchOverpassStations(BULGARIA_BBOX),
    fetchTeslaStations(NORWAY_BBOX),
    fetchOCMStations(NORWAY_BBOX),
    fetchOverpassStations(NORWAY_BBOX),
  ])

  function unwrap(r: PromiseSettledResult<ProviderResult>): ProviderResult | null {
    return r.status === 'fulfilled' ? r.value : null
  }

  // Merge each country separately so dedup only fires within the same country
  const bgResults = [bgTeslaResult, bgOcmResult, bgOsmResult].map(unwrap).filter((r): r is ProviderResult => r !== null)
  const noResults = [noTeslaResult, noOcmResult, noOsmResult].map(unwrap).filter((r): r is ProviderResult => r !== null)

  if (bgResults.length === 0 && noResults.length === 0) {
    res.status(502).json({ error: 'All providers failed — nothing to store' })
    return
  }

  const bgMerge = bgResults.length > 0 ? mergeStations(bgResults) : { stations: [], deduplicated: 0 }
  const noMerge = noResults.length > 0 ? mergeStations(noResults) : { stations: [], deduplicated: 0 }

  const stations     = [...bgMerge.stations, ...noMerge.stations]
  const deduplicated = bgMerge.deduplicated + noMerge.deduplicated

  // ── Compare with existing snapshot — skip if unchanged ───────────
  const existing = await stationDb.getAll()
  const unchanged =
    existing !== null &&
    existing.length === stations.length &&
    // Quick hash: compare first+last id as a cheap change signal
    existing[0]?.id === stations[0]?.id &&
    existing[existing.length - 1]?.id === stations[stations.length - 1]?.id

  function providerMeta(r: PromiseSettledResult<ProviderResult>) {
    if (r.status === 'fulfilled') return { status: r.value.meta.status, count: r.value.meta.count }
    return { status: 'error' as const, count: 0 }
  }

  // Sum counts across both countries per provider
  function combinedMeta(
    a: PromiseSettledResult<ProviderResult>,
    b: PromiseSettledResult<ProviderResult>,
  ) {
    const ma = providerMeta(a)
    const mb = providerMeta(b)
    return {
      status: ma.status === 'ok' || mb.status === 'ok' ? ('ok' as const) : ('error' as const),
      count:  ma.count + mb.count,
    }
  }

  const syncMeta = {
    count: stations.length,
    deduplicated,
    providers: {
      tesla: combinedMeta(bgTeslaResult, noTeslaResult),
      ocm:   combinedMeta(bgOcmResult,   noOcmResult),
      osm:   combinedMeta(bgOsmResult,   noOsmResult),
    },
  }

  if (!unchanged) {
    await stationDb.save(stations, syncMeta)
  }

  const elapsed = Date.now() - t0

  res.status(200).json({
    synced:      !unchanged,
    unchanged,
    stations:    stations.length,
    deduplicated,
    countries: {
      BG: bgMerge.stations.length,
      NO: noMerge.stations.length,
    },
    providers: {
      tesla: combinedMeta(bgTeslaResult, noTeslaResult),
      ocm:   combinedMeta(bgOcmResult,   noOcmResult),
      osm:   combinedMeta(bgOsmResult,   noOsmResult),
    },
    elapsedMs: elapsed,
    syncedAt:  new Date().toISOString(),
  })
}
