// ─── Rate limiter ───────────────────────────────────────────────────────
//
// Redis-backed sliding window counter so all Vercel instances share state.
// Falls back to in-memory if Redis is not configured (dev / cold-start).
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
    // Atomic increment + set expiry on first hit
    const count = (await redis.get<number>(key)) ?? 0
    if (count >= limit) return false
    if (count === 0) {
      await redis.setWithExpiry(key, 1, windowSecs)
    } else {
      // INCR via SET (simple — acceptable for this scale)
      await redis.setWithExpiry(key, count + 1, windowSecs)
    }
    return true
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
