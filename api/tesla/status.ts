// ─── GET /api/tesla/status ────────────────────────────────────────────────
// Returns the Tesla connection state for the current browser session.
//
// Called by the frontend:
//   - on app start (to restore connection state after page reload)
//   - after OAuth redirect returns with ?tesla_connected=1
//   - after disconnect
//
// SECURITY: never returns Tesla tokens — only safe metadata.
// Response is no-store cached to always reflect current state.

import type { VercelRequest, VercelResponse } from '@vercel/node'
import { getSession } from '../_lib/tesla/session.js'
import { isRedisConfigured } from '../_lib/db/redis.js'
import { parseCookie } from '../_lib/utils/cookies.js'

const SESSION_COOKIE = 'tesradar_sess'

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  res.setHeader('Cache-Control', 'no-store')

  if (!isRedisConfigured()) {
    res.status(200).json({ connected: false, reason: 'redis_not_configured' })
    return
  }

  const sessionId = parseCookie(req.headers['cookie'] ?? '', SESSION_COOKIE)
  if (!sessionId) {
    res.status(200).json({ connected: false })
    return
  }

  const sess = await getSession(sessionId)
  if (!sess) {
    res.status(200).json({ connected: false })
    return
  }

  // Return only safe metadata — no tokens
  res.status(200).json({
    connected:   true,
    vehicleId:   sess.vehicleId,
    vehicleName: sess.vehicleName,
    connectedAt: sess.createdAt,
  })
}
