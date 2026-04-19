// ─── GET /api/tesla/debug ─────────────────────────────────────────────────
// Temporary diagnostic endpoint.
// Returns raw Tesla vehicle_data + Redis cache state in one JSON response.
// Remove after battery pipeline is confirmed working.

import type { VercelRequest, VercelResponse } from '@vercel/node'
import { getSession } from '../_lib/tesla/session.js'
import { getValidAccessToken, TESLA_API_BASE } from '../_lib/tesla/client.js'
import { getCachedState } from '../_lib/tesla/vehicleCache.js'
import { parseCookie } from '../_lib/utils/cookies.js'
import { isRedisConfigured } from '../_lib/db/redis.js'

const SESSION_COOKIE = 'tesradar_sess'

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  res.setHeader('Cache-Control', 'no-store')
  res.setHeader('Content-Type', 'application/json')

  const sessionId = parseCookie(req.headers['cookie'] ?? '', SESSION_COOKIE)
  if (!sessionId) {
    res.status(200).json({ error: 'no_session_cookie', hint: 'Not logged in or cookie missing' })
    return
  }

  const sess = await getSession(sessionId)
  if (!sess) {
    res.status(200).json({ error: 'session_not_found', hint: 'Session expired or Redis missing' })
    return
  }

  const redisOk = isRedisConfigured()

  // Read current Redis cache
  const cached = redisOk ? await getCachedState(sessionId) : null

  // Session metadata (no tokens)
  const sessionMeta = {
    vehicleId:   sess.vehicleId,
    vehicleName: sess.vehicleName,
    tokenExpiresAt: new Date(sess.tokenExpiresAt).toISOString(),
    tokenExpired: Date.now() > sess.tokenExpiresAt,
    createdAt:   new Date(sess.createdAt).toISOString(),
  }

  // Live fetch from Tesla — raw response
  let liveRaw: unknown = null
  let liveError: string | null = null
  let liveStatus: number | null = null

  if (sess.vehicleId) {
    try {
      const token = await getValidAccessToken(sessionId)
      if (!token) {
        liveError = 'no_valid_token — getValidAccessToken returned null'
      } else {
        const endpoints = 'charge_state;drive_state;vehicle_state'
        const url = `${TESLA_API_BASE}/api/1/vehicles/${sess.vehicleId}/vehicle_data?endpoints=${encodeURIComponent(endpoints)}`
        const r = await fetch(url, {
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        })
        liveStatus = r.status
        const body = await r.json() as unknown
        if (r.ok) {
          liveRaw = body
        } else {
          liveError = `Tesla API returned ${r.status}`
          liveRaw = body
        }
      }
    } catch (e) {
      liveError = String(e)
    }
  } else {
    liveError = 'no vehicleId in session'
  }

  // Extract key fields from raw response
  type RawBody = { response?: { charge_state?: { battery_level?: unknown; charging_state?: unknown; battery_range?: unknown }; drive_state?: { latitude?: unknown; longitude?: unknown; speed?: unknown }; vehicle_state?: { odometer?: unknown } } }
  const raw = liveRaw as RawBody | null
  const chargeState = raw?.response?.charge_state
  const driveState  = raw?.response?.drive_state

  res.status(200).json({
    timestamp: new Date().toISOString(),
    redis: redisOk ? 'configured' : 'NOT configured',

    session: sessionMeta,

    redis_cache: cached ?? 'empty',

    live_fetch: {
      status: liveStatus,
      error:  liveError,
      key_fields: chargeState ? {
        battery_level:   chargeState.battery_level,
        charging_state:  chargeState.charging_state,
        battery_range:   chargeState.battery_range,
        latitude:        driveState?.latitude,
        longitude:       driveState?.longitude,
        speed:           driveState?.speed,
      } : null,
      full_response: liveRaw,
    },
  })
}
