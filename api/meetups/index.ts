// ─── GET  /api/meetups  — list all community meetups ────────────────────
// ─── POST /api/meetups  — create a meetup ───────────────────────────────

import type { VercelRequest, VercelResponse } from '@vercel/node'
import { meetupStore, type Meetup } from '../_lib/meetups/store.js'
import { setCacheHeaders } from '../_lib/cache/headers.js'
import { rateLimit } from '../_lib/utils/rateLimit.js'
import { captureApiError } from '../_lib/utils/sentryApi.js'

const clean = (v: unknown, max: number): string =>
  String(v ?? '').replace(/<[^>]*>/g, '').trim().slice(0, max)

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  if (req.method === 'OPTIONS') { res.status(204).end(); return }

  // ── GET — list all ───────────────────────────────────────────────
  if (req.method === 'GET') {
    try {
      const meetups = await meetupStore.getAll()
      setCacheHeaders(res, 0)
      res.status(200).json({ meetups })
    } catch (err) {
      await captureApiError(err, 'meetups GET')
      res.status(500).json({ error: 'Internal server error' })
    }
    return
  }

  // ── POST — create ─────────────────────────────────────────────────
  if (req.method === 'POST') {
    try {
      const ip = (req.headers['x-forwarded-for'] as string | undefined)?.split(',')[0]?.trim() ?? 'unknown'
      let allowed = true
      try { allowed = await rateLimit(ip, 'meetups', 10, 600) } catch { /* Redis down — skip */ }
      if (!allowed) { res.status(429).json({ error: 'Too many submissions. Please wait a few minutes.' }); return }

      const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body
      const lat = Number(body?.lat)
      const lng = Number(body?.lng)
      const title = clean(body?.title, 120)
      const dateRaw = String(body?.date ?? '')
      const organizer = clean(body?.organizer, 80)
      const facebookUrl = clean(body?.facebookUrl, 300)
      const email = clean(body?.email, 160)

      if (!isFinite(lat) || !isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) {
        res.status(400).json({ error: 'Invalid coordinates' }); return
      }
      if (title.length < 2)        { res.status(400).json({ error: 'Title required' }); return }
      const dateMs = new Date(dateRaw).getTime()
      if (isNaN(dateMs))           { res.status(400).json({ error: 'Invalid date' }); return }
      if (facebookUrl && !/^https?:\/\//i.test(facebookUrl)) {
        res.status(400).json({ error: 'Facebook link must start with http' }); return
      }
      if (email && !EMAIL_RE.test(email)) { res.status(400).json({ error: 'Invalid email' }); return }

      const meetup: Meetup = {
        id:          crypto.randomUUID(),
        lat, lng,
        title,
        date:        new Date(dateMs).toISOString(),
        organizer:   organizer || null,
        facebookUrl: facebookUrl || null,
        createdAt:   new Date().toISOString(),
        interested:  email ? [email] : [],
      }
      await meetupStore.add(meetup)
      res.status(201).json({ meetup })
    } catch (err) {
      await captureApiError(err, 'meetups POST')
      res.status(500).json({ error: 'Internal server error' })
    }
    return
  }

  res.status(405).json({ error: 'Method not allowed' })
}
