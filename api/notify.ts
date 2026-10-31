// ─── POST /api/notify — изпраща имейл нотификация чрез Resend ────────────────
// Protected: Authorization: Bearer ADMIN_SECRET

import type { VercelRequest, VercelResponse } from '@vercel/node'
import { isAuthorized, unauthorized } from './_lib/admin/auth.js'

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Authorization,Content-Type')

  if (req.method === 'OPTIONS') { res.status(204).end(); return }
  if (!isAuthorized(req))       { unauthorized(res); return }
  if (req.method !== 'POST')    { res.status(405).json({ error: 'Method not allowed' }); return }

  const RESEND_KEY = process.env.RESEND_API_KEY
  if (!RESEND_KEY) { res.status(500).json({ error: 'RESEND_API_KEY not configured' }); return }

  const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body
  const to      = String(body?.to      ?? '').trim()
  const subject = String(body?.subject ?? '').trim()
  const text    = String(body?.text    ?? '').trim()

  if (!to || !subject || !text) { res.status(400).json({ error: 'Missing fields: to, subject, text' }); return }

  const r = await fetch('https://api.resend.com/emails', {
    method:  'POST',
    headers: { 'Authorization': `Bearer ${RESEND_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from:    'TesRadar <noreply@tesradar.tech>',
      to:      [to],
      subject,
      text,
    }),
  })

  if (!r.ok) {
    const err = await r.text()
    res.status(500).json({ error: err }); return
  }

  res.status(200).json({ ok: true })
}
