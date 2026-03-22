// ─── GET /api/events   — list events in bbox ──────────────────────────
// ─── POST /api/events  — report new event ─────────────────────────────
//
// GET params:  bbox=minLat,minLng,maxLat,maxLng  (defaults to Bulgaria)
// POST body:   { type, lat, lng, description? }
//
// Response shape: { events: RoadEvent[] }

import type { VercelRequest, VercelResponse } from '@vercel/node'
import { parseBBox, BULGARIA_BBOX } from '../_lib/utils/bbox.js'
import { eventMemStore } from '../_lib/events/store.js'
import { ttlMs } from '../_lib/events/types.js'
import type { EventType, RoadEvent } from '../_lib/events/types.js'
import { setCacheHeaders } from '../_lib/cache/headers.js'
import { errorMessage } from '../_lib/utils/request.js'

const VALID_TYPES = new Set<EventType>([
  'police', 'accident', 'hazard', 'traffic', 'closure', 'construction',
])

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')

  if (req.method === 'OPTIONS') { res.status(204).end(); return }

  // ── GET ──────────────────────────────────────────────────────────
  if (req.method === 'GET') {
    try {
      const bbox = parseBBox(req.query['bbox'] as string | undefined) ?? BULGARIA_BBOX
      const events = eventMemStore.getInBBox(bbox)
      setCacheHeaders(res, 0)  // events should not be CDN-cached
      res.status(200).json({ events })
    } catch (err) {
      res.status(500).json({ error: errorMessage(err) })
    }
    return
  }

  // ── POST ─────────────────────────────────────────────────────────
  if (req.method === 'POST') {
    try {
      const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body

      const type: EventType = body?.type
      const lat  = Number(body?.lat)
      const lng  = Number(body?.lng)
      const description: string | null = body?.description ?? null

      if (!VALID_TYPES.has(type))          { res.status(400).json({ error: `Invalid type: ${String(type)}` }); return }
      if (!isFinite(lat) || !isFinite(lng)) { res.status(400).json({ error: 'Invalid coordinates' }); return }

      const now = new Date()
      const expiresAt = new Date(now.getTime() + ttlMs(type))

      const event: RoadEvent = {
        id:          crypto.randomUUID(),
        type,
        lat,
        lng,
        description: description?.slice(0, 200) ?? null,
        reportedAt:  now.toISOString(),
        expiresAt:   expiresAt.toISOString(),
        confirms:    0,
      }

      eventMemStore.add(event)
      res.status(201).json({ event })
    } catch (err) {
      res.status(500).json({ error: errorMessage(err) })
    }
    return
  }

  res.status(405).json({ error: 'Method not allowed' })
}
