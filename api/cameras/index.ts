// ─── GET /api/cameras?country=BG|NO ────────────────────────────────────
//
// Returns all static speed cameras for the requested country from OSM.
// Data is fetched from Overpass and cached 24h server-side (cameras
// change very rarely — typically only a few times per year).
//
// Response: { cameras: SpeedCamera[], count: number }

import type { VercelRequest, VercelResponse } from '@vercel/node'
import { BULGARIA_BBOX, NORWAY_BBOX } from '../_lib/utils/bbox.js'
import type { BBox } from '../_lib/utils/bbox.js'
import { fetchCameras } from '../_lib/providers/cameras.js'
import { setCacheHeaders } from '../_lib/cache/headers.js'
import { rateLimit } from '../_lib/utils/rateLimit.js'
import { captureApiError } from '../_lib/utils/sentryApi.js'

const COUNTRY_CONFIG: Record<string, { bbox: BBox; cacheKey: string }> = {
  BG: { bbox: BULGARIA_BBOX, cacheKey: 'cameras:bg' },
  NO: { bbox: NORWAY_BBOX,   cacheKey: 'cameras:no' },
}

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS')

  if (req.method === 'OPTIONS') { setCacheHeaders(res, 600); res.status(204).end(); return }
  if (req.method !== 'GET')    { res.status(405).json({ error: 'Method not allowed' }); return }

  const countryParam = String(req.query['country'] ?? 'BG').toUpperCase()
  const config = COUNTRY_CONFIG[countryParam]
  if (!config) {
    res.status(400).json({ error: `Unknown country: ${countryParam}. Supported: BG, NO` })
    return
  }

  // Rate limit: 30 req/min per IP (cameras are cached 24h — very cheap)
  const ip = (req.headers['x-forwarded-for'] as string | undefined)?.split(',')[0]?.trim() ?? 'unknown'
  const allowed = await rateLimit(ip, 'cameras', 30, 60)
  if (!allowed) {
    res.status(429).json({ error: 'Too many requests' })
    return
  }

  try {
    const cameras = await fetchCameras(config.bbox, config.cacheKey)
    // Long CDN cache — camera data is stable
    setCacheHeaders(res, 3600, 86400)  // 1h stale-while-revalidate, 24h max-age
    res.status(200).json({ cameras, count: cameras.length })
  } catch (err) {
    await captureApiError(err, `cameras GET ${countryParam}`)
    res.status(500).json({ error: 'Internal server error' })
  }
}
