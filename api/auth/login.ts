// ─── POST /api/auth/login ─────────────────────────────────────────────────────
// Public endpoint. Verifies email + PIN against Redis.
// Returns 200 { ok: true, name } on success, 401 on wrong credentials.

import type { VercelRequest, VercelResponse } from '@vercel/node'
import { redis } from '../_lib/db/redis.js'
import type { TesRadarUser } from './register.js'

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')

  if (req.method === 'OPTIONS') { res.status(204).end(); return }
  if (req.method !== 'POST')    { res.status(405).end(); return }

  const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body ?? {}

  const email: string = String(body.email ?? '').trim().toLowerCase()
  const pin:   string = String(body.pin   ?? '').trim()

  if (!email || !pin) {
    res.status(400).json({ error: 'Please enter your email and PIN.' }); return
  }

  const user = await redis.get<TesRadarUser>(`user:${email}`)

  if (!user || user.pin !== pin) {
    res.status(401).json({ error: 'Invalid email or PIN.' }); return
  }

  res.status(200).json({ ok: true, name: user.name })
}
