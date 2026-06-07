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
// 1. Fetch all 3 providers for Bulgaria + Norway + Sweden + Finland in parallel (12 requests)
// 2. Merge + dedup per country, then combine (tesla > ocm > osm priority)
// 3. Compare with existing DB snapshot — skip write if nothing changed
// 4. Save to Upstash Redis (single key, filtered by viewport at read time)
// 5. Return sync stats as JSON

import type { VercelRequest, VercelResponse } from '@vercel/node'
import { BULGARIA_BBOX, NORWAY_BBOX, SWEDEN_BBOX, FINLAND_BBOX, NETHERLANDS_BBOX, NETHERLANDS_WEST_BBOX, NETHERLANDS_EAST_BBOX } from '../_lib/utils/bbox.js'
import { fetchTeslaStations } from '../_lib/providers/tesla.js'
import { fetchOCMStations } from '../_lib/providers/ocm.js'
import { fetchOverpassStations } from '../_lib/providers/overpass.js'
import { mergeStations } from '../_lib/merge/stations.js'
import { stationDb } from '../_lib/db/stationDb.js'
import { isRedisConfigured } from '../_lib/db/redis.js'
import { haversineMeters } from '../_lib/utils/geo.js'
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

  // ── Heal mode: skip full sync if all providers were healthy last time ─
  // Called daily Mon–Sat by Vercel Cron (?heal=1).
  // Costs 1 Redis read when healthy; falls through to full sync if any
  // provider had status='error' in the last recorded sync.
  if (req.query['heal'] === '1') {
    const lastMeta = await stationDb.getMeta()
    const allOk = lastMeta !== null &&
      lastMeta.providers.tesla.status !== 'error' &&
      lastMeta.providers.ocm.status   !== 'error' &&
      lastMeta.providers.osm.status   !== 'error'

    if (allOk) {
      res.status(200).json({
        skipped:   'all_providers_ok',
        syncedAt:  lastMeta.syncedAt,
        providers: lastMeta.providers,
      })
      return
    }
    // At least one provider failed last time — fall through to full sync
  }

  // ── Fetch all providers for all 5 countries in parallel ──────────
  const t0 = Date.now()

  const [
    bgTeslaResult, bgOcmResult, bgOsmResult,
    noTeslaResult, noOcmResult, noOsmResult,
    seTeslaResult, seOcmResult, seOsmResult,
    fiTeslaResult, fiOcmResult, fiOsmResult,
    nlTeslaResult, nlOcmWestResult, nlOcmEastResult, nlOsmResult,
  ] = await Promise.allSettled([
    fetchTeslaStations(BULGARIA_BBOX),
    fetchOCMStations(BULGARIA_BBOX),           // ~350   stations, 1 page
    fetchOverpassStations(BULGARIA_BBOX),
    fetchTeslaStations(NORWAY_BBOX),
    fetchOCMStations(NORWAY_BBOX),             // 3 000  stations (6 pages)
    fetchOverpassStations(NORWAY_BBOX),
    fetchTeslaStations(SWEDEN_BBOX),
    fetchOCMStations(SWEDEN_BBOX),             // 3 000  stations (6 pages)
    fetchOverpassStations(SWEDEN_BBOX),
    fetchTeslaStations(FINLAND_BBOX),
    fetchOCMStations(FINLAND_BBOX),            // 3 000  stations (6 pages)
    fetchOverpassStations(FINLAND_BBOX),
    fetchTeslaStations(NETHERLANDS_BBOX),
    fetchOCMStations(NETHERLANDS_WEST_BBOX),   // 3 000  west NL (Amsterdam/Rotterdam/Den Haag)
    fetchOCMStations(NETHERLANDS_EAST_BBOX),   // 3 000  east NL (Utrecht/Eindhoven/Groningen)
    fetchOverpassStations(NETHERLANDS_BBOX),
  ])

  function unwrap(r: PromiseSettledResult<ProviderResult>): ProviderResult | null {
    return r.status === 'fulfilled' ? r.value : null
  }

  // Merge each country separately so dedup only fires within the same country
  const bgResults = [bgTeslaResult, bgOcmResult, bgOsmResult].map(unwrap).filter((r): r is ProviderResult => r !== null)
  const noResults = [noTeslaResult, noOcmResult, noOsmResult].map(unwrap).filter((r): r is ProviderResult => r !== null)
  const seResults = [seTeslaResult, seOcmResult, seOsmResult].map(unwrap).filter((r): r is ProviderResult => r !== null)
  const fiResults = [fiTeslaResult, fiOcmResult, fiOsmResult].map(unwrap).filter((r): r is ProviderResult => r !== null)
  const nlResults = [nlTeslaResult, nlOcmWestResult, nlOcmEastResult, nlOsmResult].map(unwrap).filter((r): r is ProviderResult => r !== null)

  if (bgResults.length === 0 && noResults.length === 0 && seResults.length === 0 && fiResults.length === 0 && nlResults.length === 0) {
    res.status(502).json({ error: 'All providers failed — nothing to store' })
    return
  }

  const bgMerge = bgResults.length > 0 ? mergeStations(bgResults) : { stations: [], deduplicated: 0 }
  const noMerge = noResults.length > 0 ? mergeStations(noResults) : { stations: [], deduplicated: 0 }
  const seMerge = seResults.length > 0 ? mergeStations(seResults) : { stations: [], deduplicated: 0 }
  const fiMerge = fiResults.length > 0 ? mergeStations(fiResults) : { stations: [], deduplicated: 0 }
  const nlMerge = nlResults.length > 0 ? mergeStations(nlResults) : { stations: [], deduplicated: 0 }

  const stations     = [...bgMerge.stations, ...noMerge.stations, ...seMerge.stations, ...fiMerge.stations, ...nlMerge.stations]
  const deduplicated = bgMerge.deduplicated + noMerge.deduplicated + seMerge.deduplicated + fiMerge.deduplicated + nlMerge.deduplicated

  // ── Load existing snapshot ────────────────────────────────────────
  const existing = await stationDb.getAll()
  const existingCount = existing?.length ?? 0

  // ── Fallback: always preserve existing stations not covered by fresh data ──
  // Sync adds/updates stations but NEVER deletes them due to provider downtime.
  // Any existing station that has no fresh replacement within 100m is kept.
  // This ensures the map stays populated even when OCM/Tesla/OSM are unavailable.
  if (existing) {
    let fallbackAdded = 0
    for (const old of existing) {
      const alreadyCovered = stations.some(
        (s) => haversineMeters([s.lat, s.lng], [old.lat, old.lng]) < 100,
      )
      if (!alreadyCovered) { stations.push(old); fallbackAdded++ }
    }
    if (fallbackAdded > 0) console.log(`[SYNC] Fallback preserved ${fallbackAdded} stations from previous snapshot`)
  }

  // ── Safety guard: never overwrite with dramatically fewer stations ─
  // If providers return <70% of the known count, one or more providers
  // likely failed silently — keep the old snapshot rather than shrinking.
  if (existingCount > 50 && stations.length < existingCount * 0.70) {
    console.warn(
      `[SYNC] Safety guard: new count ${stations.length} is <70% of existing ${existingCount} — keeping old data`,
    )
    res.status(200).json({
      synced:         false,
      skipped:        'safety_guard',
      reason:         `new=${stations.length} < 70% of existing=${existingCount}`,
      existingCount,
      newCount:       stations.length,
      elapsedMs:      Date.now() - t0,
      syncedAt:       new Date().toISOString(),
    })
    return
  }

  // ── Compare with existing snapshot — skip if truly unchanged ────
  // Require same count AND a stable sample of IDs across the array.
  // The old first+last check was too weak — same-count syncs with shuffled
  // stations (or silent truncation to the same number) would never update.
  function _sampleIds(arr: typeof stations, n = 5): string {
    if (arr.length === 0) return ''
    const step = Math.max(1, Math.floor(arr.length / n))
    return Array.from({ length: n }, (_, i) => arr[Math.min(i * step, arr.length - 1)]?.id ?? '').join(',')
  }
  const unchanged =
    existing !== null &&
    existing.length === stations.length &&
    _sampleIds(existing) === _sampleIds(stations)

  function providerMeta(r: PromiseSettledResult<ProviderResult>) {
    if (r.status === 'fulfilled') return { status: r.value.meta.status, count: r.value.meta.count }
    return { status: 'error' as const, count: 0 }
  }

  // Sum counts across all 4 countries per provider
  function combinedMeta(...results: PromiseSettledResult<ProviderResult>[]) {
    const metas = results.map(providerMeta)
    return {
      status: metas.some((m) => m.status === 'ok') ? ('ok' as const) : ('error' as const),
      count:  metas.reduce((sum, m) => sum + m.count, 0),
    }
  }

  const syncMeta = {
    count: stations.length,
    deduplicated,
    providers: {
      tesla: combinedMeta(bgTeslaResult, noTeslaResult, seTeslaResult, fiTeslaResult, nlTeslaResult),
      ocm:   combinedMeta(bgOcmResult,   noOcmResult,   seOcmResult,   fiOcmResult,   nlOcmWestResult, nlOcmEastResult),
      osm:   combinedMeta(bgOsmResult,   noOsmResult,   seOsmResult,   fiOsmResult,   nlOsmResult),
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
    fallback: {
      tesla: combinedMeta(bgTeslaResult, noTeslaResult, seTeslaResult, fiTeslaResult, nlTeslaResult).status === 'error',
      osm:   combinedMeta(bgOsmResult,   noOsmResult,   seOsmResult,   fiOsmResult,   nlOsmResult).status === 'error',
    },
    countries: {
      BG: bgMerge.stations.length,
      NO: noMerge.stations.length,
      SE: seMerge.stations.length,
      FI: fiMerge.stations.length,
      NL: nlMerge.stations.length,
    },
    providers: {
      tesla: combinedMeta(bgTeslaResult, noTeslaResult, seTeslaResult, fiTeslaResult, nlTeslaResult),
      ocm:   combinedMeta(bgOcmResult,   noOcmResult,   seOcmResult,   fiOcmResult,   nlOcmWestResult, nlOcmEastResult),
      osm:   combinedMeta(bgOsmResult,   noOsmResult,   seOsmResult,   fiOsmResult,   nlOsmResult),
    },
    elapsedMs: elapsed,
    syncedAt:  new Date().toISOString(),
  })
}
