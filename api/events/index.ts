// ─── GET /api/events   — list events in bbox ──────────────────────────
// ─── POST /api/events  — report new event ─────────────────────────────
//
// COST ARCHITECTURE:
// GET uses a short (20s) per-bbox in-memory cache on warm Vercel instances.
// This coalesces bursts of concurrent requests (e.g. 50 users loading simultaneously)
// from potentially 50 Redis reads down to ~3 (one per unique bbox per 20s window).
// Admin deletes are visible within 20s max — acceptable for this use case.
// Each Vercel instance caches independently, so there is no cross-instance invalidation
// concern: worst case is a 20s delay, not a permanent stale state.

import type { VercelRequest, VercelResponse } from '@vercel/node'
import { BULGARIA_BBOX, NORWAY_BBOX, parseBBox } from '../_lib/utils/bbox.js'
import { eventMemStore } from '../_lib/events/store.js'
import { eventRedisStore } from '../_lib/events/redisStore.js'
import { isRedisConfigured } from '../_lib/db/redis.js'
import { ttlMs } from '../_lib/events/types.js'
import type { EventType, RoadEvent } from '../_lib/events/types.js'
import { setCacheHeaders } from '../_lib/cache/headers.js'
import { rateLimit } from '../_lib/utils/rateLimit.js'
import { captureApiError } from '../_lib/utils/sentryApi.js'

const VALID_TYPES = new Set<EventType>([
  'police', 'accident', 'hazard', 'traffic', 'camera', 'construction',
])

// ── Server-side response cache (per bbox, 20s TTL) ───────────────────
// Coalesces concurrent GET requests on the same warm Vercel instance.
// At 50 concurrent users, reduces Redis reads from N/stale-window → ~3/stale-window.
const _eventsCache = new Map<string, { events: RoadEvent[]; expiresAt: number }>()
const GET_CACHE_TTL_MS = 20_000

// In-memory GET rate limiter — no Redis cost
const _getIpHits = new Map<string, { count: number; resetAt: number }>()
function _checkGetRL(ip: string): boolean {
  const now = Date.now()
  const e = _getIpHits.get(ip)
  if (!e || now > e.resetAt) { _getIpHits.set(ip, { count: 1, resetAt: now + 60_000 }); return true }
  e.count++
  return e.count <= 60
}

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')

  if (req.method === 'OPTIONS') { res.status(204).end(); return }

  const useRedis = isRedisConfigured()

  // ── GET ──────────────────────────────────────────────────────────
  if (req.method === 'GET') {
    const ip = (req.headers['x-forwarded-for'] as string | undefined)?.split(',')[0]?.trim() ?? 'unknown'
    if (!_checkGetRL(ip)) { res.status(429).json({ error: 'Too many requests' }); return }

    try {
      // Use client-supplied bbox (supports BG + NO). Fall back to Bulgaria if missing/invalid.
      const clientBBox = parseBBox(req.query['bbox'] as string | undefined)
      const bbox = clientBBox ?? BULGARIA_BBOX

      // Clamp to supported regions so we never query unbounded world data
      const BG = BULGARIA_BBOX
      const NO = NORWAY_BBOX
      const inBg = bbox.minLat <= BG.maxLat && bbox.maxLat >= BG.minLat
      const inNo = bbox.minLat <= NO.maxLat && bbox.maxLat >= NO.minLat
      const queryBBox = (!inBg && inNo) ? NO : (!inNo && inBg) ? BG : bbox

      // Check in-memory cache first — coalesces concurrent requests on warm instances
      const cacheKey = `${queryBBox.minLat},${queryBBox.minLng},${queryBBox.maxLat},${queryBBox.maxLng}`
      const cached = _eventsCache.get(cacheKey)
      const now = Date.now()
      if (cached && cached.expiresAt > now) {
        setCacheHeaders(res, 0)
        res.status(200).json({ events: cached.events })
        return
      }

      const events = useRedis
        ? await eventRedisStore.getInBBox(queryBBox)
        : eventMemStore.getInBBox(queryBBox)

      // Cache result for 20s — reduces Redis reads at 50 concurrent users
      _eventsCache.set(cacheKey, { events, expiresAt: now + GET_CACHE_TTL_MS })

      setCacheHeaders(res, 0)
      res.status(200).json({ events })
    } catch (err) {
      await captureApiError(err, 'events GET')
      res.status(500).json({ error: 'Internal server error' })
    }
    return
  }

  // ── POST ─────────────────────────────────────────────────────────
  if (req.method === 'POST') {
    try {
      const ip = (req.headers['x-forwarded-for'] as string | undefined)?.split(',')[0]?.trim() ?? 'unknown'
      const allowed = await rateLimit(ip, 'events', 20, 600)
      if (!allowed) { res.status(429).json({ error: 'Too many reports. Please wait a few minutes.' }); return }

      const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body
      const type: EventType = body?.type
      const lat  = Number(body?.lat)
      const lng  = Number(body?.lng)
      const description: string | null = body?.description ?? null

      if (!VALID_TYPES.has(type))           { res.status(400).json({ error: `Invalid type: ${String(type)}` }); return }
      if (!isFinite(lat) || !isFinite(lng)) { res.status(400).json({ error: 'Invalid coordinates' }); return }
      // Accept coordinates in Bulgaria or Norway
      const inBulgaria = lat >= 41.0 && lat <= 44.5 && lng >= 22.0 && lng <= 28.7
      const inNorway   = lat >= 57.9 && lat <= 71.2 && lng >= 4.4  && lng <= 31.3
      if (!inBulgaria && !inNorway) {
        res.status(400).json({ error: 'Coordinates outside supported region' }); return
      }

      const now = new Date()
      const event: RoadEvent = {
        id:          crypto.randomUUID(),
        type,
        lat,
        lng,
        description: description?.replace(/<[^>]*>/g, '').trim().slice(0, 200) ?? null,
        reportedAt:  now.toISOString(),
        expiresAt:   new Date(now.getTime() + ttlMs(type)).toISOString(),
        confirms:    0,
        denies:      0,
      }

      if (useRedis) { await eventRedisStore.add(event) }
      else          { eventMemStore.add(event) }

      res.status(201).json({ event })
    } catch (err) {
      await captureApiError(err, 'events POST')
      res.status(500).json({ error: 'Internal server error' })
    }
    return
  }

  res.status(405).json({ error: 'Method not allowed' })
}
