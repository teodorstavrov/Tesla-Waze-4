// ─── POST /api/meetups/rsvp — anonymous attend / interest toggle ──────────
// { id, deviceId, type: 'attend'|'interest', action: 'add'|'remove' }
// Returns updated public meetup so the client can refresh counts.

import type { VercelRequest, VercelResponse } from '@vercel/node'
import { meetupStore } from '../_lib/meetups/store.js'
import { rateLimit } from '../_lib/utils/rateLimit.js'
import { captureApiError } from '../_lib/utils/sentryApi.js'

const UUID_RE = /^[0-9a-f-]{32,36}$/i

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  if (req.method === 'OPTIONS') { res.status(204).end(); return }
  if (req.method !== 'POST') { res.status(405).json({ error: 'Method not allowed' }); return }

  try {
    const ip = (req.headers['x-forwarded-for'] as string | undefined)?.split(',')[0]?.trim() ?? 'unknown'
    let allowed = true
    try { allowed = await rateLimit(ip, 'meetups-rsvp', 60, 600) } catch { /* skip */ }
    if (!allowed) { res.status(429).json({ error: 'Too many requests' }); return }

    const body     = typeof req.body === 'string' ? JSON.parse(req.body) : req.body
    const id       = String(body?.id       ?? '').trim()
    const deviceId = String(body?.deviceId ?? '').trim()
    const type     = String(body?.type     ?? '')
    const action   = String(body?.action   ?? '')

    if (!id)                              { res.status(400).json({ error: 'Missing id' });       return }
    if (!UUID_RE.test(deviceId))          { res.status(400).json({ error: 'Invalid deviceId' }); return }
    if (type !== 'attend' && type !== 'interest') { res.status(400).json({ error: 'Invalid type' }); return }
    if (action !== 'add'  && action !== 'remove') { res.status(400).json({ error: 'Invalid action' }); return }

    const updated = await meetupStore.rsvp(id, deviceId, type as 'attend' | 'interest', action as 'add' | 'remove')
    if (!updated) { res.status(404).json({ error: 'Meetup not found' }); return }

    res.status(200).json({ meetup: updated })
  } catch (err) {
    await captureApiError(err, 'meetups rsvp')
    res.status(500).json({ error: 'Internal server error' })
  }
}
