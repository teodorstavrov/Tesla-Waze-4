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
//   before VIN storage was introduced.
//   If both are null (OAuth callback's vehicle fetch failed), this endpoint
//   attempts a one-time recovery by calling /api/1/vehicles and backfilling
//   the session — so the user doesn't need to reconnect just for that.

import type { VercelRequest, VercelResponse } from '@vercel/node'
import { getSession, updateSessionVehicle } from '../_lib/tesla/session.js'
import { getVehicleData, getVehicles } from '../_lib/tesla/client.js'
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
    res.status(401).json({ error: 'session_expired' })
    return
  }

  const sess = await getSession(sessionId)
  if (!sess) {
    res.status(401).json({ error: 'session_expired', hint: 'Please reconnect Tesla' })
    return
  }

  // VIN is the preferred Fleet API identifier; fall back to numeric vehicleId for
  // sessions created before VIN storage was introduced (pre-launch sessions).
  let vehicleIdentifier = sess.vehicleVin ?? sess.vehicleId

  // ── Vehicle-info recovery ─────────────────────────────────────────────
  // If both are null (OAuth callback's vehicle fetch failed transiently),
  // try to fetch the vehicle list and backfill the session in-place.
  // This self-heals the "no_vehicle_id" state without requiring a reconnect.
  if (!vehicleIdentifier) {
    console.log('[TESLA_VEHICLE] vehicleIdentifier missing — attempting recovery via /api/1/vehicles')
    try {
      const vehicles = await getVehicles(sessionId)
      if (vehicles.length > 0) {
        const v = vehicles[0]!
        const recoveredId   = String(v.id)
        const recoveredVin  = v.vin
        const recoveredName = v.display_name || v.vin
        await updateSessionVehicle(sessionId, recoveredId, recoveredVin, recoveredName)
        vehicleIdentifier = recoveredVin || recoveredId
        console.log('[TESLA_VEHICLE] recovery succeeded — vehicleVin:', recoveredVin, 'vehicleId:', recoveredId)
      } else {
        console.log('[TESLA_VEHICLE] recovery failed — empty vehicle list from Tesla API')
      }
    } catch (err) {
      console.error('[TESLA_VEHICLE] recovery failed — getVehicles threw:', String(err))
    }
  }

  if (!vehicleIdentifier) {
    res.status(401).json({
      error: 'no_vehicle_id',
      hint: 'Vehicle not associated with session. Check Vercel logs for [TESLA_VEHICLE] recovery errors.',
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
      const sleeping = await markSleeping(sessionId)
      res.status(200).json({ vehicle: sleeping, sleeping: true })
      return
    }

    await captureApiError(err, 'tesla/vehicle')

    if (cached) {
      res.status(200).json({ vehicle: cached, error: 'tesla_fetch_failed' })
    } else {
      res.status(502).json({ error: 'Failed to fetch vehicle data' })
    }
  }
}
