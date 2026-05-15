// ─── POST /api/ev/submit ────────────────────────────────────────────────
//
// Public endpoint — users submit a new charging station from the map.
// No auth required. Rate-limited to 3 submissions per IP per day.
//
// On success:
//   1. Station saved to Redis with approvalStatus='pending'
//   2. Email sent to admin with one-click approve link
//   3. Station immediately visible on map as 'pending'
//
// Required env vars: ADMIN_SECRET (for approve token), RESEND_API_KEY

import type { VercelRequest, VercelResponse } from '@vercel/node'
import { userStationDb, makeApproveToken } from '../_lib/db/userStationDb.js'
import { rateLimit } from '../_lib/utils/rateLimit.js'
import { cacheDel } from '../_lib/cache/memory.js'
import { captureApiError } from '../_lib/utils/sentryApi.js'
import type { NormalizedStation, Connector } from '../_lib/normalize/types.js'

const RESEND_API_KEY = process.env['RESEND_API_KEY']
const TO_EMAIL       = 'teodorstavrov@gmail.com'
const FROM_EMAIL     = 'TesRadar <noreply@tesradar.tech>'
const BASE_URL       = process.env['VERCEL_URL']
  ? `https://${process.env['VERCEL_URL']}`
  : 'https://tesradar.tech'

