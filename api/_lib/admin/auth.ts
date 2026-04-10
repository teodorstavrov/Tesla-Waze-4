// ─── Admin auth helper ──────────────────────────────────────────────────
// Checks Authorization: Bearer <ADMIN_SECRET> header.
//
// Uses SHA-256 + timingSafeEqual so response time does not reveal
// how many bytes of the secret are correct (timing oracle prevention).

import { createHash, timingSafeEqual } from 'crypto'
import type { VercelRequest, VercelResponse } from '@vercel/node'

function sha256(value: string): Buffer {
  return createHash('sha256').update(value).digest()
}

export function isAuthorized(req: VercelRequest): boolean {
  const secret = process.env['ADMIN_SECRET']
  if (!secret) return false

  const header = String(req.headers['authorization'] ?? '')
  const expected = `Bearer ${secret}`

  // Hash both sides so timingSafeEqual always compares equal-length buffers
  // and response time reveals nothing about the secret's value.
  return timingSafeEqual(sha256(header), sha256(expected))
}

export function unauthorized(res: VercelResponse): void {
  res.status(401).json({ error: 'Unauthorized' })
}
