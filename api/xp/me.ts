// ─── GET /api/xp/me ───────────────────────────────────────────────────────
// Returns current XP, level, and rank for the authenticated user.
// Also awards the daily bonus if not already given today.
//
// Query: ?email=X&pin=Y
// Returns: { xp, level, rank, dailyBonus }

import type { VercelRequest, VercelResponse } from '@vercel/node'
import { redis } from '../_lib/db/redis.js'
import { xpDb } from '../_lib/db/xpDb.js'
import type { TesRadarUser } from '../auth/register.js'

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')

  if (req.method === 'OPTIONS') { res.status(204).end(); return }
  if (req.method !== 'GET')    { res.status(405).end(); return }

  const email = String(req.query['email'] ?? '').trim().toLowerCase()
  const pin   = String(req.query['pin']   ?? '').trim()

  if (!email || !pin) { res.status(400).json({ error: 'Missing email or pin.' }); return }

  const user = await redis.get<TesRadarUser>(`user:${email}`).catch(() => null)
  if (!user || user.pin !== pin) {
    res.status(401).json({ error: 'Invalid credentials.' }); return
  }

  const [xpData, dailyBonus] = await Promise.all([
    xpDb.getMyXP(email),
    xpDb.awardDailyBonus(email),
  ])

  res.setHeader('Cache-Control', 'no-store')
  res.status(200).json({ ...xpData, dailyBonus })
}
