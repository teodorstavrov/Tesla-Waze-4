// ─── POST /api/events/deny ─────────────────────────────────────────────
// Body: { id: string }
// Increments the denies counter. Auto-deletes the event at 3 denies.
// Returns { event } if still alive, or { deleted: true } if removed.

import type { VercelRequest, VercelResponse } from '@vercel/node'
import { eventMemStore } from '../_lib/events/store.js'
import { eventRedisStore } from '../_lib/events/redisStore.js'
import { isRedisConfigured } from '../_lib/db/redis.js'
import { errorMessage } from '../_lib/utils/request.js'

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

    const result = isRedisConfigured()
      ? await eventRedisStore.deny(id)
      : eventMemStore.deny(id)

    if (result === null)      { res.status(404).json({ error: 'Event not found or expired' }); return }
    if (result === 'deleted') { res.status(200).json({ deleted: true }); return }

    res.status(200).json({ event: result })
  } catch (err) {
    res.status(500).json({ error: errorMessage(err) })
  }
}
