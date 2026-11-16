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
  let sentRaw: unknown[] = []
  try {
    sentRaw = await redis.pipeline([['SMEMBERS', UNSUB_SET], ...users.map((u) => ['HGETALL', dripKey(u.email)])])
  } catch {
    sentRaw = []
  }
  const unsubList = sentRaw.shift()
  const unsub = new Set(Array.isArray(unsubList) ? unsubList.map(String) : [])

  const withDrip = users.map((u, i) => {
    const sent: Record<string, string> = {}
    const r = sentRaw[i]
    if (Array.isArray(r)) {
      for (let j = 0; j + 1 < r.length; j += 2) sent[String(r[j])] = String(r[j + 1] ?? '')
    } else if (r && typeof r === 'object') {
      Object.assign(sent, r as Record<string, string>)
    }
    return { ...u, drip: { sent, planned: plannedDates(u.createdAt, u.country, u.email), unsubscribed: unsub.has(u.email.toLowerCase()) } }
  })

  res.status(200).json({ users: withDrip })
}
