// ─── POST /api/events/confirm ──────────────────────────────────────────
// Body: { id: string }
// Increments the confirms counter for the given event.

import type { VercelRequest, VercelResponse } from '@vercel/node'
import { eventMemStore } from '../_lib/events/store.js'
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

    const event = eventMemStore.confirm(id)
    if (!event) { res.status(404).json({ error: 'Event not found or expired' }); return }

    res.status(200).json({ event })
  } catch (err) {
    res.status(500).json({ error: errorMessage(err) })
  }
}
