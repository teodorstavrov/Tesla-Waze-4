// ─── GET /api/admin/visitors ────────────────────────────────────────────
// Returns visitor map data (last 24h) + stats (24h / 7d / 30d).
// Protected: Authorization: Bearer ADMIN_SECRET

import type { VercelRequest, VercelResponse } from '@vercel/node'
import { isAuthorized, unauthorized } from '../_lib/admin/auth.js'
import { redis, isRedisConfigured } from '../_lib/db/redis.js'

interface StoredVisitor {
  lat:       number
  lng:       number
  country:   string
  lastSeen:  number
  firstSeen: number
}

const VISITORS_KEY = 'teslaradar:visitors:v1'
const ONLINE_TTL   = 7 * 60        // 7 min — matches heartbeat window
const H24          = 24 * 3600
const H7D          = 7  * 24 * 3600
const H30D         = 30 * 24 * 3600
const CLEANUP_AGE  = 32 * 24 * 3600  // remove sessions older than 32 days

const EMPTY_STATS = { online: 0, h24: 0, h7d: 0, h30d: 0, byCountry: {} as Record<string, { h24: number; h7d: number; h30d: number }> }

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Authorization')

  if (req.method === 'OPTIONS') { res.status(204).end(); return }
  if (!isAuthorized(req))       { unauthorized(res); return }
  if (req.method !== 'GET')     { res.status(405).json({ error: 'Method not allowed' }); return }

  if (!isRedisConfigured()) {
    return res.status(200).json({ visitors: [], stats: EMPTY_STATS })
  }

  const now = Math.floor(Date.now() / 1000)

  const raw = await redis.hgetall(VISITORS_KEY)
  if (!raw) {
    return res.status(200).json({ visitors: [], stats: EMPTY_STATS })
  }

  // Parse all session records
  const entries: (StoredVisitor & { sid: string })[] = []
  for (const [sid, json] of Object.entries(raw)) {
    try {
      const r = JSON.parse(json) as StoredVisitor
      if (typeof r.lat === 'number' && typeof r.lng === 'number' && typeof r.lastSeen === 'number') {
        entries.push({ sid, ...r })
      }
    } catch { /* skip malformed */ }
  }

  // Cleanup old sessions (fire-and-forget — don't delay the response)
  const staleSids = entries.filter((e) => e.lastSeen < now - CLEANUP_AGE).map((e) => e.sid)
  if (staleSids.length > 0) {
    void redis.pipeline([['HDEL', VISITORS_KEY, ...staleSids]])
  }

  // Visitors for the map: last 24h only
  const h24Entries = entries.filter((e) => e.lastSeen >= now - H24)
  const visitors = h24Entries.map((e) => ({
    lat:     e.lat,
    lng:     e.lng,
    country: e.country,
    online:  e.lastSeen >= now - ONLINE_TTL,
  }))

  // Time-window counts
  const h7dEntries  = entries.filter((e) => e.lastSeen >= now - H7D)
  const h30dEntries = entries.filter((e) => e.lastSeen >= now - H30D)
  const online      = h24Entries.filter((e) => e.lastSeen >= now - ONLINE_TTL).length

  // Stats by country
  const byCountry: Record<string, { h24: number; h7d: number; h30d: number }> = {}
  for (const e of h30dEntries) {
    const c = e.country.toUpperCase()
    if (!byCountry[c]) byCountry[c] = { h24: 0, h7d: 0, h30d: 0 }
    byCountry[c].h30d++
    if (e.lastSeen >= now - H7D)  byCountry[c].h7d++
    if (e.lastSeen >= now - H24)  byCountry[c].h24++
  }

  res.status(200).json({
    visitors,
    stats: {
      online,
      h24:  h24Entries.length,
      h7d:  h7dEntries.length,
      h30d: h30dEntries.length,
      byCountry,
    },
  })
}
