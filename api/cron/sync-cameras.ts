// ─── GET /api/cron/sync-cameras?country=BG|NO-S|NO-M|NO-N ────────────
//
// Fetches speed cameras from Overpass for one region and merges into Redis.
// Norway is split into 3 lat bands to stay under the 60s function limit:
//   NO-S: south  (57.959 – 63.0)
//   NO-M: middle (63.0   – 67.5)
//   NO-N: north  (67.5   – 71.182)
//
// The Redis key for all NO regions is 'teslaradar:cameras:no' — each call
// reads existing cameras, removes old entries for its lat band, then writes
// the merged result back.
//
// Manual trigger:
//   GET /api/cron/sync-cameras?secret=CRON_SECRET&country=BG
//   GET /api/cron/sync-cameras?secret=CRON_SECRET&country=NO-S  (etc.)

import type { VercelRequest, VercelResponse } from '@vercel/node'
import { BULGARIA_BBOX } from '../_lib/utils/bbox.js'
import type { BBox } from '../_lib/utils/bbox.js'
import { fetchCamerasFromOverpass, getCamerasFromCache, redisKeyForCountry } from '../_lib/providers/cameras.js'
import { redis, isRedisConfigured } from '../_lib/db/redis.js'
import type { SpeedCamera } from '../_lib/providers/cameras.js'

const REGIONS: Record<string, { bbox: BBox; redisCountry: string }> = {
  BG:      { bbox: BULGARIA_BBOX,                                                      redisCountry: 'BG' },
  'NO-1A': { bbox: { minLat: 57.959, minLng: 4.479,  maxLat: 58.4,   maxLng: 31.293 }, redisCountry: 'NO' },
  'NO-1B1':{ bbox: { minLat: 58.4,   minLng: 4.479,  maxLat: 58.6,   maxLng: 31.293 }, redisCountry: 'NO' },
  'NO-1B2':{ bbox: { minLat: 58.6,   minLng: 4.479,  maxLat: 58.8,   maxLng: 31.293 }, redisCountry: 'NO' },
  'NO-2':  { bbox: { minLat: 58.8,   minLng: 4.479,  maxLat: 59.5,   maxLng: 31.293 }, redisCountry: 'NO' },
  'NO-3':  { bbox: { minLat: 59.5,   minLng: 4.479,  maxLat: 60.0,   maxLng: 31.293 }, redisCountry: 'NO' },
  'NO-4A1':{ bbox: { minLat: 60.0,   minLng: 4.479,  maxLat: 60.15,  maxLng: 31.293 }, redisCountry: 'NO' },
  'NO-4A2':{ bbox: { minLat: 60.15,  minLng: 4.479,  maxLat: 60.225, maxLng: 31.293 }, redisCountry: 'NO' },
  'NO-4A3':{ bbox: { minLat: 60.225, minLng: 4.479,  maxLat: 60.3,   maxLng: 31.293 }, redisCountry: 'NO' },
  'NO-4B': { bbox: { minLat: 60.3,   minLng: 4.479,  maxLat: 60.6,   maxLng: 31.293 }, redisCountry: 'NO' },
  'NO-5A': { bbox: { minLat: 60.6,   minLng: 4.479,  maxLat: 60.95,  maxLng: 31.293 }, redisCountry: 'NO' },
  'NO-5B1':{ bbox: { minLat: 60.95,  minLng: 4.479,  maxLat: 61.125, maxLng: 31.293 }, redisCountry: 'NO' },
  'NO-5B2':{ bbox: { minLat: 61.125, minLng: 4.479,  maxLat: 61.3,   maxLng: 31.293 }, redisCountry: 'NO' },
  'NO-6A': { bbox: { minLat: 61.3,   minLng: 4.479,  maxLat: 62.15,  maxLng: 31.293 }, redisCountry: 'NO' },
  'NO-6B': { bbox: { minLat: 62.15,  minLng: 4.479,  maxLat: 63.0,   maxLng: 31.293 }, redisCountry: 'NO' },
  'NO-7':  { bbox: { minLat: 63.0,   minLng: 4.479,  maxLat: 67.5,   maxLng: 31.293 }, redisCountry: 'NO' },
  'NO-8':  { bbox: { minLat: 67.5,   minLng: 4.479,  maxLat: 71.182, maxLng: 31.293 }, redisCountry: 'NO' },
}

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  const secret = process.env['CRON_SECRET']
  if (!secret) { res.status(503).json({ error: 'CRON_SECRET not configured' }); return }

  const headerAuth  = (req.headers['authorization'] ?? '').replace(/^Bearer\s+/i, '')
  const querySecret = String(req.query['secret'] ?? '')
  if (headerAuth !== secret && querySecret !== secret) {
    res.status(401).json({ error: 'Unauthorized' }); return
  }

  if (!isRedisConfigured()) { res.status(503).json({ error: 'Redis not configured' }); return }

  const region = String(req.query['country'] ?? 'BG').toUpperCase()
  const config = REGIONS[region]
  if (!config) {
    res.status(400).json({ error: `Unknown region. Use: ${Object.keys(REGIONS).join(', ')}` }); return
  }

  const t0 = Date.now()
  try {
    const newCams = await fetchCamerasFromOverpass(config.bbox, `${config.redisCountry}-tmp`)

    if (config.redisCountry === 'NO') {
      // Merge with existing NO cameras from other lat bands
      const existing = await getCamerasFromCache('NO')
      const { minLat, maxLat } = config.bbox
      // Remove old cameras from this lat band, keep cameras from other bands
      const otherBands = existing.filter((c) => c.lat < minLat || c.lat > maxLat)
      const merged = [...otherBands, ...newCams]
      // Write merged back to Redis under the 'NO' key
      await redis.set(redisKeyForCountry('NO'), merged)
      // Clear tmp key
      await redis.del(redisKeyForCountry(`${config.redisCountry}-tmp`))
      res.status(200).json({ region, newCameras: newCams.length, total: merged.length, elapsedMs: Date.now() - t0, syncedAt: new Date().toISOString() })
    } else {
      res.status(200).json({ region, cameras: newCams.length, elapsedMs: Date.now() - t0, syncedAt: new Date().toISOString() })
    }
  } catch (err) {
    res.status(500).json({ region, error: String(err), elapsedMs: Date.now() - t0 })
  }
}
