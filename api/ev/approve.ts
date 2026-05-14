// ─── GET /api/ev/approve ────────────────────────────────────────────────
//
// One-click approval link sent in the admin notification email.
// Validates HMAC token, sets approvalStatus='approved', returns HTML.
//
// ?id=user:xxx&token=<hmac-sha256>

import type { VercelRequest, VercelResponse } from '@vercel/node'
import { userStationDb, verifyApproveToken } from '../_lib/db/userStationDb.js'
import { captureApiError } from '../_lib/utils/sentryApi.js'

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  if (req.method !== 'GET') { res.status(405).end(); return }

  const id    = String(req.query['id']    ?? '')
  const token = String(req.query['token'] ?? '')

  function html(title: string, emoji: string, body: string, color: string): void {
    res.setHeader('Content-Type', 'text/html; charset=utf-8')
    res.status(200).send(`<!DOCTYPE html>
<html lang="bg"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${title}</title>
<style>
  body { margin:0; min-height:100vh; display:flex; align-items:center; justify-content:center;
         background:#0d0d14; font-family:Arial,sans-serif; color:#e2e8f0; }
  .card { background:#161622; border:1px solid rgba(255,255,255,0.08); border-radius:16px;
          padding:40px 48px; max-width:480px; text-align:center; }
  h1 { font-size:28px; margin:0 0 12px; color:${color}; }
  p  { color:#94a3b8; margin:0 0 24px; line-height:1.6; }
  a  { display:inline-block; background:${color}; color:#fff; padding:12px 28px;
       border-radius:10px; text-decoration:none; font-weight:700; }
</style></head>
<body><div class="card">
  <div style="font-size:56px;margin-bottom:16px">${emoji}</div>
  <h1>${title}</h1>
  <p>${body}</p>
  <a href="/admin">Отвори Admin панела</a>
</div></body></html>`)
  }

  try {
    if (!id || !token) {
      html('Невалиден линк', '❌', 'Линкът за одобрение е непълен или невалиден.', '#ef4444')
      return
    }

    if (!verifyApproveToken(id, token)) {
      html('Невалиден токен', '🔒', 'Токенът за одобрение е невалиден или изтекъл. Използвайте Admin панела.', '#f97316')
      return
    }

    const ok = await userStationDb.approve(id)
    if (!ok) {
      html('Станцията не е намерена', '🔍', 'Станцията вече е одобрена, изтрита или не съществува.', '#f59e0b')
      return
    }

    html('Станцията е одобрена', '✅', 'Зарядната станция беше успешно одобрена и е видима на картата.', '#22c55e')
  } catch (err) {
    await captureApiError(err, 'ev/approve GET')
    html('Грешка', '❌', 'Възникна грешка при одобрението. Опитайте от Admin панела.', '#ef4444')
  }
}
