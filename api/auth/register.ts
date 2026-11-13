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

function buildPinHtml(name: string, pin: string): string {
  return `<!DOCTYPE html>
<html lang="bg">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f4f4f5;font-family:Arial,Helvetica,sans-serif">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;padding:32px 16px">
    <tr><td align="center">
      <table cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:8px;overflow:hidden;max-width:480px;width:100%">
        <tr><td style="background:#e31937;padding:24px 32px">
          <p style="margin:0;color:#ffffff;font-size:22px;font-weight:bold;letter-spacing:0.5px">TesRadar</p>
          <p style="margin:4px 0 0;color:rgba(255,255,255,0.8);font-size:13px">tesradar.tech</p>
        </td></tr>
        <tr><td style="padding:32px">
          <p style="margin:0 0 16px;color:#111827;font-size:16px">Здравей, <strong>${name}</strong>!</p>
          <p style="margin:0 0 24px;color:#374151;font-size:14px;line-height:1.6">Регистрацията ти в TesRadar беше успешна. Ето твоят PIN код за вход:</p>
          <div style="background:#f9fafb;border:2px solid #e31937;border-radius:8px;padding:20px;text-align:center;margin:0 0 24px">
            <p style="margin:0 0 6px;color:#6b7280;font-size:11px;text-transform:uppercase;letter-spacing:1.5px">PIN КОД</p>
            <p style="margin:0;color:#e31937;font-size:40px;font-weight:bold;letter-spacing:14px;font-family:monospace">${pin}</p>
          </div>
          <p style="margin:0;color:#374151;font-size:14px;line-height:1.6">Запази го — ще го използваш при всеки нов браузър или устройство. TesRadar запомня PIN-а автоматично след първото влизане.</p>
        </td></tr>
        <tr><td style="padding:16px 32px 24px;border-top:1px solid #f3f4f6">
          <p style="margin:0;color:#9ca3af;font-size:12px;line-height:1.5">Ако не си се регистрирал в TesRadar, просто игнорирай този имейл.</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`
}

async function sendPinEmail(to: string, name: string, pin: string): Promise<void> {
  if (!RESEND_KEY) throw new Error('RESEND_API_KEY not configured')

  const r = await fetch('https://api.resend.com/emails', {
    method:  'POST',
    headers: { Authorization: `Bearer ${RESEND_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from:     FROM_EMAIL,
      to:       [to],
      reply_to: 'noreply@tesradar.tech',
      subject:  'Твоят TesRadar PIN код',
      headers: {
        // Unique per send — prevents email clients from threading/deduplicating PIN emails
        'X-Entity-Ref-ID': `tesradar-reg-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      },
      html: buildPinHtml(name, pin),
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
        'Ако не си се регистрирал в TesRadar, просто игнорирай този имейл.',
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

  // Await admin notification before closing — Vercel kills the function after res.json()
  await sendAdminNotification(user)

  res.status(200).json({ ok: true })
}
