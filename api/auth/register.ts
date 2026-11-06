// ─── POST /api/auth/register ─────────────────────────────────────────────────
// Public endpoint. Registers a new user, generates a 6-digit PIN,
// stores the user in Redis and emails the PIN via Resend.
// If the email already exists, a new PIN is generated and re-sent.

import type { VercelRequest, VercelResponse } from '@vercel/node'
import { redis } from '../_lib/db/redis.js'

const RESEND_KEY   = process.env['RESEND_API_KEY']
const FROM_EMAIL   = 'TesRadar <noreply@tesradar.tech>'
const ADMIN_EMAIL  = 'teodorstavrov@gmail.com'

export interface TesRadarUser {
  name:       string
  email:      string
  teslaModel: string
  country:    string
  pin:        string
  createdAt:  number
}

function generatePin(): string {
  return String(Math.floor(100000 + Math.random() * 900000))
}

async function sendPinEmail(to: string, name: string, pin: string): Promise<void> {
  if (!RESEND_KEY) throw new Error('RESEND_API_KEY not configured')

  const r = await fetch('https://api.resend.com/emails', {
    method:  'POST',
    headers: { Authorization: `Bearer ${RESEND_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from:    FROM_EMAIL,
      to:      [to],
      subject: `Твоят TesRadar PIN: ${pin}`,
      text: [
        `Здравей, ${name}!`,
        '',
        'Регистрацията ти в TesRadar беше успешна.',
        '',
        `Твоят PIN код за вход: ${pin}`,
        '',
        'Запази го — ще го използваш при всеки нов браузър или устройство.',
        'TesRadar запомня PIN-а автоматично след първото влизане.',
        '',
        'tesradar.tech',
      ].join('\n'),
    }),
  })

  if (!r.ok) throw new Error(`Resend error: ${await r.text()}`)
}

async function sendAdminNotification(user: TesRadarUser): Promise<void> {
  if (!RESEND_KEY) return
  const model = user.teslaModel || '(not specified)'
  await fetch('https://api.resend.com/emails', {
    method:  'POST',
    headers: { Authorization: `Bearer ${RESEND_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from:    FROM_EMAIL,
      to:      [ADMIN_EMAIL],
      subject: `New TesRadar registration: ${user.name}`,
      text: [
        `New user registered on TesRadar:`,
        '',
        `Name:        ${user.name}`,
        `Email:       ${user.email}`,
        `Country:     ${user.country || '(not specified)'}`,
        `Tesla model: ${model}`,
        `Registered:  ${new Date(user.createdAt).toISOString()}`,
      ].join('\n'),
    }),
  }).catch((e) => console.error('Admin notification failed:', e))
}

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')

  if (req.method === 'OPTIONS') { res.status(204).end(); return }
  if (req.method !== 'POST')    { res.status(405).end(); return }

  const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body ?? {}

  const name:       string = String(body.name       ?? '').trim()
  const email:      string = String(body.email      ?? '').trim().toLowerCase()
  const teslaModel: string = String(body.teslaModel ?? '').trim()
  const country:    string = String(body.country    ?? '').trim()

  if (!name || !email || !email.includes('@')) {
    res.status(400).json({ error: 'Please fill in all required fields.' }); return
  }

  const pin  = generatePin()
  const user: TesRadarUser = { name, email, teslaModel, country, pin, createdAt: Date.now() }

  await redis.set(`user:${email}`, user)

  // Index for admin listing: users hash, field=email, value=JSON (name, model, country, createdAt)
  await redis.hset('users', email, JSON.stringify({ name, teslaModel, country, createdAt: user.createdAt }))

  try {
    await sendPinEmail(email, name, pin)
  } catch (e) {
    console.error('PIN email failed:', e)
    res.status(500).json({ error: 'Failed to send email. Please try again.' }); return
  }

  // Fire-and-forget admin notification — does not block the response
  void sendAdminNotification(user)

  res.status(200).json({ ok: true })
}
