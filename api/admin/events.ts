// ─── GET  /api/admin/events       — list all active events ────────────
// ─── DELETE /api/admin/events?id= — remove event by id ────────────────
// Protected: Authorization: Bearer ADMIN_SECRET

import type { VercelRequest, VercelResponse } from '@vercel/node'
import { isAuthorized, unauthorized } from '../_lib/admin/auth.js'
import { eventRedisStore } from '../_lib/events/redisStore.js'
import { eventMemStore } from '../_lib/events/store.js'
import { isRedisConfigured } from '../_lib/db/redis.js'

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET,DELETE,OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Authorization')

  if (req.method === 'OPTIONS') { res.status(204).end(); return }
  if (!isAuthorized(req))       { unauthorized(res); return }

  const useRedis = isRedisConfigured()

  if (req.method === 'GET') {
    const events = useRedis
      ? await eventRedisStore.getAll()
      : eventMemStore.getInBBox({ minLat: -90, minLng: -180, maxLat: 90, maxLng: 180 })
    res.status(200).json({ events })
    return
  }

  if (req.method === 'DELETE') {
    const id = String(req.query['id'] ?? '')
    if (!id) { res.status(400).json({ error: 'Missing id' }); return }

    const removed = useRedis
      ? await eventRedisStore.remove(id)
      : false  // in-memory: cross-instance delete not possible
    res.status(removed ? 200 : 404).json({ removed })
    return
  }

  res.status(405).json({ error: 'Method not allowed' })
}
