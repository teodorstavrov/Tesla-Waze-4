// ─── GET /api/xp/leaderboard ─────────────────────────────────────────────
// Returns the top 50 users by XP.
// Cached 5 minutes at the CDN edge — cheap, 1 Redis call per cache miss.
//
// No auth required — public ranking.
// Returns: { entries: [{ rank, name, xp, level }], cachedAt }

import type { VercelRequest, VercelResponse } from '@vercel/node'
import { xpDb } from '../_lib/db/xpDb.js'

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')

  if (req.method === 'OPTIONS') { res.status(204).end(); return }
  if (req.method !== 'GET')    { res.status(405).end(); return }

  const entries = await xpDb.getLeaderboard(50)

  // 5-minute CDN cache — Vercel edge will serve this without hitting Redis
  res.setHeader('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=60')
  res.status(200).json({ entries, cachedAt: Date.now() })
}
