// ─── POST /api/meetups/interest  — register interest (follow) by email ──

import type { VercelRequest, VercelResponse } from '@vercel/node'
import { meetupStore } from '../_lib/meetups/store.js'
import { rateLimit } from '../_lib/utils/rateLimit.js'
import { captureApiError } from '../_lib/utils/sentryApi.js'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  if (req.method === 'OPTIONS') { res.status(204).end(); return }
  if (req.method !== 'POST') { res.status(405).json({ error: 'Method not allowed' }); return }

  try {
    const ip = (req.headers['x-forwarded-for'] as string | undefined)?.split(',')[0]?.trim() ?? 'unknown'
    let allowed = true
    try { allowed = await rateLimit(ip, 'meetups-interest', 20, 600) } catch { /* skip */ }
    if (!allowed) { res.status(429).json({ error: 'Too many requests' }); return }

    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body
    const id = String(body?.id ?? '')
    const email = String(body?.email ?? '').trim().slice(0, 160)
    if (!id)                  { res.status(400).json({ error: 'Missing id' }); return }
    if (!EMAIL_RE.test(email)) { res.status(400).json({ error: 'Invalid email' }); return }

    const ok = await meetupStore.addInterest(id, email)
    if (!ok) { res.status(404).json({ error: 'Meetup not found' }); return }
    res.status(200).json({ ok: true })
  } catch (err) {
    await captureApiError(err, 'meetups interest')
    res.status(500).json({ error: 'Internal server error' })
  }
}
