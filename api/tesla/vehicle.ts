// ─── GET /api/tesla/vehicle ───────────────────────────────────────────────
// Proxy: fetches live vehicle data from Tesla Fleet API and returns it
// as normalized VehicleState. Called by the frontend polling loop (Phase 2).
//
// RATE LIMITING:
//   Tesla recommends no more than 1 vehicle_data request per minute.
//   We enforce a 30-second per-session cooldown in Redis.
//   If a poll comes in too early, 429 is returned with retryAfterMs.
//
// SLEEPING VEHICLES:
//   If the vehicle is asleep, Tesla returns HTTP 408.
//   We return { vehicle: null, sleeping: true } so the frontend can
//   backoff and show a "Vehicle asleep" status without crashing.

import type { VercelRequest, VercelResponse } from '@vercel/node'
import { getSession } from '../_lib/tesla/session.js'
import { getVehicleData } from '../_lib/tesla/client.js'
import { normalizeVehicleData } from '../_lib/tesla/normalize.js'
import { redis, isRedisConfigured } from '../_lib/db/redis.js'
import { parseCookie } from '../_lib/utils/cookies.js'
import { captureApiError } from '../_lib/utils/sentryApi.js'
import type { TeslaVehicleDataPayload } from '../_lib/tesla/normalize.js'

const SESSION_COOKIE  = 'tesradar_sess'
const POLL_COOLDOWN_S = 30    // minimum seconds between polls per session

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  res.setHeader('Cache-Control', 'no-store')

  if (!isRedisConfigured()) {
    res.status(503).json({ error: 'Redis not configured' })
    return
  }

  const sessionId = parseCookie(req.headers['cookie'] ?? '', SESSION_COOKIE)
  if (!sessionId) {
    res.status(401).json({ error: 'Not connected — no session cookie' })
    return
  }

  const sess = await getSession(sessionId)
  if (!sess?.vehicleId) {
    res.status(401).json({ error: 'No Tesla vehicle associated with this session' })
    return
  }

  // Per-session rate limit: prevent hammering Tesla's API
  const rlKey   = `tesla:poll_rl:${sessionId}`
  const lastPoll = await redis.get<number>(rlKey)
  if (lastPoll && Date.now() - lastPoll < POLL_COOLDOWN_S * 1000) {
    const retryAfterMs = POLL_COOLDOWN_S * 1000 - (Date.now() - lastPoll)
    res.status(429).json({ error: 'Poll too frequent', retryAfterMs })
    return
  }

  // Record this poll attempt before the Tesla call
  await redis.setWithExpiry(rlKey, Date.now(), POLL_COOLDOWN_S + 5)

  try {
    const raw = (await getVehicleData(
      sessionId,
      sess.vehicleId,
      'charge_state;drive_state;vehicle_state',
    )) as TeslaVehicleDataPayload

    const normalized = normalizeVehicleData(raw)
    res.status(200).json({ vehicle: normalized })
  } catch (err) {
    const msg = (err instanceof Error ? err.message : String(err))

    // 408 = vehicle asleep — not an error, just a state to handle gracefully
    if (msg.includes('408') || msg.includes('timeout') || msg.includes('asleep')) {
      res.status(200).json({ vehicle: null, sleeping: true })
      return
    }

    await captureApiError(err, 'tesla/vehicle')
    res.status(502).json({ error: 'Failed to fetch vehicle data' })
  }
}
