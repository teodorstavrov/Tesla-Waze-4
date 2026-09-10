// ─── GET /api/admin/ai-stats ──────────────────────────────────────────────
//
// Returns AI voice assistant usage statistics for the admin panel.
//
// Query params:
//   limit  — number of recent log entries to return (default 50, max 200)
//   before — cursor timestamp (ms) for pagination; fetches entries before this
//
// Response:
//   {
//     counts: {
//       total: string,                  // all-time total queries
//       "day:2026-09-05": string,       // per-day query count
//       "week:2026-W36": string,        // per ISO week query count
//       "month:2026-09": string,        // per month query count
//       "outcome:intent": string,
//       "outcome:qa": string,
//       "outcome:error": string,
//     },
//     users: {
//       total: number,   // all-time unique users (HyperLogLog estimate)
//       month: number,   // unique users this calendar month
//       today: number,   // unique users today (UTC)
//     },
//     logs: Array<{
//       ts:  number,   // Unix ms
//       q:   string,   // question
//       a:   string,   // answer
//       out: string,   // 'intent' | 'qa' | 'error'
//       it:  string | null,  // intentType: 'navigate' | 'action'
//       ln:  string | null,  // language
//       ip:  string | null,  // anonymised IP
//       er:  string | null,  // error text
//     }>,
//     logsTotal: number,   // total entries in the sorted set (all 90 days)
//   }

import type { VercelRequest, VercelResponse } from '@vercel/node'
import { redis } from '../_lib/db/redis.js'

const LOGS_KEY   = 'ai:logs'
const COUNTS_KEY = 'ai:counts'

function p(n: number): string { return String(n).padStart(2, '0') }

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  // Auth
  const secret = process.env['ADMIN_SECRET']
  const auth   = req.headers['authorization']
  if (!secret || auth !== `Bearer ${secret}`) {
    res.status(401).json({ error: 'Unauthorized' }); return
  }

  if (req.method !== 'GET') { res.status(405).end(); return }

  const limit = Math.min(Math.max(1, Number(req.query['limit'] ?? 50)), 200)
  // `before`: cursor for pagination — exclusive upper bound (ms timestamp).
  // Pass the `ts` of the oldest entry on the current page to fetch the next page.
  const beforeParam = req.query['before']
  const maxScore: string | number = beforeParam ? Number(beforeParam) - 1 : '+inf'

  // Build current UTC date keys for user HLL lookups
  const now = new Date()
  const todayStr = `${now.getUTCFullYear()}-${p(now.getUTCMonth() + 1)}-${p(now.getUTCDate())}`
  const monthStr = `${now.getUTCFullYear()}-${p(now.getUTCMonth() + 1)}`

  try {
    // Fetch counts + recent logs + total log count + unique user counts in parallel
    const [counts, logsRaw, logsTotal, userCounts] = await Promise.all([
      redis.hgetall(COUNTS_KEY),
      redis.zrevrangebyscore(LOGS_KEY, maxScore, '-inf', limit),
      redis.zcard(LOGS_KEY),
      redis.pipeline([
        ['PFCOUNT', 'ai:users:total'],
        ['PFCOUNT', `ai:users:month:${monthStr}`],
        ['PFCOUNT', `ai:users:day:${todayStr}`],
      ]),
    ])

    // Parse JSONL log entries — skip malformed ones
    const logs = logsRaw.map(raw => {
      try { return JSON.parse(raw) as Record<string, unknown> }
      catch { return null }
    }).filter(Boolean)

    res.status(200).json({
      counts: counts ?? {},
      users: {
        total: Number(userCounts[0] ?? 0),
        month: Number(userCounts[1] ?? 0),
        today: Number(userCounts[2] ?? 0),
      },
      logs,
      logsTotal,
    })
  } catch (err) {
    console.error('[ai-stats] Redis error:', err)
    res.status(500).json({ error: `Redis error: ${String(err)}` })
  }
}
