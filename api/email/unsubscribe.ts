// ─── /api/email/unsubscribe ─────────────────────────────────────────────
// GET  ?e=<email>&t=<token> → confirmation page with a button (link scanners
//                              that only GET the URL do not unsubscribe anyone).
// POST ?e=<email>&t=<token> → adds the email to the `email:unsub` set.
//                              Also used by one-click List-Unsubscribe (RFC 8058).

import type { VercelRequest, VercelResponse } from '@vercel/node'
import { timingSafeEqual } from 'node:crypto'
import { redis } from '../_lib/db/redis.js'
import { unsubToken } from '../_lib/drip/templates.js'
import { UNSUB_SET } from '../_lib/drip/schedule.js'

function page(title: string, body: string): string {
  return `<!doctype html><html lang="bg"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title></head>
<body style="margin:0;background:#f4f5f7;font-family:Arial,Helvetica,sans-serif;color:#14171c">
<div style="max-width:480px;margin:48px auto;background:#fff;border:1px solid #dde1e7;border-radius:12px;padding:28px">
<div style="font-size:20px;font-weight:bold;border-bottom:3px solid #da0708;padding-bottom:14px;margin-bottom:18px">TesRadar</div>
${body}</div></body></html>`
}

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c] as string))

function validToken(email: string, token: string): boolean {
  try {
    const want = Buffer.from(unsubToken(email))
    const got  = Buffer.from(token)
    return want.length === got.length && timingSafeEqual(want, got)
  } catch {
    return false
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  const email = String(req.query['e'] ?? '').trim().toLowerCase()
  const token = String(req.query['t'] ?? '')

  res.setHeader('Content-Type', 'text/html; charset=utf-8')
  res.setHeader('Cache-Control', 'no-store')

  if (!email || !validToken(email, token)) {
    res.status(400).send(page('TesRadar', '<p>Връзката за отписване не е валидна.<br>This unsubscribe link is not valid.</p><p>contact@tesradar.tech</p>'))
    return
  }

  if (req.method === 'POST') {
    await redis.pipeline([['SADD', UNSUB_SET, email]])
    res.status(200).send(page('TesRadar', `<p><b>Готово.</b> ${esc(email)} няма да получава повече съвети и новини от TesRadar. Имейлите с PIN код продължават.</p>
<p><b>Done.</b> ${esc(email)} will no longer receive tips and news from TesRadar. PIN code emails still work.</p>`))
    return
  }

  const action = `/api/email/unsubscribe?e=${encodeURIComponent(email)}&t=${encodeURIComponent(token)}`
  res.status(200).send(page('TesRadar', `<p>Да спрем ли съветите и новините от TesRadar за <b>${esc(email)}</b>?<br>Stop tips and news from TesRadar for <b>${esc(email)}</b>?</p>
<form method="post" action="${esc(action)}"><button type="submit" style="background:#da0708;color:#fff;border:0;border-radius:8px;padding:12px 20px;font-size:16px;font-weight:bold;cursor:pointer">Отпиши ме · Unsubscribe</button></form>`))
}
