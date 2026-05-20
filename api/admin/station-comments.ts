// ─── GET /api/admin/station-comments ─────────────────────────────────
// Returns all stored station comments. Admin auth required.

import type { VercelRequest, VercelResponse } from '@vercel/node'
import { commentDb } from '../_lib/db/commentDb.js'
import { captureApiError } from '../_lib/utils/sentryApi.js'

const ADMIN_SECRET = process.env['ADMIN_SECRET'] ?? ''

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  const auth = (req.headers['authorization'] ?? '').replace(/^Bearer\s+/i, '')
  if (!ADMIN_SECRET || auth !== ADMIN_SECRET) {
    res.status(401).json({ error: 'Unauthorized' }); return
  }

  if (req.method !== 'GET') { res.status(405).json({ error: 'Method not allowed' }); return }

  try {
    const comments = await commentDb.getAll()
    res.status(200).json({ comments })
  } catch (err) {
    await captureApiError(err, 'admin/station-comments')
    res.status(500).json({ error: 'Internal server error' })
  }
}
