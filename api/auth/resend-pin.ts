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

  const html = `<!DOCTYPE html>
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
          <p style="margin:0 0 16px;color:#111827;font-size:16px">Здравей, <strong>${user.name}</strong>!</p>
          <p style="margin:0 0 24px;color:#374151;font-size:14px;line-height:1.6">Поиска нов PIN код за TesRadar. Ето твоя нов PIN:</p>
          <div style="background:#f9fafb;border:2px solid #e31937;border-radius:8px;padding:20px;text-align:center;margin:0 0 24px">
            <p style="margin:0 0 6px;color:#6b7280;font-size:11px;text-transform:uppercase;letter-spacing:1.5px">PIN КОД</p>
            <p style="margin:0;color:#e31937;font-size:40px;font-weight:bold;letter-spacing:14px;font-family:monospace">${pin}</p>
          </div>
          <p style="margin:0;color:#374151;font-size:14px;line-height:1.6">TesRadar запомня PIN-а автоматично след първото влизане.</p>
        </td></tr>
        <tr><td style="padding:16px 32px 24px;border-top:1px solid #f3f4f6">
          <p style="margin:0;color:#9ca3af;font-size:12px;line-height:1.5">Ако не си поискал нов PIN, можеш да игнорираш този имейл.</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`

  await fetch('https://api.resend.com/emails', {
    method:  'POST',
    headers: { Authorization: `Bearer ${RESEND_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from:     FROM_EMAIL,
      to:       [email],
      reply_to: 'noreply@tesradar.tech',
      subject:  'Твоят нов TesRadar PIN код',
      headers: {
        'X-Entity-Ref-ID': `tesradar-pin-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      },
      html,
      text: [
        `Здравей, ${user.name}!`,
        '',
        'Поиска нов PIN код за TesRadar.',
        '',
        `Твоят нов PIN код: ${pin}`,
        '',
        'TesRadar запомня PIN-а автоматично след първото влизане.',
        '',
        'Ако не си поискал нов PIN, можеш да игнорираш този имейл.',
        '',
        'tesradar.tech',
      ].join('\n'),
    }),
  }).catch((e) => console.error('Resend PIN email failed:', e))
}
