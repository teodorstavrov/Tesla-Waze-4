// ─── POST /api/tesla/disconnect ──────────────────────────────────────────
// Revokes Tesla tokens (best-effort) and deletes the session from Redis.
// Clears the session cookie from the browser.

import type { VercelRequest, VercelResponse } from '@vercel/node'
import { revokeToken } from '../_lib/tesla/auth.js'
import { getSession, deleteSession } from '../_lib/tesla/session.js'
import { clearCachedState } from '../_lib/tesla/vehicleCache.js'
import { parseCookie, clearSessionCookie } from '../_lib/utils/cookies.js'

const SESSION_COOKIE = 'tesradar_sess'

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' })
    return
  }

  const sessionId = parseCookie(req.headers['cookie'] ?? '', SESSION_COOKIE)

  if (sessionId) {
    const sess = await getSession(sessionId)
    if (sess) {
      // Best-effort: revoke Tesla refresh token so the app loses access
      const clientId     = process.env['TESLA_CLIENT_ID']!
      const clientSecret = process.env['TESLA_CLIENT_SECRET']!
      await revokeToken(sess.refreshToken, clientId, clientSecret)
      await deleteSession(sessionId)
      await clearCachedState(sessionId)
    }
  }

  // Clear session cookie from browser
  res.setHeader('Set-Cookie', clearSessionCookie(SESSION_COOKIE))
  res.status(200).json({ disconnected: true })
}
