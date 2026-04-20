// ─── GET /api/tesla/vehicle ───────────────────────────────────────────────
// Returns normalized vehicle state to the frontend.
//
// CACHE-FIRST STRATEGY (cheapness):
//   1. Read Redis cache (`tesla:vehicle_cache:{sessionId}`)
//   2. freshness = live (<5 min) or recent (<15 min)
//      → return cached immediately. Zero Tesla API calls.
//   3. freshness = stale (>15 min) or no cache
//      → attempt live Tesla vehicle_data fetch
//   4. Vehicle sleeping (408 from Tesla)
//      → mark cache as sleeping, return cached % with sleeping=true
//      → NEVER auto-wake. Only /api/tesla/wake does that (user-explicit).
//
// ?force=1  — bypass freshness check; always try live fetch (user tap).
//             Still respects a 30-second rate limit to prevent hammering.
//
// IDENTIFIER PRIORITY:
//   Uses vehicleVin (VIN) when available — the stable, preferred Fleet API
//   identifier. Falls back to vehicleId (numeric ID) for sessions created
//   before VIN storage was introduced (pre-launch sessions).
//
// RESULT: Tesla API is called AT MOST once per 15 minutes per session
//         under normal usage. Sleeping cars cost 0 additional calls.

import type { VercelRequest, VercelResponse } from '@vercel/node'
import { getSession } from '../_lib/tesla/session.js'
import { getVehicleData } from '../_lib/tesla/client.js'
import { redis, isRedisConfigured } from '../_lib/db/redis.js'
import { parseCookie } from '../_lib/utils/cookies.js'
import { captureApiError } from '../_lib/utils/sentryApi.js'
import {
  getCachedState,
  setCachedState,
  markSleeping,
} from '../_lib/tesla/vehicleCache.js'
import type { TeslaVehicleDataPayload } from '../_lib/tesla/normalize.js'

const SESSION_COOKIE  = 'tesradar_sess'
const RATE_LIMIT_S    = 30    // absolute minimum between live Tesla calls per session

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
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
  if (!sess) {
    res.status(401).json({ error: 'session_expired', hint: 'Please reconnect Tesla' })
    return
  }

  // VIN is the preferred Fleet API identifier; fall back to numeric vehicleId for
  // sessions created before VIN storage was introduced (pre-launch sessions).
  const vehicleIdentifier = sess.vehicleVin ?? sess.vehicleId
  if (!vehicleIdentifier) {
    res.status(401).json({
      error: 'no_vehicle_id',
      hint: 'OAuth succeeded but vehicle list fetch failed — please disconnect and reconnect',
    })
    return
  }

  const force = req.query['force'] === '1'

  // ── Step 1: Read cache ─────────────────────────────────────────────────

  const cached = await getCachedState(sessionId)

  // Sleeping vehicle: always return cached data — never auto-wake
  if (cached?.sleeping) {
    res.status(200).json({ vehicle: cached, sleeping: true })
    return
  }

  // Fresh cache (live or recent): return without hitting Tesla
  if (!force && cached && (cached.freshness === 'live' || cached.freshness === 'recent')) {
    res.status(200).json({ vehicle: cached })
    return
  }

  // ── Step 2: Rate limit before hitting Tesla ────────────────────────────

  const rlKey    = `tesla:poll_rl:${sessionId}`
  const lastPoll = await redis.get<number>(rlKey)
  if (lastPoll && Date.now() - lastPoll < RATE_LIMIT_S * 1000) {
    const retryAfterMs = RATE_LIMIT_S * 1000 - (Date.now() - lastPoll)
    // Return cached (even if stale) rather than 429-ing the frontend
    if (cached) {
      res.status(200).json({ vehicle: cached })
    } else {
      res.status(429).json({ error: 'Poll too frequent', retryAfterMs })
    }
    return
  }

  await redis.setWithExpiry(rlKey, Date.now(), RATE_LIMIT_S + 5)

  // ── Step 3: Live Tesla vehicle_data fetch ─────────────────────────────

  try {
    const raw = (await getVehicleData(
      sessionId,
      vehicleIdentifier,
      'charge_state;drive_state;vehicle_state',
    )) as TeslaVehicleDataPayload

    const normalized = await setCachedState(sessionId, raw)
    res.status(200).json({ vehicle: normalized })
  } catch (err) {
    const msg = String(err instanceof Error ? err.message : err)

    if (msg.includes('408') || msg.includes('timeout') || msg.includes('asleep')) {
      // Vehicle is sleeping — update cache flag, return last known values
      const sleeping = await markSleeping(sessionId)
      res.status(200).json({ vehicle: sleeping, sleeping: true })
      return
    }

    await captureApiError(err, 'tesla/vehicle')

    // Non-sleeping error: return stale cache rather than an error response
    if (cached) {
      res.status(200).json({ vehicle: cached, error: 'tesla_fetch_failed' })
    } else {
      res.status(502).json({ error: 'Failed to fetch vehicle data' })
    }
  }
}
