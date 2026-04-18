// ─── POST /api/tesla/wake ─────────────────────────────────────────────────
// Wakes a sleeping Tesla vehicle and waits for it to come online (≤ 45 s).
//
// Only called when user explicitly taps the battery widget — never automatic.
//
// RESPONSE:
//   { woke: true }                — vehicle is now online
//   { woke: false, timeout: true } — did not come online within 45 s
//
// RATE LIMIT: 1 wake attempt per 90 seconds per session (Redis).

import type { VercelRequest, VercelResponse } from '@vercel/node'
import { getSession } from '../_lib/tesla/session.js'
import { wakeVehicle, getVehicleOnlineState } from '../_lib/tesla/client.js'
import { redis, isRedisConfigured } from '../_lib/db/redis.js'
import { parseCookie } from '../_lib/utils/cookies.js'
import { captureApiError } from '../_lib/utils/sentryApi.js'

const SESSION_COOKIE  = 'tesradar_sess'
const WAKE_RL_S       = 90          // cooldown between wake attempts
const POLL_INTERVAL_MS = 3_000      // check state every 3 s
const TIMEOUT_MS      = 45_000      // give up after 45 s (safe inside 60 s Vercel limit)

function _sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' })
    return
  }

  res.setHeader('Cache-Control', 'no-store')

  if (!isRedisConfigured()) {
    res.status(503).json({ error: 'Redis not configured' })
    return
  }

  const sessionId = parseCookie(req.headers['cookie'] ?? '', SESSION_COOKIE)
  if (!sessionId) {
    res.status(401).json({ error: 'Not connected' })
    return
  }

  const sess = await getSession(sessionId)
  if (!sess?.vehicleId) {
    res.status(401).json({ error: 'No vehicle associated' })
    return
  }

  // Rate limit — prevent hammering wake_up
  const rlKey    = `tesla:wake_rl:${sessionId}`
  const lastWake = await redis.get<number>(rlKey)
  if (lastWake && Date.now() - lastWake < WAKE_RL_S * 1000) {
    const retryAfterMs = WAKE_RL_S * 1000 - (Date.now() - lastWake)
    res.status(429).json({ error: 'Wake too frequent', retryAfterMs })
    return
  }
  await redis.setWithExpiry(rlKey, Date.now(), WAKE_RL_S + 5)

  try {
    // Send wake command (non-blocking — Tesla processes it asynchronously)
    await wakeVehicle(sessionId, sess.vehicleId)

    // Poll vehicle state until online or timeout
    const deadline = Date.now() + TIMEOUT_MS
    while (Date.now() < deadline) {
      await _sleep(POLL_INTERVAL_MS)
      const state = await getVehicleOnlineState(sessionId, sess.vehicleId)
      if (state === 'online') {
        res.status(200).json({ woke: true })
        return
      }
    }

    // Timed out — vehicle did not come online within 45 s
    res.status(200).json({ woke: false, timeout: true })
  } catch (err) {
    await captureApiError(err, 'tesla/wake')
    res.status(502).json({ error: 'Wake failed' })
  }
}