function randomId(): string {
  return Math.random().toString(36).slice(2) + Date.now().toString(36)
}

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')

  if (req.method === 'OPTIONS') { res.status(204).end(); return }
  if (req.method !== 'POST')    { res.status(405).json({ error: 'Method not allowed' }); return }

  try {
    // Rate limit: 3 submissions per IP per day
    const ip      = (req.headers['x-forwarded-for'] as string | undefined)?.split(',')[0]?.trim() ?? 'unknown'
    const allowed = await rateLimit(ip, 'ev-submit', 3, 86400)
    if (!allowed) {
      res.status(429).json({ error: 'Изпратихте твърде много заявки. Опитайте утре.' })
      return
    }

    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body

    // ── Validate required fields ──────────────────────────────────
    const lat  = parseFloat(String(body?.lat ?? ''))
    const lng  = parseFloat(String(body?.lng ?? ''))
    const name = String(body?.name ?? '').trim().slice(0, 200)

    if (!isFinite(lat) || !isFinite(lng)) {
      res.status(400).json({ error: 'Невалидни координати' }); return
    }
    if (!name) {
      res.status(400).json({ error: 'Името е задължително' }); return
    }

    // ── Build connectors list ─────────────────────────────────────
    const rawConnectors = Array.isArray(body?.connectors) ? body.connectors as Array<{ type: string; powerKw?: number; count?: number }> : []
    const connectors: Connector[] = rawConnectors
      .filter((c) => c.type)
      .map((c) => ({
        type:    String(c.type).slice(0, 50),
        powerKw: c.powerKw != null ? parseFloat(String(c.powerKw)) || null : null,
        count:   Math.max(1, parseInt(String(c.count ?? '1'), 10) || 1),
      }))

    if (connectors.length === 0) {
      connectors.push({ type: 'Other', powerKw: null, count: 1 })
    }

    const totalPorts = connectors.reduce((s, c) => s + c.count, 0)
    const maxPowerKw = connectors.reduce<number | null>((max, c) => {
      if (c.powerKw == null || !isFinite(c.powerKw)) return max
      return max == null ? c.powerKw : Math.max(max, c.powerKw)
    }, null)

    // ── Build station record ──────────────────────────────────────
    const id = `user:${randomId()}`
    const station: NormalizedStation = {
      id,
      source:          'user',
      externalId:      id,
      name,
      lat,
      lng,
      address:         String(body?.address ?? '').trim().slice(0, 300) || null,
      city:            String(body?.city ?? '').trim().slice(0, 100) || null,
      country:         String(body?.country ?? 'BG').trim().toUpperCase().slice(0, 2),
      network:         String(body?.network ?? '').trim().slice(0, 100) || null,
      totalPorts,
      availablePorts:  null,
      maxPowerKw,
      connectors,
      status:          'available',
      isFree:          body?.isFree === true ? true : body?.isFree === false ? false : null,
      pricePerKwh:     body?.pricePerKwh != null ? parseFloat(String(body.pricePerKwh)) || null : null,
      priceCurrency:   String(body?.priceCurrency ?? '').trim().toUpperCase().slice(0, 3) || null,
      pricingText:     null,
      lastUpdated:     null,
      approvalStatus:  'pending',
      submittedAt:     new Date().toISOString(),
      submitterNotes:  String(body?.notes ?? '').trim().slice(0, 1000) || null,
    }

    await userStationDb.add(station)

    // Bust the in-memory user-stations cache so the next request to /api/ev/stations
    // on this same Vercel instance picks up the new station immediately.
    cacheDel('user-stations-all')

    // ── Send approval email ───────────────────────────────────────
    const token      = makeApproveToken(id)
    const approveUrl = `${BASE_URL}/api/ev/approve?id=${encodeURIComponent(id)}&token=${token}`
    const adminUrl   = `${BASE_URL}/admin`

    const connList = connectors.map((c) => `${c.type}${c.powerKw ? ` ${c.powerKw}kW` : ''} ×${c.count}`).join(', ')
    const locParts = [station.address, station.city, station.country].filter(Boolean).join(', ')
    const priceStr = station.isFree ? 'Безплатна' : station.pricePerKwh ? `${station.pricePerKwh} ${station.priceCurrency ?? ''}` : 'Не е посочена'

    const htmlBody = `
<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;background:#0d0d14;color:#e2e8f0;padding:24px;border-radius:12px">
  <h2 style="color:#fbbf24;margin-top:0">⚡ Нова зарядна станция чака одобрение</h2>
  <table style="width:100%;border-collapse:collapse;margin-bottom:20px">
    <tr><td style="padding:6px 0;color:#94a3b8;width:140px">Име:</td><td style="padding:6px 0"><b>${name}</b></td></tr>
    <tr><td style="padding:6px 0;color:#94a3b8">Местоположение:</td><td style="padding:6px 0">${locParts || '—'}</td></tr>
    <tr><td style="padding:6px 0;color:#94a3b8">Координати:</td><td style="padding:6px 0">${lat.toFixed(6)}, ${lng.toFixed(6)}</td></tr>
    <tr><td style="padding:6px 0;color:#94a3b8">Конектори:</td><td style="padding:6px 0">${connList}</td></tr>
    <tr><td style="padding:6px 0;color:#94a3b8">Оператор:</td><td style="padding:6px 0">${station.network ?? '—'}</td></tr>
    <tr><td style="padding:6px 0;color:#94a3b8">Цена:</td><td style="padding:6px 0">${priceStr}</td></tr>
    ${station.submitterNotes ? `<tr><td style="padding:6px 0;color:#94a3b8">Бележки:</td><td style="padding:6px 0">${station.submitterNotes}</td></tr>` : ''}
  </table>
  <div style="display:flex;gap:12px;flex-wrap:wrap">
    <a href="${approveUrl}" style="display:inline-block;background:#22c55e;color:#fff;padding:14px 28px;border-radius:10px;text-decoration:none;font-weight:700;font-size:16px">
      ✅ ОДОБРЯВАМ
    </a>
    <a href="${adminUrl}" style="display:inline-block;background:rgba(255,255,255,0.12);color:#e2e8f0;padding:14px 28px;border-radius:10px;text-decoration:none;font-weight:600;font-size:16px">
      Отвори Admin панела
    </a>
  </div>
  <p style="color:#64748b;font-size:12px;margin-top:20px">ID: ${id} · Изпратено: ${station.submittedAt}</p>
</div>`.trim()

    if (RESEND_API_KEY) {
      try {
        await fetch('https://api.resend.com/emails', {
          method:  'POST',
          headers: { Authorization: `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            from:    FROM_EMAIL,
            to:      [TO_EMAIL],
            subject: `⚡ Нова зарядна станция: ${name}`,
            html:    htmlBody,
            text:    `Нова зарядна станция "${name}" чака одобрение.\n\nОдобри: ${approveUrl}\nAdmin: ${adminUrl}`,
          }),
        })
      } catch (emailErr) {
        // Non-fatal — station is saved, email failure shouldn't block user
        console.error('[ev/submit] Email failed:', emailErr)
      }
    } else {
      console.log('[ev/submit] No RESEND_API_KEY — approve URL:', approveUrl)
    }

    res.status(200).json({ ok: true, id, approvalStatus: 'pending' })
  } catch (err) {
    await captureApiError(err, 'ev/submit POST')
    res.status(500).json({ error: 'Грешка при запазване. Моля, опитайте отново.' })
  }
}
