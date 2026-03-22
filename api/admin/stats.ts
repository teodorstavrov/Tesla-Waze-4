// ─── GET /api/admin/stats ───────────────────────────────────────────────
// Returns station count, last sync metadata, and active event count.
// Protected: Authorization: Bearer ADMIN_SECRET

import type { VercelRequest, VercelResponse } from '@vercel/node'
import { isAuthorized, unauthorized } from '../_lib/admin/auth.js'
import { stationDb } from '../_lib/db/stationDb.js'
import { eventRedisStore } from '../_lib/events/redisStore.js'
import { isRedisConfigured } from '../_lib/db/redis.js'

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Authorization')

  if (req.method === 'OPTIONS') { res.status(204).end(); return }
  if (!isAuthorized(req))       { unauthorized(res); return }
  if (req.method !== 'GET')     { res.status(405).json({ error: 'Method not allowed' }); return }

  const redisOk = isRedisConfigured()

  const [meta, events] = await Promise.all([
    stationDb.getMeta(),
    redisOk ? eventRedisStore.getAll() : Promise.resolve([]),
  ])

  res.status(200).json({
    redis:         redisOk,
    stationCount:  meta?.count ?? null,
    lastSync:      meta?.syncedAt ?? null,
    providers:     meta?.providers ?? null,
    eventCount:    events.length,
  })
}
