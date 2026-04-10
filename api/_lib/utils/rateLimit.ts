// ─── Rate limiter ───────────────────────────────────────────────────────
//
// Redis-backed atomic sliding window counter — all Vercel instances share state.
// Falls back to in-memory if Redis is not configured (dev / cold-start).
//
// Redis path uses INCR + EXPIRE (atomic) instead of GET + SET.
// This closes a race window where two concurrent requests could both
// pass the limit check before either incremented the counter.
//
// Usage:
//   const ok = await rateLimit(ip, 'events', 5, 600)  // 5 req per 10 min
//   if (!ok) res.status(429).json({ error: 'Too many requests' })

import { redis, isRedisConfigured } from '../db/redis.js'

// In-memory fallback (single instance only — good enough for dev)
const _mem = new Map<string, { count: number; resetAt: number }>()

export async function rateLimit(
  ip: string,
  action: string,
  limit: number,
  windowSecs: number,
): Promise<boolean> {
  const key = `teslaradar:rl:${action}:${ip}`

  if (isRedisConfigured()) {
    // Pipeline INCR + EXPIRE in one HTTP request instead of two.
    // EXPIRE on every call is harmless (resets TTL to same value) and lets us
    // avoid the extra round-trip that the count===1 branch previously required.
    const [count] = await redis.pipeline([
      ['INCR', key],
      ['EXPIRE', key, windowSecs],
    ])
    return (count as number) <= limit
  }

  // In-memory fallback
  const now = Date.now()
  const entry = _mem.get(key)
  if (!entry || entry.resetAt < now) {
    _mem.set(key, { count: 1, resetAt: now + windowSecs * 1000 })
    return true
  }
  if (entry.count >= limit) return false
  entry.count++
  return true
}
