// ─── POST /api/auth/resend-pin ────────────────────────────────────────────────
// Public endpoint. Generates a new PIN for an existing user and re-sends it.
// Always returns 200 (no email enumeration).

import type { VercelRequest, VercelResponse } from '@vercel/node'
import { redis } from '../_lib/db/redis.js'
import type { TesRadarUser } from './register.js'

const RESEND_KEY = process.env['RESEND_API_KEY']
const FROM_EMAIL = 'TesRadar <noreply@tesradar.tech>'

function generatePin(): string {
  return String(Math.floor(100000 + Math.random() * 900000))
}

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')

  if (req.method === 'OPTIONS') { res.status(204).end(); return }
  if (req.method !== 'POST')    { res.status(405).end(); return }

  const body  = typeof req.body === 'string' ? JSON.parse(req.body) : req.body ?? {}
  const email = String(body.email ?? '').trim().toLowerCase()

  if (!email || !email.includes('@')) {
    res.status(400).json({ error: 'Please enter a valid email address.' }); return
  }

  // Always respond 200 — do not reveal whether email is registered
  res.status(200).json({ ok: true })

  // Fire-and-forget: regenerate PIN only if user exists
  const user = await redis.get<TesRadarUser>(`user:${email}`)
  if (!user || !RESEND_KEY) return

  const pin     = generatePin()
  const updated = { ...user, pin }
  await redis.set(`user:${email}`, updated)

  await fetch('https://api.resend.com/emails', {
    method:  'POST',
    headers: { Authorization: `Bearer ${RESEND_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from:    FROM_EMAIL,
      to:      [email],
      subject: `Your new TesRadar PIN: ${pin}`,
      text: [
        `Hi ${user.name},`,
        '',
        'You requested a new PIN for TesRadar.',
        '',
        `Your new PIN: ${pin}`,
        '',
        'TesRadar remembers your PIN automatically after the first login.',
        '',
        'tesradar.tech',
      ].join('\n'),
    }),
  }).catch((e) => console.error('Resend PIN email failed:', e))
}
