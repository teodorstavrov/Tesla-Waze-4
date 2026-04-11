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

const SUPPORTED = new Set(['BG', 'NO', 'SE', 'FI'])

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS')

  if (req.method === 'OPTIONS') { setCacheHeaders(res, 600); res.status(204).end(); return }
  if (req.method !== 'GET')    { res.status(405).json({ error: 'Method not allowed' }); return }

  const country = String(req.query['country'] ?? 'BG').toUpperCase()
  if (!SUPPORTED.has(country)) {
    res.status(400).json({ error: `Unknown country: ${country}. Supported: BG, NO, SE, FI` })
    return
  }

  const ip = (req.headers['x-forwarded-for'] as string | undefined)?.split(',')[0]?.trim() ?? 'unknown'
  const allowed = await rateLimit(ip, 'cameras', 30, 60)
  if (!allowed) { res.status(429).json({ error: 'Too many requests' }); return }

  try {
    const cameras = await getCamerasFromCache(country)
    // No CDN caching — server-side memory cache (24h) + client localStorage (24h)
    // handle performance. CDN stale-while-revalidate caused empty responses to persist
    // for up to 25h after the cron first populated Redis.
    res.setHeader('Cache-Control', 'no-store')
    res.setHeader('Access-Control-Allow-Origin', '*')
    res.status(200).json({ cameras, count: cameras.length })
  } catch (err) {
    await captureApiError(err, `cameras GET ${country}`)
    res.status(500).json({ error: 'Internal server error' })
  }
}
