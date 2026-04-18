// ─── GET /api/tesla/callback ─────────────────────────────────────────────
// Handles the redirect back from Tesla's authorization server after the user
// approves (or denies) the OAuth consent screen.
//
// Flow:
//   1. Validate the state parameter (CSRF protection) — consumed from Redis
//   2. Exchange the authorization code for access + refresh tokens (PKCE)
//   3. Fetch the user's vehicle list to associate a vehicleId with the session
//   4. Persist tokens + vehicle info in Redis under the session ID
//   5. Redirect browser back to the app with a success/error signal
//
// SECURITY:
//   - Tokens are NEVER returned to the browser — only stored in Redis
//   - The browser only receives the session cookie (set in /connect) and a
//     ?tesla_connected=1 param to trigger the frontend status re-check

import type { VercelRequest, VercelResponse } from '@vercel/node'
import { exchangeCodeForTokens } from '../_lib/tesla/auth.js'
import { consumePkceState, saveSession } from '../_lib/tesla/session.js'
import { getVehicles } from '../_lib/tesla/client.js'
import { isRedisConfigured } from '../_lib/db/redis.js'
import { parseCookie } from '../_lib/utils/cookies.js'
import { captureApiError } from '../_lib/utils/sentryApi.js'

const SESSION_COOKIE = 'tesradar_sess'
const APP_URL        = process.env['APP_URL'] ?? 'https://tesradar.tech'

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  if (!isRedisConfigured()) {
    res.redirect(302, `${APP_URL}?tesla_error=server_error`)
    return
  }

  const error = req.query['error']
  const code  = String(req.query['code']  ?? '')
  const state = String(req.query['state'] ?? '')

  // User clicked "Deny" on Tesla's consent screen
  if (error) {
    res.redirect(302, `${APP_URL}?tesla_error=denied`)
    return
  }

  if (!code || !state) {
    res.redirect(302, `${APP_URL}?tesla_error=invalid_callback`)
    return
  }

  // Session cookie must exist — it was set in /connect before redirecting to Tesla
  const sessionId = parseCookie(req.headers['cookie'] ?? '', SESSION_COOKIE)
  if (!sessionId) {
    res.redirect(302, `${APP_URL}?tesla_error=no_session`)
    return
  }

  // Validate state & consume PKCE code_verifier (one-time use)
  const codeVerifier = await consumePkceState(state)
  if (!codeVerifier) {
    // state unknown, expired, or already consumed — possible CSRF or timeout
    res.redirect(302, `${APP_URL}?tesla_error=invalid_state`)
    return
  }

  const clientId     = process.env['TESLA_CLIENT_ID']!
  const clientSecret = process.env['TESLA_CLIENT_SECRET']!
  const redirectUri  = process.env['TESLA_REDIRECT_URI']!

  try {
    // Exchange auth code for tokens (PKCE verifier proves we initiated this flow)
    const tokens = await exchangeCodeForTokens(code, codeVerifier, clientId, clientSecret, redirectUri)

    // Save tokens first so getVehicles can use them
    await saveSession(sessionId, tokens, null, null)

    // Fetch vehicle list — associate the first vehicle with this session
    let vehicleId:   string | null = null
    let vehicleName: string | null = null
    try {
      const vehicles = await getVehicles(sessionId)
      if (vehicles.length > 0) {
        const v     = vehicles[0]!
        vehicleId   = String(v.id)
        vehicleName = v.display_name || v.vin
      }
    } catch {
      // Non-fatal: connect succeeds even if vehicle list fetch fails
    }

    // Re-save with vehicle info
    await saveSession(sessionId, tokens, vehicleId, vehicleName)

    // Redirect to app — frontend will call /api/tesla/status to confirm
    res.redirect(302, `${APP_URL}?tesla_connected=1`)
  } catch (err) {
    await captureApiError(err, 'tesla/callback')
    res.redirect(302, `${APP_URL}?tesla_error=token_exchange_failed`)
  }
}
