// ─── GET  /api/rating  — public aggregate (avg + count) ──────────────
// ─── POST /api/rating  — submit rating (1–5 stars + optional comment) ─
//
// Ratings are stored in Redis as two keys:
//   rating:sum   — running INCRBYFLOAT total
//   rating:count — INCR vote count
//
// Rate limit: 1 POST per IP per day.

import type { VercelRequest, VercelResponse } from '@vercel/node'
import { rateLimit } from './_lib/utils/rateLimit.js'
import { redis, isRedisConfigured } from './_lib/db/redis.js'
import { captureApiError } from './_lib/utils/sentryApi.js'

const RESEND_API_KEY = process.env['RESEND_API_KEY']
const TO_EMAIL       = 'teodorstavrov@gmail.com'
const FROM_EMAIL     = 'Tesla RADAR <noreply@teslaradar.tech>'

const STARS = ['', '⭐', '⭐⭐', '⭐⭐⭐', '⭐⭐⭐⭐', '⭐⭐⭐⭐⭐']

const REDIS_SUM_KEY   = 'rating:sum'
const REDIS_COUNT_KEY = 'rating:count'

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')

  if (req.method === 'OPTIONS') { res.status(204).end(); return }

  // ── GET — public aggregate ─────────────────────────────────────────
  if (req.method === 'GET') {
    try {
      if (!isRedisConfigured()) {
        res.status(200).json({ avg: null, count: 0 }); return
      }

      // INCR/INCRBYFLOAT store raw strings (not JSON), read directly.
      const [sumResult, countResult] = await redis.pipeline([
        ['GET', REDIS_SUM_KEY],
        ['GET', REDIS_COUNT_KEY],
      ])

      const count = parseInt(String(countResult ?? '0'), 10) || 0
      const sum   = parseFloat(String(sumResult   ?? '0')) || 0
      const avg   = count > 0 ? Math.round((sum / count) * 10) / 10 : null

      res.setHeader('Cache-Control', 'public, max-age=30, s-maxage=30')
      res.status(200).json({ avg, count })
    } catch (err) {
      await captureApiError(err, 'rating GET')
      res.status(200).json({ avg: null, count: 0 })   // graceful fallback
    }
    return
  }

  // ── POST — submit rating ───────────────────────────────────────────
  if (req.method !== 'POST') { res.status(405).json({ error: 'Method not allowed' }); return }

  try {
    const ip      = (req.headers['x-forwarded-for'] as string | undefined)?.split(',')[0]?.trim() ?? 'unknown'
    const allowed = await rateLimit(ip, 'rating', 1, 86400)  // 1 per day
    if (!allowed) { res.status(429).json({ error: 'Вече гласувахте днес. Благодарим!' }); return }

    const body    = typeof req.body === 'string' ? JSON.parse(req.body) : req.body
    const rating  = Number(body?.rating ?? 0)
    const comment = String(body?.comment ?? '').trim().slice(0, 500)
    const name    = String(body?.name    ?? '').trim().slice(0, 100)
    const email   = String(body?.email   ?? '').trim().slice(0, 200)
    const country = String(body?.country ?? '').trim().slice(0, 100)
    const city    = String(body?.city    ?? '').trim().slice(0, 100)

    if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
      res.status(400).json({ error: 'Невалидна оценка' }); return
    }

    // Store in Redis (best-effort — don't fail the request if Redis is down)
    if (isRedisConfigured()) {
      try {
        await redis.pipeline([
          ['INCRBYFLOAT', REDIS_SUM_KEY,   rating],
          ['INCR',        REDIS_COUNT_KEY],
        ])
      } catch (redisErr) {
        console.error('[rating] Redis write failed:', redisErr)
      }
    }

    // Send email notification
    if (!RESEND_API_KEY) {
      console.log('[rating] Would send:', { rating, comment })
      res.status(200).json({ ok: true }); return
    }

    const stars   = STARS[rating] ?? ''
    const subject = `Tesla RADAR — Оценка ${rating}/5 ${stars}${name ? ` от ${name}` : ''}`

    const metaLines = [
      name    && `Име: ${name}`,
      email   && `Имейл: ${email}`,
      country && `Държава: ${country}`,
      city    && `Град: ${city}`,
    ].filter(Boolean)

    const metaText = metaLines.length > 0 ? `\n\n${metaLines.join('\n')}` : ''
    const metaHtml = metaLines.length > 0
      ? `<p style="color:#888;font-size:13px;">${metaLines.join('<br>')}</p>`
      : ''

    const text = `Оценка: ${rating}/5 ${stars}${metaText}${comment ? `\n\nКоментар: ${comment}` : ''}`
    const html = `<h2>${stars} ${rating}/5</h2>${metaHtml}${comment ? `<p><b>Коментар:</b> ${comment.replace(/\n/g, '<br>')}</p>` : ''}`

    const emailRes = await fetch('https://api.resend.com/emails', {
      method:  'POST',
      headers: { Authorization: `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: FROM_EMAIL, to: [TO_EMAIL], subject, text, html }),
    })

    if (!emailRes.ok) {
      const err = await emailRes.text()
      throw new Error(`Resend ${emailRes.status}: ${err}`)
    }

    res.status(200).json({ ok: true })
  } catch (err) {
    await captureApiError(err, 'rating POST')
    res.status(500).json({ error: 'Грешка при изпращане.' })
  }
}
