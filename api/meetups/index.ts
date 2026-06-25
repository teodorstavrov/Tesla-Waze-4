// ─── GET  /api/meetups  — list all community meetups (no ownerToken) ────
// ─── POST /api/meetups  — create a meetup (returns ownerToken to creator) ─

import type { VercelRequest, VercelResponse } from '@vercel/node'
import { meetupStore, meetupToPublic, VALID_RECURRENCE, type Meetup, type RecurrenceType } from '../_lib/meetups/store.js'
import { sendMeetupEmail, ADMIN_EMAIL, SITE_URL } from '../_lib/meetups/email.js'
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

  if (req.method === 'POST') {
    try {
      const ip = (req.headers['x-forwarded-for'] as string | undefined)?.split(',')[0]?.trim() ?? 'unknown'
      let allowed = true
      try { allowed = await rateLimit(ip, 'meetups', 10, 600) } catch { /* skip */ }
      if (!allowed) { res.status(429).json({ error: 'Too many submissions. Please wait a few minutes.' }); return }

      const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body
      const lat = Number(body?.lat)
      const lng = Number(body?.lng)
      const title          = clean(body?.title, 120)
      const dateRaw        = String(body?.date ?? '')
      const description    = clean(body?.description, 300) || null
      const recurrenceRaw  = String(body?.recurrence ?? 'none')
      const recurrence     = (VALID_RECURRENCE.has(recurrenceRaw) ? recurrenceRaw : 'none') as RecurrenceType
      const organizer      = clean(body?.organizer, 80)
      const organizerPhone = clean(body?.organizerPhone, 40)
      const organizerEmail = clean(body?.organizerEmail, 160)
      const facebook       = clean(body?.facebook, 300)   // free text OR url — no validation

      if (!isFinite(lat) || !isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) {
        res.status(400).json({ error: 'Invalid coordinates' }); return
      }
      if (title.length < 2) { res.status(400).json({ error: 'Title required' }); return }
      const dateMs = new Date(dateRaw).getTime()
      if (isNaN(dateMs))    { res.status(400).json({ error: 'Invalid date' }); return }
      if (organizerEmail && !EMAIL_RE.test(organizerEmail)) { res.status(400).json({ error: 'Invalid email' }); return }

      const ownerToken = crypto.randomUUID()
      const meetup: Meetup = {
        id:        crypto.randomUUID(),
        lat, lng,
        title,
        date:        new Date(dateMs).toISOString(),
        description: description || null,
        recurrence,
        organizer:      organizer || null,
        organizerPhone: organizerPhone || null,
        organizerEmail: organizerEmail || null,
        facebook:       facebook || null,
        createdAt: new Date().toISOString(),
        followers: [],
        ownerToken,
      }
      await meetupStore.add(meetup)

      // Organizer email → subscribe to reminders for this AND every future event.
      if (organizerEmail) { try { await meetupStore.addSubscriber(organizerEmail) } catch { /* non-fatal */ } }

      // Notify admin about the new event.
      const when = new Date(dateMs).toLocaleString('bg-BG', { day: '2-digit', month: 'long', hour: '2-digit', minute: '2-digit' })
      void sendMeetupEmail(ADMIN_EMAIL, `Ново събитие: ${title}`, `
        <h2>📅 Ново събитие в TesRadar</h2>
        <p><b>${title}</b></p>
        <p>🕒 ${when}</p>
        ${organizer ? `<p>👤 ${organizer}</p>` : ''}
        ${organizerPhone ? `<p>📞 ${organizerPhone}</p>` : ''}
        ${organizerEmail ? `<p>✉️ ${organizerEmail}</p>` : ''}
        ${facebook ? `<p>Facebook: ${facebook}</p>` : ''}
        <p><a href="${SITE_URL}/?lat=${lat}&lng=${lng}">Виж на картата</a></p>`)

      res.status(201).json({ meetup: meetupToPublic(meetup), ownerToken })
    } catch (err) {
      await captureApiError(err, 'meetups POST')
      res.status(500).json({ error: 'Internal server error' })
    }
    return
  }

  res.status(405).json({ error: 'Method not allowed' })
}
