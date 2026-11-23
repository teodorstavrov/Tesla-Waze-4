// ─── POST /api/track-mode ──────────────────────────────────────────────────
// Records which mode (standard / gta) the authenticated user activated.
// Stored in Redis hash `mode_stats`: field=email, value=JSON{gta,standard,last,lastSeen}
//
// Body: { email, pin, mode: 'standard' | 'gta' }

import type { VercelRequest, VercelResponse } from '@vercel/node'
import { redis, isRedisConfigured } from './_lib/db/redis.js'
import type { TesRadarUser } from './auth/register.js'

interface ModeStats { gta: number; standard: number; last: 'gta' | 'standard'; lastSeen: number }

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')

  if (req.method === 'OPTIONS') { res.status(204).end(); return }
  if (req.method !== 'POST')   { res.status(405).end(); return }
  if (!isRedisConfigured())    { res.status(200).json({ ok: true }); return } // silent no-op

  const body  = typeof req.body === 'string' ? JSON.parse(req.body) : req.body ?? {}
  const email = String(body.email ?? '').trim().toLowerCase()
  const pin   = String(body.pin   ?? '').trim()
  const mode  = String(body.mode  ?? '')

  if (!email || !pin || (mode !== 'gta' && mode !== 'standard')) {
    res.status(400).json({ error: 'Invalid params' }); return
  }

  const user = await redis.get<TesRadarUser>(`user:${email}`).catch(() => null)
  if (!user || user.pin !== pin) {
    res.status(401).json({ error: 'Unauthorized' }); return
  }

  const raw = await redis.hget('mode_stats', email).catch(() => null)
  let stats: ModeStats = { gta: 0, standard: 0, last: mode as 'gta' | 'standard', lastSeen: 0 }
  if (raw) {
    try {
      const parsed = typeof raw === 'string' ? JSON.parse(raw) as ModeStats : raw as ModeStats
      stats = { ...stats, ...parsed }
    } catch { /* use defaults */ }
  }

  stats[mode as 'gta' | 'standard'] = (stats[mode as 'gta' | 'standard'] || 0) + 1
  stats.last    = mode as 'gta' | 'standard'
  stats.lastSeen = Date.now()

  await redis.hset('mode_stats', { [email]: JSON.stringify(stats) }).catch(() => null)
  res.status(200).json({ ok: true })
}
