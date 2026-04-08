// ─── GET    /api/admin/events       — list all active events ────────────
// ─── POST   /api/admin/events       — create event (no rate limit) ──────
// ─── DELETE /api/admin/events?id=   — remove event by id ────────────────
// ─── DELETE /api/admin/events       — clear ALL events ──────────────────
// ─── PUT    /api/admin/events       — reset all confirms/denies to 0 ─────
// Protected: Authorization: Bearer ADMIN_SECRET

import type { VercelRequest, VercelResponse } from '@vercel/node'
import { isAuthorized, unauthorized } from '../_lib/admin/auth.js'
import { eventRedisStore } from '../_lib/events/redisStore.js'
import { eventMemStore } from '../_lib/events/store.js'
import { isRedisConfigured } from '../_lib/db/redis.js'
import type { EventType, RoadEvent } from '../_lib/events/types.js'
import { ttlMs } from '../_lib/events/types.js'

const VALID_TYPES = new Set<EventType>([
  'police', 'accident', 'hazard', 'traffic', 'camera', 'construction',
])

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,DELETE,OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Authorization,Content-Type')

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

  if (req.method === 'POST') {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body
    const type: EventType = body?.type
    const lat  = Number(body?.lat)
    const lng  = Number(body?.lng)
    const description: string | null = body?.description ?? null

    if (!VALID_TYPES.has(type))           { res.status(400).json({ error: `Invalid type: ${String(type)}` }); return }
    if (!isFinite(lat) || !isFinite(lng)) { res.status(400).json({ error: 'Invalid coordinates' }); return }

    const now = new Date()
    const event: RoadEvent = {
      id:          crypto.randomUUID(),
      type,
      lat,
      lng,
      description: description?.replace(/<[^>]*>/g, '').trim().slice(0, 200) ?? null,
      reportedAt:  now.toISOString(),
      expiresAt:   new Date(now.getTime() + ttlMs(type)).toISOString(),
      confirms:    0,
      denies:      0,
    }

    if (useRedis) { await eventRedisStore.add(event) }
    else          { eventMemStore.add(event) }

    res.status(201).json({ event })
    return
  }

  if (req.method === 'DELETE') {
    const id = String(req.query['id'] ?? '')

    // DELETE with no id → clear ALL events
    if (!id) {
      if (useRedis) await eventRedisStore.clearAll()
      res.status(200).json({ cleared: true })
      return
    }

    const removed = useRedis
      ? await eventRedisStore.remove(id)
      : false
    res.status(removed ? 200 : 404).json({ removed })
    return
  }

  // PUT → reset confirms/denies to 0 for all events
  if (req.method === 'PUT') {
    const count = useRedis ? await eventRedisStore.resetAllCounters() : 0
    res.status(200).json({ reset: count })
    return
  }

  res.status(405).json({ error: 'Method not allowed' })
}
