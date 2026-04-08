// ─── GET /api/cameras?country=BG|NO ────────────────────────────────────
//
// Returns all static speed cameras for the requested country from OSM.
// Data is fetched from Overpass and cached 24h server-side (cameras
// change very rarely — typically only a few times per year).
//
// Response: { cameras: SpeedCamera[], count: number }

// ─── GET /api/cameras?country=BG|NO ────────────────────────────────────
//
// Serves cameras from Redis snapshot (written by cron).
// Never calls Overpass directly — too slow for large bboxes.
//
// Response: { cameras: SpeedCamera[], count: number }

import type { VercelRequest, VercelResponse } from '@vercel/node'
import { getCamerasFromCache } from '../_lib/providers/cameras.js'
import { setCacheHeaders } from '../_lib/cache/headers.js'
import { rateLimit } from '../_lib/utils/rateLimit.js'
import { captureApiError } from '../_lib/utils/sentryApi.js'

const SUPPORTED = new Set(['BG', 'NO'])

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS')

  if (req.method === 'OPTIONS') { setCacheHeaders(res, 600); res.status(204).end(); return }
  if (req.method !== 'GET')    { res.status(405).json({ error: 'Method not allowed' }); return }

  const country = String(req.query['country'] ?? 'BG').toUpperCase()
  if (!SUPPORTED.has(country)) {
    res.status(400).json({ error: `Unknown country: ${country}. Supported: BG, NO` })
    return
  }

  const ip = (req.headers['x-forwarded-for'] as string | undefined)?.split(',')[0]?.trim() ?? 'unknown'
  const allowed = await rateLimit(ip, 'cameras', 30, 60)
  if (!allowed) { res.status(429).json({ error: 'Too many requests' }); return }

  try {
    const cameras = await getCamerasFromCache(country)
    setCacheHeaders(res, 3600, 86400)
    res.status(200).json({ cameras, count: cameras.length })
  } catch (err) {
    await captureApiError(err, `cameras GET ${country}`)
    res.status(500).json({ error: 'Internal server error' })
  }
}
