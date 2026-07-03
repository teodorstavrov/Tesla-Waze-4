// ─── GET /api/sounds/download?token=<uuid> ────────────────────────────
//
// One-time download page. Validates the Redis token (deletes it on first
// use), then returns a small HTML page that auto-triggers the browser to
// download the WAV file as "LockChime.wav" via the same-origin
// `download` attribute — no filesystem access needed.

import type { VercelRequest, VercelResponse } from '@vercel/node'
import { redis, isRedisConfigured } from '../_lib/db/redis.js'
import { VALID_SOUNDS } from './request-link.js'

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  if (req.method !== 'GET') { res.status(405).end(); return }

  const token = String(req.query['token'] ?? '').trim()
  if (!token) { res.status(400).send('Missing token'); return }

  if (!isRedisConfigured()) { res.status(503).send('Service unavailable'); return }

  const data = await redis.get<{ melodyId: string; email: string }>(`sounds:token:${token}`)
  if (!data) {
    res.setHeader('Content-Type', 'text/html; charset=utf-8')
    res.status(410).send(errorPage('Линкът е вече използван или е изтекъл. Моля, поискай нов от tesradar.tech.'))
    return
  }

  // Delete immediately — one-time use
  await redis.del(`sounds:token:${token}`)

  const { melodyId } = data
  if (!VALID_SOUNDS[melodyId]) {
    res.setHeader('Content-Type', 'text/html; charset=utf-8')
    res.status(400).send(errorPage('Невалидна мелодия.'))
    return
  }

  const melodyName = VALID_SOUNDS[melodyId]!
  const fileUrl    = `/sounds/${melodyId}.wav`

  res.setHeader('Content-Type', 'text/html; charset=utf-8')
  res.setHeader('Cache-Control', 'no-store')
  res.status(200).send(`<!DOCTYPE html>
<html lang="bg">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>TesRadar — Download LockChime.wav</title>
  <style>
    *{box-sizing:border-box;margin:0;padding:0}
    body{background:#0f0f17;color:#f2f2f2;font-family:system-ui,sans-serif;
         min-height:100vh;display:flex;align-items:center;justify-content:center;padding:24px}
    .card{max-width:480px;width:100%;padding:32px 28px;border-radius:20px;
          background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.12)}
    .logo{height:52px;border-radius:10px;margin-bottom:24px}
    h1{font-size:20px;font-weight:800;margin-bottom:8px}
    .sub{font-size:13px;color:rgba(255,255,255,0.5);margin-bottom:24px}
    .melody{background:rgba(255,255,255,0.07);border:1px solid rgba(255,255,255,0.12);
            border-radius:12px;padding:14px 16px;margin-bottom:24px;
            font-size:15px;font-weight:600}
    .btn{display:block;width:100%;padding:15px;border-radius:14px;background:#e31937;
         color:#fff;text-decoration:none;text-align:center;font-size:16px;font-weight:700;
         margin-bottom:24px}
    ol{padding-left:20px;color:rgba(255,255,255,0.7);line-height:2.1;font-size:13px}
    ol strong{color:#f2f2f2}
    .note{margin-top:20px;font-size:11px;color:rgba(255,255,255,0.3);line-height:1.6}
  </style>
</head>
<body>
<div class="card">
  <img src="/new-medium_tran.png" alt="TesRadar" class="logo">
  <h1>🔔 LockChime.wav готов за сваляне</h1>
  <p class="sub">Натисни бутона — файлът ще се свали като <strong>LockChime.wav</strong></p>
  <div class="melody">🎵 ${melodyName}</div>
  <a href="${fileUrl}" download="LockChime.wav" class="btn">⬇ Свали LockChime.wav</a>
  <ol>
    <li>Свали файла (вече е с правилното име <strong>LockChime.wav</strong>)</li>
    <li>Копирай го в <strong>главната директория</strong> на USB флашка (FAT32 / exFAT)</li>
    <li>Включи флашката в USB порта на колата</li>
    <li>На екрана: <strong>Controls → Safety → Lock Sound → USB</strong></li>
  </ol>
  <p class="note">Линкът е еднократен и беше изтрит след отваряне.<br>TesRadar не е обвързан с Tesla, Inc.</p>
</div>
<script>
  // Auto-click the download link on page load
  document.querySelector('a.btn').click();
</script>
</body>
</html>`)
}

function errorPage(msg: string): string {
  return `<!DOCTYPE html>
<html lang="bg">
<head><meta charset="utf-8"><title>TesRadar</title>
<style>body{background:#0f0f17;color:#f2f2f2;font-family:system-ui,sans-serif;
  display:flex;align-items:center;justify-content:center;min-height:100vh;padding:24px;text-align:center}
.card{max-width:400px}.emoji{font-size:52px;margin-bottom:16px}
h1{font-size:18px;font-weight:700;margin-bottom:8px}
p{font-size:13px;color:rgba(255,255,255,0.5);line-height:1.6;margin-bottom:20px}
a{color:#e31937;font-weight:600;text-decoration:none}</style>
</head>
<body><div class="card">
<div class="emoji">⛔</div>
<h1>Линкът не е валиден</h1>
<p>${msg}</p>
<a href="https://tesradar.tech">← Обратно към TesRadar</a>
</div></body></html>`
}
