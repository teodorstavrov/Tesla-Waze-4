// ─── GET /api/cron/sync-cameras?country=BG|NO ─────────────────────────
//
// Fetches speed cameras from Overpass for ONE country and stores in Redis.
// Called separately per country so each stays under the 60s function limit.
//
// Manual trigger:
//   GET /api/cron/sync-cameras?secret=CRON_SECRET&country=BG
//   GET /api/cron/sync-cameras?secret=CRON_SECRET&country=NO

import type { VercelRequest, VercelResponse } from '@vercel/node'
import { BULGARIA_BBOX, NORWAY_BBOX } from '../_lib/utils/bbox.js'
import { fetchCamerasFromOverpass } from '../_lib/providers/cameras.js'
import { isRedisConfigured } from '../_lib/db/redis.js'

const BBOXES = { BG: BULGARIA_BBOX, NO: NORWAY_BBOX } as const

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  const secret = process.env['CRON_SECRET']
  if (!secret) { res.status(503).json({ error: 'CRON_SECRET not configured' }); return }

  const headerAuth  = (req.headers['authorization'] ?? '').replace(/^Bearer\s+/i, '')
  const querySecret = String(req.query['secret'] ?? '')
  if (headerAuth !== secret && querySecret !== secret) {
    res.status(401).json({ error: 'Unauthorized' }); return
  }

  if (!isRedisConfigured()) { res.status(503).json({ error: 'Redis not configured' }); return }

  const country = String(req.query['country'] ?? 'BG').toUpperCase() as keyof typeof BBOXES
  if (!(country in BBOXES)) {
    res.status(400).json({ error: `Unknown country. Use BG or NO.` }); return
  }

  const t0 = Date.now()
  try {
    const cams = await fetchCamerasFromOverpass(BBOXES[country], country)
    res.status(200).json({ country, cameras: cams.length, elapsedMs: Date.now() - t0, syncedAt: new Date().toISOString() })
  } catch (err) {
    res.status(500).json({ country, error: String(err), elapsedMs: Date.now() - t0 })
  }
}
