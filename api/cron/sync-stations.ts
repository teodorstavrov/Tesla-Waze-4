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
// 1. Fetch all 3 providers for Bulgaria + Sweden + Finland + Netherlands + Belgium + Germany + France in parallel
// 2. Merge + dedup per country, then combine (tesla > ocm > osm priority)
// 3. Compare with existing DB snapshot — skip write if nothing changed
// 4. Save to Upstash Redis (single key, filtered by viewport at read time)
// 5. Return sync stats as JSON

import type { VercelRequest, VercelResponse } from '@vercel/node'
import { BULGARIA_BBOX, SWEDEN_BBOX, FINLAND_BBOX, NETHERLANDS_BBOX, NETHERLANDS_WEST_BBOX, NETHERLANDS_EAST_BBOX, BELGIUM_BBOX, BELGIUM_WEST_BBOX, BELGIUM_EAST_BBOX, GERMANY_BBOX, GERMANY_WEST_BBOX, GERMANY_EAST_BBOX, FRANCE_BBOX, FRANCE_WEST_BBOX, FRANCE_EAST_BBOX } from '../_lib/utils/bbox.js'
import { fetchTeslaStations } from '../_lib/providers/tesla.js'
import { fetchOCMStations } from '../_lib/providers/ocm.js'
import { fetchOverpassStations } from '../_lib/providers/overpass.js'
import { fetchFinesStations } from '../_lib/providers/fines.js'
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
      lastMeta.providers.osm.status   !== 'error' &&
      (lastMeta.providers.fines?.status ?? 'ok') !== 'error'

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

  // ── Fetch all providers for all countries in parallel ─────────────
  const t0 = Date.now()

  // OCM and Fines run in parallel (non-Overpass) while Overpass runs in waves below.
  // Each Overpass provider gets a urlIndex (0=overpass-api.de, 1=kumi.systems, 2=private.coffee)
  // to spread 14 simultaneous queries across the 3 public mirrors instead of all hitting one.
  const bgOcmPromise      = fetchOCMStations(BULGARIA_BBOX)
  const bgFinesPromise    = fetchFinesStations()
  const seOcmPromise      = fetchOCMStations(SWEDEN_BBOX)
  const fiOcmPromise      = fetchOCMStations(FINLAND_BBOX)
  const nlOcmWestPromise  = fetchOCMStations(NETHERLANDS_WEST_BBOX)
  const nlOcmEastPromise  = fetchOCMStations(NETHERLANDS_EAST_BBOX)
  const beOcmWestPromise  = fetchOCMStations(BELGIUM_WEST_BBOX)
  const beOcmEastPromise  = fetchOCMStations(BELGIUM_EAST_BBOX)
  const deOcmWestPromise  = fetchOCMStations(GERMANY_WEST_BBOX)
  const deOcmEastPromise  = fetchOCMStations(GERMANY_EAST_BBOX)
  const frOcmWestPromise  = fetchOCMStations(FRANCE_WEST_BBOX)
  const frOcmEastPromise  = fetchOCMStations(FRANCE_EAST_BBOX)

  // Overpass in 4 waves — each wave sends at most 2 queries per server
  // Wave 1: BG + SE  (urlIndex: BG→0,1  SE→2,0)
  const [bgTeslaResult, bgOsmResult, seTeslaResult, seOsmResult] = await Promise.allSettled([
    fetchTeslaStations(BULGARIA_BBOX, 0),
    fetchOverpassStations(BULGARIA_BBOX, 1),
    fetchTeslaStations(SWEDEN_BBOX, 2),
    fetchOverpassStations(SWEDEN_BBOX, 0),
  ])
  // Wave 2: FI + NL  (urlIndex: FI→1,2  NL→0,1)
  const [fiTeslaResult, fiOsmResult, nlTeslaResult, nlOsmResult] = await Promise.allSettled([
    fetchTeslaStations(FINLAND_BBOX, 1),
    fetchOverpassStations(FINLAND_BBOX, 2),
    fetchTeslaStations(NETHERLANDS_BBOX, 0),
    fetchOverpassStations(NETHERLANDS_BBOX, 1),
  ])
  // Wave 3: BE + DE  (urlIndex: BE→2,0  DE→1,2)
  const [beTeslaResult, beOsmResult, deTeslaResult, deOsmResult] = await Promise.allSettled([
    fetchTeslaStations(BELGIUM_BBOX, 2),
    fetchOverpassStations(BELGIUM_BBOX, 0),
    fetchTeslaStations(GERMANY_BBOX, 1),
    fetchOverpassStations(GERMANY_BBOX, 2),
  ])
  // Wave 4: FR  (urlIndex: FR→0,1)
  const [frTeslaResult, frOsmResult] = await Promise.allSettled([
    fetchTeslaStations(FRANCE_BBOX, 0),
    fetchOverpassStations(FRANCE_BBOX, 1),
  ])

  // Collect OCM + Fines (they've been running in parallel with the Overpass waves)
  const [bgOcmResult, bgFinesResult, seOcmResult, fiOcmResult,
         nlOcmWestResult, nlOcmEastResult, beOcmWestResult, beOcmEastResult,
         deOcmWestResult, deOcmEastResult, frOcmWestResult, frOcmEastResult] =
    await Promise.allSettled([
      bgOcmPromise, bgFinesPromise, seOcmPromise, fiOcmPromise,
      nlOcmWestPromise, nlOcmEastPromise, beOcmWestPromise, beOcmEastPromise,
      deOcmWestPromise, deOcmEastPromise, frOcmWestPromise, frOcmEastPromise,
    ])

  function unwrap(r: PromiseSettledResult<ProviderResult>, label: string): ProviderResult | null {
    if (r.status === 'rejected') {
      console.error(`[SYNC] ${label} rejected:`, r.reason)
      return null
    }
    if (r.value.meta.status === 'error') {
      console.warn(`[SYNC] ${label} error: ${r.value.meta.error ?? 'unknown'}`)
    } else {
      console.log(`[SYNC] ${label} ok: ${r.value.meta.count} stations`)
    }
    return r.value
  }

  // Merge each country separately so dedup only fires within the same country
  // Fines is highest priority for BG — placed first so its stations win dedup
  const bgResults = [
    unwrap(bgFinesResult, 'BG-fines'), unwrap(bgTeslaResult, 'BG-tesla'),
    unwrap(bgOcmResult, 'BG-ocm'),    unwrap(bgOsmResult,   'BG-osm'),
  ].filter((r): r is ProviderResult => r !== null)
  const seResults = [
    unwrap(seTeslaResult, 'SE-tesla'), unwrap(seOcmResult, 'SE-ocm'), unwrap(seOsmResult, 'SE-osm'),
  ].filter((r): r is ProviderResult => r !== null)
  const fiResults = [
    unwrap(fiTeslaResult, 'FI-tesla'), unwrap(fiOcmResult, 'FI-ocm'), unwrap(fiOsmResult, 'FI-osm'),
  ].filter((r): r is ProviderResult => r !== null)
  const nlResults = [
    unwrap(nlTeslaResult, 'NL-tesla'), unwrap(nlOcmWestResult, 'NL-ocm-w'),
    unwrap(nlOcmEastResult, 'NL-ocm-e'), unwrap(nlOsmResult, 'NL-osm'),
  ].filter((r): r is ProviderResult => r !== null)
  const beResults = [
    unwrap(beTeslaResult, 'BE-tesla'), unwrap(beOcmWestResult, 'BE-ocm-w'),
    unwrap(beOcmEastResult, 'BE-ocm-e'), unwrap(beOsmResult, 'BE-osm'),
  ].filter((r): r is ProviderResult => r !== null)
  const deResults = [
    unwrap(deTeslaResult, 'DE-tesla'), unwrap(deOcmWestResult, 'DE-ocm-w'),
    unwrap(deOcmEastResult, 'DE-ocm-e'), unwrap(deOsmResult, 'DE-osm'),
  ].filter((r): r is ProviderResult => r !== null)
  const frResults = [
    unwrap(frTeslaResult, 'FR-tesla'), unwrap(frOcmWestResult, 'FR-ocm-w'),
    unwrap(frOcmEastResult, 'FR-ocm-e'), unwrap(frOsmResult, 'FR-osm'),
  ].filter((r): r is ProviderResult => r !== null)

  if (bgResults.length === 0 && seResults.length === 0 && fiResults.length === 0 && nlResults.length === 0 && beResults.length === 0 && deResults.length === 0 && frResults.length === 0) {
    res.status(502).json({ error: 'All providers failed — nothing to store' })
    return
  }

  const bgMerge = bgResults.length > 0 ? mergeStations(bgResults) : { stations: [], deduplicated: 0 }
  const seMerge = seResults.length > 0 ? mergeStations(seResults) : { stations: [], deduplicated: 0 }
  const fiMerge = fiResults.length > 0 ? mergeStations(fiResults) : { stations: [], deduplicated: 0 }
  const nlMerge = nlResults.length > 0 ? mergeStations(nlResults) : { stations: [], deduplicated: 0 }
  const beMerge = beResults.length > 0 ? mergeStations(beResults) : { stations: [], deduplicated: 0 }
  const deMerge = deResults.length > 0 ? mergeStations(deResults) : { stations: [], deduplicated: 0 }
  const frMerge = frResults.length > 0 ? mergeStations(frResults) : { stations: [], deduplicated: 0 }

  const stations     = [...bgMerge.stations, ...seMerge.stations, ...fiMerge.stations, ...nlMerge.stations, ...beMerge.stations, ...deMerge.stations, ...frMerge.stations]
  const deduplicated = bgMerge.deduplicated + seMerge.deduplicated + fiMerge.deduplicated + nlMerge.deduplicated + beMerge.deduplicated + deMerge.deduplicated + frMerge.deduplicated

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
      tesla: combinedMeta(bgTeslaResult, seTeslaResult, fiTeslaResult, nlTeslaResult, beTeslaResult, deTeslaResult, frTeslaResult),
      ocm:   combinedMeta(bgOcmResult,   seOcmResult,   fiOcmResult,   nlOcmWestResult, nlOcmEastResult, beOcmWestResult, beOcmEastResult, deOcmWestResult, deOcmEastResult, frOcmWestResult, frOcmEastResult),
      osm:   combinedMeta(bgOsmResult,   seOsmResult,   fiOsmResult,   nlOsmResult, beOsmResult, deOsmResult, frOsmResult),
      fines: combinedMeta(bgFinesResult),
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
      tesla: combinedMeta(bgTeslaResult, seTeslaResult, fiTeslaResult, nlTeslaResult, beTeslaResult, deTeslaResult, frTeslaResult).status === 'error',
      osm:   combinedMeta(bgOsmResult,   seOsmResult,   fiOsmResult,   nlOsmResult, beOsmResult, deOsmResult, frOsmResult).status === 'error',
    },
    countries: {
      BG: bgMerge.stations.length,
      SE: seMerge.stations.length,
      FI: fiMerge.stations.length,
      NL: nlMerge.stations.length,
      BE: beMerge.stations.length,
      DE: deMerge.stations.length,
      FR: frMerge.stations.length,
    },
    providers: {
      tesla: combinedMeta(bgTeslaResult, seTeslaResult, fiTeslaResult, nlTeslaResult, beTeslaResult, deTeslaResult, frTeslaResult),
      ocm:   combinedMeta(bgOcmResult,   seOcmResult,   fiOcmResult,   nlOcmWestResult, nlOcmEastResult, beOcmWestResult, beOcmEastResult, deOcmWestResult, deOcmEastResult, frOcmWestResult, frOcmEastResult),
      osm:   combinedMeta(bgOsmResult,   seOsmResult,   fiOsmResult,   nlOsmResult, beOsmResult, deOsmResult, frOsmResult),
      fines: combinedMeta(bgFinesResult),
    },
    elapsedMs: elapsed,
    syncedAt:  new Date().toISOString(),
  })
}
