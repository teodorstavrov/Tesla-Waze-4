// ─── GET /api/admin/ai-stats ──────────────────────────────────────────────
//
// Returns AI voice assistant usage statistics for the admin panel.
//
// Query params:
//   limit  — number of recent log entries to return (default 50, max 200)
//
// Response:
//   {
//     counts: {
//       total: string,                  // all-time total
//       "day:2026-09-05": string,       // per-day (all days stored)
//       "week:2026-W36": string,        // per ISO week
//       "month:2026-09": string,        // per month
//       "outcome:intent": string,
//       "outcome:qa": string,
//       "outcome:error": string,
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

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  // Auth
  const secret = process.env['ADMIN_SECRET']
  const auth   = req.headers['authorization']
  if (!secret || auth !== `Bearer ${secret}`) {
    res.status(401).json({ error: 'Unauthorized' }); return
  }

  if (req.method !== 'GET') { res.status(405).end(); return }

  const limit = Math.min(Math.max(1, Number(req.query['limit'] ?? 50)), 200)

  try {
    // Fetch counts + recent logs + total log count in parallel
    const [counts, logsRaw, logsTotal] = await Promise.all([
      redis.hgetall(COUNTS_KEY),
      redis.zrevrangebyscore(LOGS_KEY, '+inf', '-inf', limit),
      redis.zcard(LOGS_KEY),
    ])

    // Parse JSONL log entries — skip malformed ones
    const logs = logsRaw.map(raw => {
      try { return JSON.parse(raw) as Record<string, unknown> }
      catch { return null }
    }).filter(Boolean)

    res.status(200).json({
      counts:    counts ?? {},
      logs,
      logsTotal,
    })
  } catch (err) {
    console.error('[ai-stats] Redis error:', err)
    res.status(500).json({ error: `Redis error: ${String(err)}` })
  }
}
