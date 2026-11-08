// ─── GET /api/admin/users ──────────────────────────────────────────────
// Returns all registered users from the Redis `users` hash.
// Protected: Authorization: Bearer ADMIN_SECRET

import type { VercelRequest, VercelResponse } from '@vercel/node'
import { isAuthorized, unauthorized } from '../_lib/admin/auth.js'
import { redis, isRedisConfigured } from '../_lib/db/redis.js'

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
        name:       data.name       ?? '',
        teslaModel: data.teslaModel ?? '',
        country:    data.country    ?? '',
        createdAt:  data.createdAt  ?? '',
      }
    } catch {
      return { email, name: '', teslaModel: '', country: '', createdAt: '' }
    }
  })

  users.sort((a, b) => (b.createdAt > a.createdAt ? 1 : -1))

  res.status(200).json({ users })
}
