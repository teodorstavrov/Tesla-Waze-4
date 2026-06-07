// ─── PUT/POST /api/meetups/edit — edit a meetup (creator only) ──────────
// Requires the ownerToken returned to the creator at submit time.

import type { VercelRequest, VercelResponse } from '@vercel/node'
import { meetupStore } from '../_lib/meetups/store.js'
import { rateLimit } from '../_lib/utils/rateLimit.js'
import { captureApiError } from '../_lib/utils/sentryApi.js'

const clean = (v: unknown, max: number): string =>
  String(v ?? '').replace(/<[^>]*>/g, '').trim().slice(0, max)
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'PUT,POST,OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  if (req.method === 'OPTIONS') { res.status(204).end(); return }
  if (req.method !== 'PUT' && req.method !== 'POST') { res.status(405).json({ error: 'Method not allowed' }); return }

  try {
    const ip = (req.headers['x-forwarded-for'] as string | undefined)?.split(',')[0]?.trim() ?? 'unknown'
    let allowed = true
    try { allowed = await rateLimit(ip, 'meetups-edit', 30, 600) } catch { /* skip */ }
    if (!allowed) { res.status(429).json({ error: 'Too many requests' }); return }

    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body
    const id = String(body?.id ?? '')
    const ownerToken = String(body?.ownerToken ?? '')
    if (!id || !ownerToken) { res.status(400).json({ error: 'Missing id or token' }); return }

    const title          = clean(body?.title, 120)
    const organizer      = clean(body?.organizer, 80)
    const organizerPhone = clean(body?.organizerPhone, 40)
    const organizerEmail = clean(body?.organizerEmail, 160)
    const facebook       = clean(body?.facebook, 300)
    const dateRaw        = String(body?.date ?? '')

    if (title.length < 2) { res.status(400).json({ error: 'Title required' }); return }
    const dateMs = new Date(dateRaw).getTime()
    if (isNaN(dateMs))    { res.status(400).json({ error: 'Invalid date' }); return }
    if (organizerEmail && !EMAIL_RE.test(organizerEmail)) { res.status(400).json({ error: 'Invalid email' }); return }

    const updated = await meetupStore.update(id, ownerToken, {
      title,
      date: new Date(dateMs).toISOString(),
      organizer:      organizer || null,
      organizerPhone: organizerPhone || null,
      organizerEmail: organizerEmail || null,
      facebook:       facebook || null,
    })
    if (!updated) { res.status(403).json({ error: 'Not allowed or not found' }); return }
    res.status(200).json({ meetup: updated })
  } catch (err) {
    await captureApiError(err, 'meetups edit')
    res.status(500).json({ error: 'Internal server error' })
  }
}
