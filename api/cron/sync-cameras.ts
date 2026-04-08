// ─── GET /api/cron/sync-cameras ───────────────────────────────────────
//
// Fetches speed cameras from Overpass for BG + NO and stores in Redis.
// Runs sequentially (Overpass rate limits) — separate from sync-stations
// because Norway's large bbox needs up to ~55s per country.
//
// maxDuration: 300s (5 min) — set in vercel.json
// Manual trigger: GET /api/cron/sync-cameras?secret=CRON_SECRET

import type { VercelRequest, VercelResponse } from '@vercel/node'
import { BULGARIA_BBOX, NORWAY_BBOX } from '../_lib/utils/bbox.js'
import { fetchCamerasFromOverpass } from '../_lib/providers/cameras.js'
import { isRedisConfigured } from '../_lib/db/redis.js'

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  const secret = process.env['CRON_SECRET']
  if (!secret) {
    res.status(503).json({ error: 'CRON_SECRET not configured' }); return
  }

  const headerAuth = (req.headers['authorization'] ?? '').replace(/^Bearer\s+/i, '')
  const querySecret = String(req.query['secret'] ?? '')
  if (headerAuth !== secret && querySecret !== secret) {
    res.status(401).json({ error: 'Unauthorized' }); return
  }

  if (!isRedisConfigured()) {
    res.status(503).json({ error: 'Redis not configured' }); return
  }

  const t0 = Date.now()
  const results: Record<string, number | string> = {}

  for (const [country, bbox] of [['BG', BULGARIA_BBOX], ['NO', NORWAY_BBOX]] as const) {
    try {
      const cams = await fetchCamerasFromOverpass(bbox, country)
      results[country] = cams.length
    } catch (err) {
      results[country] = `error: ${String(err)}`
      console.error(`[sync-cameras] ${country} failed:`, err)
    }
  }

  res.status(200).json({
    cameras:   results,
    elapsedMs: Date.now() - t0,
    syncedAt:  new Date().toISOString(),
  })
}
