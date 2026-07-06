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
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,DELETE,PATCH,PUT,OPTIONS')
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

    // Optional custom marker lifetime (ms). Used by the Waze sync so NL/BE
    // markers live longer (4h15m, matching their 4h cadence) than the police
    // default (2h15m). Admin-only endpoint => trusted; still clamp to a sane max.
    const rawTtl = Number((body as { ttlMs?: unknown })?.ttlMs)
    const customTtl = (isFinite(rawTtl) && rawTtl > 0 && rawTtl <= 7 * 24 * 60 * 60 * 1000) ? rawTtl : null
    const lifetimeMs = customTtl ?? ttlMs(type)

    const now = new Date()
    const event: RoadEvent = {
      id:          crypto.randomUUID(),
      type,
      lat,
      lng,
      description: description?.replace(/<[^>]*>/g, '').trim().slice(0, 200) ?? null,
      reportedAt:  now.toISOString(),
      expiresAt:   new Date(now.getTime() + lifetimeMs).toISOString(),
      confirms:    0,
      denies:      0,
      permanent:   true,   // admin marker — red circle in panel; immune to deny-votes; still expires via expiresAt
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

  // PATCH → update a single event's fields
  if (req.method === 'PATCH') {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body
    const id = String(body?.id ?? '')
    if (!id) { res.status(400).json({ error: 'id required' }); return }

    const patch: Parameters<typeof eventRedisStore.update>[1] = {}

    if (body.type !== undefined) {
      if (!VALID_TYPES.has(body.type as EventType)) { res.status(400).json({ error: 'Invalid type' }); return }
      patch.type = body.type as EventType
      // Recalculate expiry when type changes
      patch.expiresAt = new Date(Date.now() + ttlMs(body.type as EventType)).toISOString()
    }
    if (body.lat !== undefined) {
      const lat = Number(body.lat)
      if (!isFinite(lat)) { res.status(400).json({ error: 'Invalid lat' }); return }
      patch.lat = lat
    }
    if (body.lng !== undefined) {
      const lng = Number(body.lng)
      if (!isFinite(lng)) { res.status(400).json({ error: 'Invalid lng' }); return }
      patch.lng = lng
    }
    if (body.description !== undefined) {
      patch.description = body.description
        ? String(body.description).replace(/<[^>]*>/g, '').trim().slice(0, 200)
        : null
    }
    if (body.permanent !== undefined) {
      patch.permanent = Boolean(body.permanent)
    }

    if (!useRedis) { res.status(501).json({ error: 'Redis not configured' }); return }
    const updated = await eventRedisStore.update(id, patch)
    if (!updated) { res.status(404).json({ error: 'Event not found' }); return }
    res.status(200).json({ event: updated })
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
