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
// 1. Fetch all 3 providers for the full Bulgaria bbox in parallel
// 2. Merge + dedup (tesla > ocm > osm priority)
// 3. Compare with existing DB snapshot — skip write if nothing changed
// 4. Save to Upstash Redis
// 5. Return sync stats as JSON

import type { VercelRequest, VercelResponse } from '@vercel/node'
import { BULGARIA_BBOX } from '../_lib/utils/bbox.js'
import { fetchTeslaStations } from '../_lib/providers/tesla.js'
import { fetchOCMStations } from '../_lib/providers/ocm.js'
import { fetchOverpassStations } from '../_lib/providers/overpass.js'
import { mergeStations } from '../_lib/merge/stations.js'
import { stationDb } from '../_lib/db/stationDb.js'
import { isRedisConfigured } from '../_lib/db/redis.js'
import type { ProviderResult } from '../_lib/normalize/types.js'

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  // ── Auth ──────────────────────────────────────────────────────────
  const secret = process.env['CRON_SECRET'] ?? ''

  const headerAuth = (req.headers['authorization'] ?? '').replace(/^Bearer\s+/i, '')
  const querySecret = String(req.query['secret'] ?? '')

  if (secret && headerAuth !== secret && querySecret !== secret) {
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

  // ── Fetch all providers for full Bulgaria ─────────────────────────
  const t0 = Date.now()

  const [teslaResult, ocmResult, osmResult] = await Promise.allSettled([
    fetchTeslaStations(BULGARIA_BBOX),
    fetchOCMStations(BULGARIA_BBOX),
    fetchOverpassStations(BULGARIA_BBOX),
  ])

  function unwrap(r: PromiseSettledResult<ProviderResult>): ProviderResult | null {
    return r.status === 'fulfilled' ? r.value : null
  }

  const validResults = [teslaResult, ocmResult, osmResult]
    .map(unwrap)
    .filter((r): r is ProviderResult => r !== null)

  if (validResults.length === 0) {
    res.status(502).json({ error: 'All providers failed — nothing to store' })
    return
  }

  const { stations, deduplicated } = mergeStations(validResults)

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

  const syncMeta = {
    count: stations.length,
    deduplicated,
    providers: {
      tesla: providerMeta(teslaResult),
      ocm:   providerMeta(ocmResult),
      osm:   providerMeta(osmResult),
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
    providers: {
      tesla: providerMeta(teslaResult),
      ocm:   providerMeta(ocmResult),
      osm:   providerMeta(osmResult),
    },
    elapsedMs: elapsed,
    syncedAt:  new Date().toISOString(),
  })
}
