// ─── POST /api/xp/award ───────────────────────────────────────────────────
// Authenticates the caller and awards XP for a reported action.
//
// Body: { email: string; pin: string; action: 'report' | 'confirm' | 'deny' }
// Returns: { xp, level, delta } on success, or { capped: true } if daily cap reached.

import type { VercelRequest, VercelResponse } from '@vercel/node'
import { redis } from '../_lib/db/redis.js'
import { xpDb, XP_VALUES } from '../_lib/db/xpDb.js'
import { rateLimit } from '../_lib/utils/rateLimit.js'
import type { TesRadarUser } from '../auth/register.js'

const VALID_ACTIONS = new Set(Object.keys(XP_VALUES))

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')

  if (req.method === 'OPTIONS') { res.status(204).end(); return }
  if (req.method !== 'POST')   { res.status(405).end(); return }

  const body   = typeof req.body === 'string' ? JSON.parse(req.body) : req.body ?? {}
  const email  = String(body.email  ?? '').trim().toLowerCase()
  const pin    = String(body.pin    ?? '').trim()
  const action = String(body.action ?? '')

  if (!email || !pin || !VALID_ACTIONS.has(action)) {
    res.status(400).json({ error: 'Missing or invalid fields.' }); return
  }

  // Rate limit: 60 award calls per hour per IP
  const ip = (req.headers['x-forwarded-for'] as string | undefined)?.split(',')[0]?.trim() ?? 'unknown'
  let allowed = true
  try { allowed = await rateLimit(ip, 'xp:award', 60, 3600) } catch { /* Redis down — allow */ }
  if (!allowed) { res.status(429).json({ error: 'Too many requests.' }); return }

  // Verify credentials
  const user = await redis.get<TesRadarUser>(`user:${email}`).catch(() => null)
  if (!user || user.pin !== pin) {
    res.status(401).json({ error: 'Invalid credentials.' }); return
  }

  const result = await xpDb.award(email, action as keyof typeof XP_VALUES)
  if (!result) {
    res.status(200).json({ capped: true }); return
  }

  res.status(200).json(result)
}
