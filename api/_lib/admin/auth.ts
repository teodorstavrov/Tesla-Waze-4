// ─── Admin auth helper ──────────────────────────────────────────────────
// Checks Authorization: Bearer <ADMIN_SECRET> header.

import type { VercelRequest, VercelResponse } from '@vercel/node'

export function isAuthorized(req: VercelRequest): boolean {
  const secret = process.env['ADMIN_SECRET']
  if (!secret) return false
  const header = req.headers['authorization'] ?? ''
  return header === `Bearer ${secret}`
}

export function unauthorized(res: VercelResponse): void {
  res.status(401).json({ error: 'Unauthorized' })
}
