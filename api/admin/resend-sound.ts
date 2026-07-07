// ─── GET /api/admin/resend-sound ───────────────────────────────────────
//
// Manually re-sends a Tesla lock-sound download link to a donor.
// Query params: ?secret=ADMIN_SECRET&email=EMAIL&melodyId=MELODY_ID
//
// Example:
//   /api/admin/resend-sound?secret=25892589&email=donor@example.com&melodyId=general_owl-hoot

import type { VercelRequest, VercelResponse } from '@vercel/node'
import { randomUUID } from 'crypto'
import { redis, isRedisConfigured } from '../_lib/db/redis.js'
import { VALID_SOUNDS } from '../sounds/request-link.js'

const ADMIN_SECRET   = process.env['ADMIN_SECRET']
const RESEND_API_KEY = process.env['RESEND_API_KEY']
const FROM_EMAIL     = 'TesRadar <noreply@tesradar.tech>'
const SITE_URL       = 'https://tesradar.tech'
const TOKEN_TTL_SEC  = 48 * 60 * 60

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  if (!ADMIN_SECRET || req.query['secret'] !== ADMIN_SECRET) {
    res.status(401).json({ error: 'Unauthorized' }); return
  }

  const email    = String(req.query['email']    ?? '')
  const melodyId = String(req.query['melodyId'] ?? '')

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    res.status(400).json({ error: 'Missing or invalid email' }); return
  }
  if (!melodyId || !VALID_SOUNDS[melodyId]) {
    res.status(400).json({
      error: 'Missing or invalid melodyId',
      validIds: Object.keys(VALID_SOUNDS),
    }); return
  }
  if (!isRedisConfigured()) { res.status(503).json({ error: 'Redis not configured' }); return }

  const token       = randomUUID()
  const melodyName  = VALID_SOUNDS[melodyId]!
  const downloadUrl = `${SITE_URL}/api/sounds/download?token=${token}`

  await redis.setWithExpiry(`sounds:token:${token}`, { melodyId, email }, TOKEN_TTL_SEC)

  if (!RESEND_API_KEY) {
    res.status(200).json({ ok: true, note: 'RESEND_API_KEY not set — token created but no email sent', downloadUrl })
    return
  }

  const html = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family:sans-serif;background:#0f0f17;color:#f2f2f2;padding:32px;margin:0">
  <div style="max-width:520px;margin:0 auto">
    <img src="https://tesradar.tech/new-medium_tran.png" alt="TesRadar" height="56" style="border-radius:10px;margin-bottom:24px">
    <h2 style="margin:0 0 8px;font-size:22px">🔔 Твоята Tesla мелодия</h2>
    <p style="color:rgba(255,255,255,0.6);margin:0 0 24px">Избрана мелодия: <strong style="color:#f2f2f2">${melodyName}</strong></p>

    <a href="${downloadUrl}" style="display:inline-block;padding:14px 28px;background:#e31937;color:#fff;text-decoration:none;border-radius:12px;font-weight:700;font-size:16px;margin-bottom:24px">
      ⬇ Изтегли мелодията
    </a>

    <div style="background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.12);border-radius:14px;padding:20px;margin-bottom:24px">
      <p style="margin:0 0 12px;font-weight:700;font-size:15px">📋 Как да я инсталираш в Tesla:</p>
      <ol style="margin:0;padding-left:20px;color:rgba(255,255,255,0.75);line-height:2">
        <li>Изтегли файла</li>
        <li>Преименувай го на <strong style="color:#f2f2f2">LockChime.wav</strong></li>
        <li>Копирай го в <strong style="color:#f2f2f2">главната директория</strong> на USB флашка (FAT32 или exFAT)</li>
        <li>Включи флашката в USB порта на колата</li>
        <li>На екрана: <strong style="color:#f2f2f2">Controls → Safety → Lock Sound → USB</strong></li>
      </ol>
    </div>

    <p style="font-size:12px;color:rgba(255,255,255,0.35);margin:0">
      Линкът е еднократен и важи 48 часа.<br>
      TesRadar не е обвързан с Tesla, Inc.
    </p>
  </div>
</body>
</html>`

  const emailRes = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: FROM_EMAIL, to: [email], subject: `🔔 TesRadar — ${melodyName} · Download Link`, html }),
  })

  if (!emailRes.ok) {
    const errText = await emailRes.text().catch(() => '')
    console.error('[admin/resend-sound] Resend error', emailRes.status, errText)
    res.status(502).json({ error: `Resend failed (${emailRes.status})`, details: errText }); return
  }

  res.status(200).json({ ok: true, email, melodyId, melodyName, downloadUrl })
}
