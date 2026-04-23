// ─── POST /api/events/confirm ──────────────────────────────────────────
// Body: { id: string }
// Increments the confirms counter for the given event.

import type { VercelRequest, VercelResponse } from '@vercel/node'
import { eventMemStore } from '../_lib/events/store.js'
import { eventRedisStore } from '../_lib/events/redisStore.js'
import { isRedisConfigured } from '../_lib/db/redis.js'
import { rateLimit } from '../_lib/utils/rateLimit.js'
import { captureApiError } from '../_lib/utils/sentryApi.js'

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')

  if (req.method === 'OPTIONS') { res.status(204).end(); return }
  if (req.method !== 'POST')   { res.status(405).json({ error: 'Method not allowed' }); return }

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body
    const id = String(body?.id ?? '')
    if (!id) { res.status(400).json({ error: 'Missing id' }); return }

    // Rate limit: 3 votes per IP per event per hour (prevents vote spam)
    const ip = (req.headers['x-forwarded-for'] as string | undefined)?.split(',')[0]?.trim() ?? 'unknown'
    let allowed = true
    try { allowed = await rateLimit(ip, `vote:${id}`, 3, 3600) } catch { /* Redis down — skip */ }
    if (!allowed) { res.status(429).json({ error: 'Too many votes on this event' }); return }

    let event
    try {
      event = isRedisConfigured()
        ? await eventRedisStore.confirm(id)
        : eventMemStore.confirm(id)
    } catch {
      event = eventMemStore.confirm(id)
    }
    if (!event) { res.status(404).json({ error: 'Event not found or expired' }); return }

    res.status(200).json({ event })
  } catch (err) {
    await captureApiError(err, 'events/confirm')
    res.status(500).json({ error: 'Internal server error' })
  }
}
