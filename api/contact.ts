// ─── POST /api/contact ────────────────────────────────────────────────
// Sends a contact message to the admin email via Resend REST API.
// Required env var: RESEND_API_KEY
// Sender domain: tesradar.tech (must be verified in Resend dashboard)

import type { VercelRequest, VercelResponse } from '@vercel/node'
import { rateLimit } from './_lib/utils/rateLimit.js'
import { captureApiError } from './_lib/utils/sentryApi.js'

const RESEND_API_KEY = process.env['RESEND_API_KEY']
const TO_EMAIL       = 'teodorstavrov@gmail.com'
const FROM_EMAIL     = 'Tesla RADAR <noreply@tesradar.tech>'

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')

  if (req.method === 'OPTIONS') { res.status(204).end(); return }
  if (req.method !== 'POST')    { res.status(405).json({ error: 'Method not allowed' }); return }

  try {
    // Rate limit: 3 messages per IP per hour
    const ip      = (req.headers['x-forwarded-for'] as string | undefined)?.split(',')[0]?.trim() ?? 'unknown'
    const allowed = await rateLimit(ip, 'contact', 3, 3600)
    if (!allowed) { res.status(429).json({ error: 'Изпратихте твърде много съобщения. Опитайте след час.' }); return }

    const body    = typeof req.body === 'string' ? JSON.parse(req.body) : req.body
    const email   = String(body?.email ?? '').trim().slice(0, 200)
    const message = String(body?.message ?? '').trim().slice(0, 2000)

    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      res.status(400).json({ error: 'Невалиден имейл адрес' }); return
    }
    if (message.length < 10) {
      res.status(400).json({ error: 'Съобщението е твърде кратко' }); return
    }

    if (!RESEND_API_KEY) {
      // Dev fallback — log and pretend success
      console.log('[contact] Email would be sent:', { from: email, message })
      res.status(200).json({ ok: true }); return
    }

    const emailRes = await fetch('https://api.resend.com/emails', {
      method:  'POST',
      headers: {
        Authorization:  `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from:    FROM_EMAIL,
        to:      [TO_EMAIL],
        reply_to: email,
        subject: `Tesla RADAR — съобщение от ${email}`,
        text:    `От: ${email}\n\n${message}`,
        html:    `<p><b>От:</b> ${email}</p><br><p>${message.replace(/\n/g, '<br>')}</p>`,
      }),
    })

    if (!emailRes.ok) {
      const err = await emailRes.text()
      throw new Error(`Resend ${emailRes.status}: ${err}`)
    }

    res.status(200).json({ ok: true })
  } catch (err) {
    await captureApiError(err, 'contact POST')
    res.status(500).json({ error: 'Грешка при изпращане. Моля, опитайте отново.' })
  }
}
