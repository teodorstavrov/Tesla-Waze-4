// ─── AI Query Logger ─────────────────────────────────────────────────────
//
// Fire-and-forget logging of every AI assistant interaction.
//
// Storage (Upstash Redis, free tier):
//   ai:logs   — SORTED SET scored by timestamp ms. Entries auto-expire after
//               90 days via ZREMRANGEBYSCORE on each write (O(log N + M)).
//   ai:counts — HASH with forever-incrementing counters.
//               Fields: total, day:YYYY-MM-DD, week:YYYY-Www, month:YYYY-MM,
//                       outcome:intent, outcome:qa, outcome:error
//
// Usage: void logAiQuery({ ts, q, a, outcome, intentType?, lang?, ip? })

import { redis } from '../db/redis.js'

export type AiOutcome = 'intent' | 'qa' | 'error'

export interface AiLogEntry {
  ts:          number       // Unix ms timestamp
  q:           string       // transcript / question text
  a?:          string       // AI answer (may be empty on error)
  outcome:     AiOutcome
  intentType?: string       // 'navigate' | 'action' (only for outcome='intent')
  lang?:       string       // app language code at the time of the query
  ip?:         string       // request IP (privacy: stored as last partial octet only)
  err?:        string       // error message (only for outcome='error')
}

const LOGS_KEY   = 'ai:logs'    // SORTED SET, score = timestamp ms
const COUNTS_KEY = 'ai:counts'  // HASH, permanent counters
const TTL_MS     = 90 * 24 * 60 * 60 * 1000   // 90 days

/**
 * Log one AI query. Non-blocking — call with void, errors are swallowed.
 * Does NOT add latency to the user-facing response.
 */
export function logAiQuery(entry: AiLogEntry): void {
  void _log(entry).catch(e => console.warn('[ai-log] Redis write failed:', e))
}

async function _log(entry: AiLogEntry): Promise<void> {
  const d = new Date(entry.ts)

  const dayKey   = `day:${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())}`
  const weekKey  = `week:${isoWeek(d)}`
  const monthKey = `month:${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}`

  // Trim fields to avoid large Redis payloads
  const member = JSON.stringify({
    ts:  entry.ts,
    q:   entry.q.slice(0, 300),
    a:   (entry.a ?? '').slice(0, 400),
    out: entry.outcome,
    it:  entry.intentType ?? null,
    ln:  entry.lang ?? null,
    ip:  anonIp(entry.ip),
    er:  (entry.err ?? '').slice(0, 200) || null,
  })

  await redis.pipeline([
    // Add to sorted set (score = ms timestamp for easy range queries)
    ['ZADD', LOGS_KEY,   entry.ts,           member],
    // Prune entries older than 90 days
    ['ZREMRANGEBYSCORE', LOGS_KEY, 0, entry.ts - TTL_MS],
    // Forever counters
    ['HINCRBY', COUNTS_KEY, 'total',                     1],
    ['HINCRBY', COUNTS_KEY, dayKey,                       1],
    ['HINCRBY', COUNTS_KEY, weekKey,                      1],
    ['HINCRBY', COUNTS_KEY, monthKey,                     1],
    ['HINCRBY', COUNTS_KEY, `outcome:${entry.outcome}`,   1],
  ])
}

/** Zero-pad a number to 2 digits */
function p(n: number): string { return String(n).padStart(2, '0') }

/** ISO 8601 week key, e.g. "2026-W36" */
function isoWeek(d: Date): string {
  const dt  = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()))
  const day = dt.getUTCDay() || 7  // Mon=1 … Sun=7
  dt.setUTCDate(dt.getUTCDate() + 4 - day)
  const jan1 = new Date(Date.UTC(dt.getUTCFullYear(), 0, 1))
  const wk   = Math.ceil((((dt.getTime() - jan1.getTime()) / 86400000) + 1) / 7)
  return `${dt.getUTCFullYear()}-W${String(wk).padStart(2, '0')}`
}

/** Store only the first two octets of IPv4 for basic privacy (e.g. "192.168.*") */
function anonIp(ip: string | undefined): string | null {
  if (!ip) return null
  const parts = ip.split('.')
  if (parts.length === 4) return `${parts[0]}.${parts[1]}.*`
  return ip.split(':')[0] ?? null  // IPv6: keep first group only
}
