// ─── GET /api/health ───────────────────────────────────────────────────
// Lightweight liveness + dependency check.
// Returns 200 if all systems nominal, 503 if Redis is unreachable.

import type { VercelRequest, VercelResponse } from '@vercel/node'
import { redis, isRedisConfigured } from './_lib/db/redis.js'

export default async function handler(_req: VercelRequest, res: VercelResponse): Promise<void> {
  const start = Date.now()

  let redisStatus: 'ok' | 'unconfigured' | 'error' = 'unconfigured'
  let redisPingMs: number | null = null
  let redisError: string | undefined

  if (isRedisConfigured()) {
    try {
      const t0 = Date.now()
      await redis.get('health:ping')
      redisPingMs = Date.now() - t0
      redisStatus = 'ok'
    } catch (err) {
      redisStatus = 'error'
      redisError = (err as Error).message
    }
  }

  const healthy = redisStatus !== 'error'

  res.status(healthy ? 200 : 503).json({
    status:     healthy ? 'ok' : 'degraded',
    redis:      redisStatus,
    redisPingMs,
    ...(redisError ? { redisError } : {}),
    uptimeS:    Math.floor(process.uptime()),
    totalMs:    Date.now() - start,
  })
}
