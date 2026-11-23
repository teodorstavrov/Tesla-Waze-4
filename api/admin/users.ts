// ─── GET /api/admin/users ──────────────────────────────────────────────
// Returns all registered users from the Redis `users` hash.
// Protected: Authorization: Bearer ADMIN_SECRET

import type { VercelRequest, VercelResponse } from '@vercel/node'
import { isAuthorized, unauthorized } from '../_lib/admin/auth.js'
import { redis, isRedisConfigured } from '../_lib/db/redis.js'
import { UNSUB_SET, dripKey, plannedDates } from '../_lib/drip/schedule.js'

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Authorization')

  if (req.method === 'OPTIONS') { res.status(204).end(); return }
  if (!isAuthorized(req))       { unauthorized(res); return }
  if (req.method !== 'GET')     { res.status(405).json({ error: 'Method not allowed' }); return }

  if (!isRedisConfigured()) {
    res.status(503).json({ error: 'Redis not configured' })
    return
  }

  const raw = await redis.hgetall('users')
  if (!raw) {
    res.status(200).json({ users: [] })
    return
  }

  const users = Object.entries(raw).map(([email, json]) => {
    try {
      const data = JSON.parse(json) as { name?: string; teslaModel?: string; country?: string; createdAt?: string }
      return {
        email,
        name:       String(data.name       ?? ''),
        teslaModel: String(data.teslaModel ?? ''),
        country:    String(data.country    ?? ''),
        createdAt:  String(data.createdAt  ?? ''),
      }
    } catch {
      return { email, name: '', teslaModel: '', country: '', createdAt: '' }
    }
  })

  users.sort((a, b) => (b.createdAt > a.createdAt ? 1 : -1))

  // Re-engage course: what each user has received (drip:{email}) and what is planned.
  // Also fetch mode_stats hash in the same pipeline.
  let sentRaw: unknown[] = []
  let modeRaw: unknown   = null
  try {
    const pipeline: [string, ...string[]][] = [
      ['SMEMBERS', UNSUB_SET],
      ...users.map((u): [string, ...string[]] => ['HGETALL', dripKey(u.email)]),
      ['HGETALL', 'mode_stats'],
    ]
    const results = await redis.pipeline(pipeline)
    modeRaw = results.pop() ?? null
    sentRaw = results
  } catch {
    sentRaw = []
  }
  const unsubList = sentRaw.shift()
  const unsub = new Set(Array.isArray(unsubList) ? unsubList.map(String) : [])

  // Parse mode_stats: either an object { email: jsonString } or already parsed
  const modeStats: Record<string, { gta: number; standard: number; last: string; lastSeen: number }> = {}
  if (modeRaw && typeof modeRaw === 'object' && !Array.isArray(modeRaw)) {
    for (const [k, v] of Object.entries(modeRaw as Record<string, unknown>)) {
      try {
        const ms = typeof v === 'string' ? JSON.parse(v) : v
        if (ms && typeof ms === 'object') modeStats[k] = ms as typeof modeStats[string]
      } catch { /* skip */ }
    }
  }

  const withDrip = users.map((u, i) => {
    const sent: Record<string, string> = {}
    const r = sentRaw[i]
    if (Array.isArray(r)) {
      for (let j = 0; j + 1 < r.length; j += 2) sent[String(r[j])] = String(r[j + 1] ?? '')
    } else if (r && typeof r === 'object') {
      Object.assign(sent, r as Record<string, string>)
    }
    return {
      ...u,
      drip:      { sent, planned: plannedDates(u.createdAt, u.country, u.email), unsubscribed: unsub.has(u.email.toLowerCase()) },
      modeStats: modeStats[u.email] ?? null,
    }
  })

  res.status(200).json({ users: withDrip })
}
