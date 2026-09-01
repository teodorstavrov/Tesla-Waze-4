// ─── Online user counter ────────────────────────────────────────────────
// POST { sid: string } — registers/refreshes a session heartbeat, returns count.
// GET                  — returns current count without registering.
//
// Implementation: Redis sorted set, score = unix timestamp (seconds).
// A session is "online" if its last heartbeat was within 30 seconds.
// The sorted set is self-cleaning: stale entries are removed on every call.
// Key: teslaradar:online:v1

import type { VercelRequest, VercelResponse } from '@vercel/node'
import { redis, isRedisConfigured } from './_lib/db/redis.js'

const KEY          = 'teslaradar:online:v1'
const VISITORS_KEY = 'teslaradar:visitors:v1'
const TTL_S        = 7 * 60  // session considered online for 7 min (matches 5-min heartbeat + buffer)
const KEY_EXPIRY   = 15 * 60 // delete entire key if no activity for 15 min

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Cache-Control', 'no-store')

  if (!isRedisConfigured()) {
    return res.status(200).json({ count: 0 })
  }

  const now   = Math.floor(Date.now() / 1000)
  const stale = now - TTL_S

  try {
    if (req.method === 'POST') {
      const body = req.body as { sid?: unknown; lat?: unknown; lng?: unknown; country?: unknown; firstSeen?: unknown }
      const sid  = typeof body?.sid === 'string' ? body.sid.slice(0, 40) : null
      if (!sid) return res.status(400).json({ error: 'sid required' })

      // Pipeline: ZADD (upsert session) + clean stale + count + refresh key TTL
      const results = await redis.pipeline([
        ['ZADD', KEY, now, sid],
        ['ZREMRANGEBYSCORE', KEY, '-inf', stale],
        ['ZCARD', KEY],
        ['EXPIRE', KEY, KEY_EXPIRY],
      ])
      const count = (results[2] as number) ?? 1

      // Visitor location tracking (optional — fire-and-forget, never delays response)
      const rawLat      = typeof body?.lat       === 'number' ? body.lat       : null
      const rawLng      = typeof body?.lng       === 'number' ? body.lng       : null
      const rawCountry  = typeof body?.country   === 'string' ? body.country.slice(0, 10)  : 'unknown'
      const rawFirst    = typeof body?.firstSeen === 'number' && (body.firstSeen as number) > 0 ? (body.firstSeen as number) : now
      if (
        rawLat !== null && rawLng !== null &&
        isFinite(rawLat) && isFinite(rawLng) &&
        rawLat >= -90 && rawLat <= 90 &&
        rawLng >= -180 && rawLng <= 180
      ) {
        const lat  = Math.round(rawLat * 10) / 10   // ~11 km precision for privacy
        const lng  = Math.round(rawLng * 10) / 10
        const record = JSON.stringify({ lat, lng, country: rawCountry, lastSeen: now, firstSeen: rawFirst })
        void redis.hset(VISITORS_KEY, sid, record)
      }

      return res.status(200).json({ count })
    }

    if (req.method === 'GET') {
      const results = await redis.pipeline([
        ['ZREMRANGEBYSCORE', KEY, '-inf', stale],
        ['ZCARD', KEY],
      ])
      const count = (results[1] as number) ?? 0
      return res.status(200).json({ count })
    }

    return res.status(405).json({ error: 'Method not allowed' })
  } catch (err) {
    console.error('[online] Redis error', err)
    return res.status(200).json({ count: 0 })
  }
}
