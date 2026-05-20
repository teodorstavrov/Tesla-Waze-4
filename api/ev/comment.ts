// ─── POST /api/ev/comment ─────────────────────────────────────────────
// Accepts a user comment for a charging station.
// Saves to Redis + sends email to admin.
// Rate-limited: 3 comments per IP per hour.

import type { VercelRequest, VercelResponse } from '@vercel/node'
import { commentDb } from '../_lib/db/commentDb.js'
import { rateLimit } from '../_lib/utils/rateLimit.js'
import { captureApiError } from '../_lib/utils/sentryApi.js'

const RESEND_API_KEY = process.env['RESEND_API_KEY']
const TO_EMAIL       = 'teodorstavrov@gmail.com'
const FROM_EMAIL     = 'TesRadar <noreply@tesradar.tech>'

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')

  if (req.method === 'OPTIONS') { res.status(204).end(); return }
  if (req.method !== 'POST')   { res.status(405).json({ error: 'Method not allowed' }); return }

  const ip = (req.headers['x-forwarded-for'] as string | undefined)?.split(',')[0]?.trim() ?? 'unknown'
  if (!await rateLimit(ip, 'ev-comment', 3, 3600)) {
    res.status(429).json({ error: 'Too many comments — please wait a moment' })
    return
  }

  const body        = typeof req.body === 'string' ? JSON.parse(req.body) : req.body
  const stationId   = String(body?.stationId   ?? '').trim()
  const stationName = String(body?.stationName ?? '').trim().slice(0, 200)
  const lat         = parseFloat(String(body?.lat ?? ''))
  const lng         = parseFloat(String(body?.lng ?? ''))
  const text        = String(body?.text        ?? '').trim().slice(0, 1000)

  if (!stationId || !text || !isFinite(lat) || !isFinite(lng)) {
    res.status(400).json({ error: 'Missing required fields' })
    return
  }

  const comment = {
    id:          Math.random().toString(36).slice(2) + Date.now().toString(36),
    stationId,
    stationName: stationName || stationId,
    lat,
    lng,
    text,
    submittedAt: new Date().toISOString(),
  }

  try {
    await commentDb.add(comment)

    if (RESEND_API_KEY) {
      const mapsUrl = `https://www.google.com/maps?q=${lat},${lng}`
      await fetch('https://api.resend.com/emails', {
        method:  'POST',
        headers: { Authorization: `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from:    FROM_EMAIL,
          to:      TO_EMAIL,
          subject: `💬 Коментар: ${stationName || stationId}`,
          html: `
            <div style="font-family:system-ui,sans-serif;max-width:520px;">
              <h2 style="color:#f97316;">💬 Нов коментар за зарядна станция</h2>
              <p><strong>Станция:</strong> ${stationName || stationId}</p>
              <p><strong>ID:</strong> <code>${stationId}</code></p>
              <p><strong>Локация:</strong>
                <a href="${mapsUrl}">${lat.toFixed(5)}, ${lng.toFixed(5)}</a>
              </p>
              <hr style="border:none;border-top:1px solid #eee;margin:16px 0;">
              <blockquote style="margin:0;padding:12px 16px;background:#f9f9f9;border-left:4px solid #f97316;border-radius:4px;font-size:16px;">
                ${text.replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '<br>')}
              </blockquote>
              <hr style="border:none;border-top:1px solid #eee;margin:16px 0;">
              <p style="color:#999;font-size:12px;">${new Date().toLocaleString('bg-BG')}</p>
            </div>`,
        }),
      })
    }

    res.status(200).json({ ok: true })
  } catch (err) {
    await captureApiError(err, 'ev/comment')
    res.status(500).json({ error: 'Internal server error' })
  }
}
