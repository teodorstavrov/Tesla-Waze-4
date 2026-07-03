// ─── GET /api/sounds/download?token=<uuid> ────────────────────────────
//
// One-time download endpoint. Validates the token, deletes it from Redis
// (so it can't be reused), then streams the WAV file as an attachment
// named "LockChime.wav" (the filename Tesla expects).
//
// WAV files are bundled with this function via vercel.json includeFiles.

import type { VercelRequest, VercelResponse } from '@vercel/node'
import { readFileSync } from 'fs'
import { join } from 'path'
import { redis, isRedisConfigured } from '../_lib/db/redis.js'
import { VALID_SOUNDS } from './request-link.js'

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  if (req.method !== 'GET') { res.status(405).end(); return }

  const token = String(req.query['token'] ?? '').trim()
  if (!token) { res.status(400).send('Missing token'); return }

  if (!isRedisConfigured()) { res.status(503).send('Service unavailable'); return }

  const data = await redis.get<{ melodyId: string; email: string }>(`sounds:token:${token}`)
  if (!data) {
    res.status(410).send('This link has already been used or has expired.')
    return
  }

  // Delete token immediately — one-time use
  await redis.del(`sounds:token:${token}`)

  const { melodyId } = data
  if (!VALID_SOUNDS[melodyId]) { res.status(400).send('Invalid melody'); return }

  const filename = `${melodyId}.wav`
  const filepath = join(process.cwd(), 'public', 'sounds', filename)

  let file: Buffer
  try {
    file = readFileSync(filepath)
  } catch {
    res.status(500).send('File not found — please contact support')
    return
  }

  res.setHeader('Content-Type', 'audio/wav')
  res.setHeader('Content-Disposition', 'attachment; filename="LockChime.wav"')
  res.setHeader('Content-Length', file.length)
  res.setHeader('Cache-Control', 'no-store')
  res.status(200).end(file)
}
