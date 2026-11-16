// ─── GET /api/cron/drip ─────────────────────────────────────────────────
// Re-engage email course. Runs on weekdays at 17:00 UTC (vercel.json).
//
// For every registered user it works out the next course email that is due
// (api/_lib/drip/schedule.ts), sends at most DRIP_DAILY_CAP of them through
// Resend and records each send in drip:{email}.
//
// Safety:
//   • Sends only when DRIP_ENABLED=1. Otherwise it is a dry run that returns
//     who would get what today.
//   • Skips unsubscribed (email:unsub), users who unticked the news checkbox
//     at registration, and DRIP_EXCLUDE.
//   • Idempotency-Key per email+number, so a re-run never double-sends.
//
// Manual:  GET /api/cron/drip?secret=CRON_SECRET            (dry run unless enabled)
// Test:    GET /api/cron/drip?secret=CRON_SECRET&test=you@x.com&n=3
//          sends email 3 to that address only, without recording it.

import type { VercelRequest, VercelResponse } from '@vercel/node'
import { redis } from '../_lib/db/redis.js'
import { DRIP_DAILY_CAP, DRIP_EXCLUDE, UNSUB_SET, dripKey, nextDue } from '../_lib/drip/schedule.js'
import { renderMail } from '../_lib/drip/templates.js'

const RESEND_KEY = process.env['RESEND_API_KEY']
const VALID_EMAIL = /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i

interface Row { email: string; name: string; country: string; createdAt: number; marketing?: boolean }

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

async function send(row: Row, n: number, record: boolean): Promise<{ ok: boolean; error?: string }> {
  if (!RESEND_KEY) return { ok: false, error: 'RESEND_API_KEY not configured' }
  const m = renderMail(n, row)
  const r = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${RESEND_KEY}`,
      'Content-Type': 'application/json',
      ...(record ? { 'Idempotency-Key': `drip-${row.email}-${n}` } : {}),
    },
    body: JSON.stringify({
      from: m.from,
      to: [row.email],
      reply_to: 'contact@tesradar.tech',
      subject: record ? m.subject : `[ТЕСТ ${n}] ${m.subject}`,
      html: m.html,
      text: m.text,
      headers: m.headers,
      tags: [{ name: 'campaign', value: 'reengage_2026q4' }, { name: 'email', value: `e${n}` }],
    }),
  })
  if (!r.ok) return { ok: false, error: `${r.status} ${await r.text()}` }
  if (record) await redis.hset(dripKey(row.email), String(n), new Date().toISOString())
  return { ok: true }
}

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  const secret = process.env['CRON_SECRET']
  if (!secret) { res.status(503).json({ error: 'CRON_SECRET not configured' }); return }
  const headerAuth  = (req.headers['authorization'] ?? '').replace(/^Bearer\s+/i, '')
  const querySecret = String(req.query['secret'] ?? '')
  if (headerAuth !== secret && querySecret !== secret) { res.status(401).json({ error: 'Unauthorized' }); return }

  // ── Test send to one address ──
  const testTo = String(req.query['test'] ?? '').trim().toLowerCase()
  if (testTo) {
    const n = Math.min(10, Math.max(1, Number(req.query['n'] ?? 1) || 1))
    const country = String(req.query['country'] ?? 'BG')
    const r = await send({ email: testTo, name: String(req.query['name'] ?? 'Теодор'), country, createdAt: 0 }, n, false)
    res.status(r.ok ? 200 : 502).json({ test: testTo, n, ...r })
    return
  }

  const now   = new Date()
  const today = now.toISOString().slice(0, 10)
  const wd    = now.getUTCDay()
  const enabled = process.env['DRIP_ENABLED'] === '1'

  if (wd === 0 || wd === 6) { res.status(200).json({ today, skipped: 'weekend' }); return }

  const raw = (await redis.hgetall('users')) ?? {}
  const rows: Row[] = Object.entries(raw).map(([email, v]) => {
    let d: Partial<Row> = {}
    try { d = typeof v === 'string' ? JSON.parse(v) : (v as Partial<Row>) } catch { /* keep empty */ }
    return { email: email.trim().toLowerCase(), name: String(d.name ?? ''), country: String(d.country ?? ''), createdAt: Number(d.createdAt ?? 0), marketing: d.marketing }
  })

  const [unsubRaw] = await redis.pipeline([['SMEMBERS', UNSUB_SET]])
  const unsub = new Set((Array.isArray(unsubRaw) ? unsubRaw : []).map((x) => String(x).toLowerCase()))

  const eligible = rows.filter((r) => VALID_EMAIL.test(r.email) && !DRIP_EXCLUDE.has(r.email) && !unsub.has(r.email) && r.marketing !== false)
  const sentRaw  = eligible.length ? await redis.pipeline(eligible.map((r) => ['HGETALL', dripKey(r.email)])) : []

  const due: { row: Row; n: number; planned: string }[] = []
  eligible.forEach((row, i) => {
    const sent: Record<string, string> = {}
    const s = sentRaw[i]
    if (Array.isArray(s)) for (let j = 0; j + 1 < s.length; j += 2) sent[String(s[j])] = String(s[j + 1])
    const d = nextDue(row, sent, today)
    if (d) due.push({ row, ...d })
  })
  due.sort((a, b) => (a.planned === b.planned ? a.row.createdAt - b.row.createdAt : a.planned < b.planned ? -1 : 1))

  const batch    = due.slice(0, DRIP_DAILY_CAP)
  const deferred = due.length - batch.length

  if (!enabled) {
    res.status(200).json({
      today, dryRun: true, cap: DRIP_DAILY_CAP, due: due.length, wouldSend: batch.length, deferred,
      byEmail: batch.reduce<Record<string, number>>((acc, d) => { acc[`e${d.n}`] = (acc[`e${d.n}`] ?? 0) + 1; return acc }, {}),
      recipients: batch.map((d) => `${d.row.email} · e${d.n}`),
    })
    return
  }

  let sent = 0
  const errors: string[] = []
  for (const d of batch) {
    const r = await send(d.row, d.n, true)
    if (r.ok) sent++
    else errors.push(`${d.row.email} e${d.n}: ${r.error}`)
    await sleep(600) // Resend: 2 requests per second
  }

  res.status(200).json({ today, cap: DRIP_DAILY_CAP, due: due.length, sent, deferred, errors })
}
