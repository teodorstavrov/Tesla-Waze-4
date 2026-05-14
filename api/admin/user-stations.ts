// ─── GET/POST /api/admin/user-stations ─────────────────────────────────
//
// Admin-only endpoint for managing user-submitted stations.
//
//   GET  → list all user-submitted stations (pending + approved)
//   POST { id, action: 'approve' | 'reject' } → approve or delete

import type { VercelRequest, VercelResponse } from '@vercel/node'
import { isAuthorized, unauthorized } from '../_lib/admin/auth.js'
import { userStationDb } from '../_lib/db/userStationDb.js'
import { captureApiError } from '../_lib/utils/sentryApi.js'

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization')

  if (req.method === 'OPTIONS') { res.status(204).end(); return }

  if (!isAuthorized(req)) { unauthorized(res); return }

  try {
    if (req.method === 'GET') {
      const stations = await userStationDb.getAll()
      res.status(200).json({ stations, total: stations.length })
      return
    }

    if (req.method === 'POST') {
      const body   = typeof req.body === 'string' ? JSON.parse(req.body) : req.body
      const id     = String(body?.id ?? '').trim()
      const action = String(body?.action ?? '').trim()

      if (!id) { res.status(400).json({ error: 'Missing id' }); return }

      if (action === 'approve') {
        const ok = await userStationDb.approve(id)
        res.status(ok ? 200 : 404).json({ ok, id, action })
        return
      }

      if (action === 'reject') {
        const ok = await userStationDb.remove(id)
        res.status(ok ? 200 : 404).json({ ok, id, action })
        return
      }

      res.status(400).json({ error: 'action must be "approve" or "reject"' })
      return
    }

    res.status(405).json({ error: 'Method not allowed' })
  } catch (err) {
    await captureApiError(err, 'admin/user-stations')
    res.status(500).json({ error: 'Internal server error' })
  }
}
