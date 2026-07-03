// ─── POST /api/sounds/request-link ────────────────────────────────────
//
// Body: { melodyId: string, email: string }
//
// Generates a one-time download token stored in Redis (48h TTL),
// then emails a download link via Resend.

import type { VercelRequest, VercelResponse } from '@vercel/node'
import { randomUUID } from 'crypto'
import { redis, isRedisConfigured } from '../_lib/db/redis.js'
import { rateLimit } from '../_lib/utils/rateLimit.js'

const RESEND_API_KEY = process.env['RESEND_API_KEY']
const FROM_EMAIL     = 'TesRadar <noreply@tesradar.tech>'
const SITE_URL       = 'https://tesradar.tech'
const TOKEN_TTL_SEC  = 48 * 60 * 60   // 48 hours

export const VALID_SOUNDS: Record<string, string> = {
  '90s_modem-connecting':              '90s Modem Connecting',
  'among-us_role-reveal-sound':        'Among Us Role Reveal',
  'brainrot_rizzbot-laugh':            'Rizzbot Laugh',
  'general_owl-hoot':                  'Owl Hoot',
  'general_turkey-gobble':             'Turkey Gobble',
  'metal-gear-solid_alert':            'Metal Gear Solid Alert',
  'nintendo_mario-die':                'Mario Game Over',
  'police_dispatch-siren':             'Police Siren',
  'road-runner_meep-meep':             'Road Runner Meep Meep',
  'who-wants-to-be-a-millionaire_theme': 'Who Wants to Be a Millionaire',
}

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  if (req.method !== 'POST') { res.status(405).json({ error: 'Method not allowed' }); return }

  if (!isRedisConfigured()) { res.status(503).json({ error: 'Service unavailable' }); return }

  const ip = (req.headers['x-forwarded-for'] as string | undefined)?.split(',')[0]?.trim() ?? 'unknown'
  const ok = await rateLimit(ip, 'sounds-link', 3, 3600)
  if (!ok) { res.status(429).json({ error: 'Too many requests — try again in an hour' }); return }

  const { melodyId, email } = req.body as { melodyId?: string; email?: string }

  if (!melodyId || !VALID_SOUNDS[melodyId]) {
    res.status(400).json({ error: 'Invalid melody' }); return
  }
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    res.status(400).json({ error: 'Invalid email' }); return
  }

  const token = randomUUID()
  await redis.setWithExpiry(`sounds:token:${token}`, { melodyId, email }, TOKEN_TTL_SEC)

  const downloadUrl = `${SITE_URL}/api/sounds/download?token=${token}`
  const melodyName  = VALID_SOUNDS[melodyId]!

  await sendEmail(email, melodyName, downloadUrl)

  res.status(200).json({ ok: true })
}

async function sendEmail(to: string, melodyName: string, downloadUrl: string): Promise<void> {
  if (!RESEND_API_KEY) {
    console.log('[sounds] would send download link to', to, '→', downloadUrl)
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

  await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: FROM_EMAIL, to: [to], subject: `🔔 TesRadar — ${melodyName} · Download Link`, html }),
  })
}
