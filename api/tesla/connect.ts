// ─── GET /api/tesla/connect ──────────────────────────────────────────────
// Initiates the Tesla OAuth 2.0 + PKCE authorization flow.
//
// Flow:
//   1. Ensure the browser has a session cookie (creates one if absent)
//   2. Generate PKCE code_verifier + code_challenge
//   3. Generate state (CSRF token) and store {state → code_verifier} in Redis
//   4. Redirect browser to Tesla's authorization page
//
// The browser is redirected away from the app. After the user authorizes,
// Tesla sends the browser back to /api/tesla/callback with code + state.

import type { VercelRequest, VercelResponse } from '@vercel/node'
import { randomUUID } from 'crypto'
import {
  generateCodeVerifier,
  generateCodeChallenge,
  generateState,
  buildAuthorizationUrl,
} from '../_lib/tesla/auth.js'
import { savePkceState } from '../_lib/tesla/session.js'
import { isRedisConfigured } from '../_lib/db/redis.js'
import { parseCookie, buildSessionCookie } from '../_lib/utils/cookies.js'
import { TESLA_API_BASE } from '../_lib/tesla/client.js'

const SESSION_COOKIE  = 'tesradar_sess'
const SESSION_MAX_AGE = 90 * 24 * 60 * 60   // 90 days in seconds

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  const clientId    = process.env['TESLA_CLIENT_ID']
  const redirectUri = process.env['TESLA_REDIRECT_URI']

  if (!clientId || !redirectUri) {
    res.status(503).json({
      error:  'Tesla OAuth not configured',
      hint:   'Set TESLA_CLIENT_ID and TESLA_REDIRECT_URI in Vercel environment variables',
    })
    return
  }

  if (!isRedisConfigured()) {
    res.status(503).json({ error: 'Redis not configured' })
    return
  }

  // Ensure a session cookie exists — create one if this is a new visitor
  const existingId = parseCookie(req.headers['cookie'] ?? '', SESSION_COOKIE)
  const sessionId  = existingId ?? randomUUID()

  // Generate PKCE values
  const codeVerifier  = generateCodeVerifier()
  const codeChallenge = generateCodeChallenge(codeVerifier)
  const state         = generateState()

  // Store state → code_verifier in Redis (10 min — enough to complete OAuth)
  await savePkceState(state, codeVerifier)

  // Set session cookie (HttpOnly prevents JS access; Secure ensures HTTPS only)
  res.setHeader('Set-Cookie', buildSessionCookie(SESSION_COOKIE, sessionId, SESSION_MAX_AGE))

  // Redirect browser to Tesla's authorization page
  res.redirect(302, buildAuthorizationUrl(clientId, redirectUri, state, codeChallenge, TESLA_API_BASE))
}
