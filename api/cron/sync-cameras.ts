// ─── GET /api/cron/sync-cameras?country=<REGION> ────────────────────────
//
// Fetches speed cameras from Overpass for one region and merges into Redis.
//
// Supported countries and their split regions:
//
//  BG  — Bulgaria (single region, small country)
//
//  NO  — Norway (split into 17 lat bands to fit within Vercel 60s limit)
//          NO-1A … NO-8 (south → north)
//
//  SE  — Sweden (split into 5 lat bands)
//          SE-1  55.337 – 57.5   (Skåne, Blekinge, Småland)
//          SE-2  57.5   – 59.5   (West coast, Stockholm)
//          SE-3  59.5   – 62.0   (Uppsala, Värmland, Dalarna)
//          SE-4  62.0   – 65.5   (Gävleborg, Jämtland)
//          SE-5  65.5   – 69.1   (Norrland far north)
//
//  FI  — Finland (split into 3 lat bands)
//          FI-1  59.808 – 62.0   (Helsinki, Tampere area)
//          FI-2  62.0   – 65.5   (Central Finland, Oulu south)
//          FI-3  65.5   – 70.1   (Lapland)
//
// All bands for a country share the same Redis key (e.g. teslaradar:cameras:no).
// Each call reads existing cameras, removes old entries for its lat band, then
// writes the merged result back.
//
// Manual trigger:
//   GET /api/cron/sync-cameras?secret=CRON_SECRET&country=BG
//   GET /api/cron/sync-cameras?secret=CRON_SECRET&country=SE-1  (etc.)

import type { VercelRequest, VercelResponse } from '@vercel/node'
import { BULGARIA_BBOX } from '../_lib/utils/bbox.js'
import type { BBox } from '../_lib/utils/bbox.js'
import { fetchCamerasFromOverpass, getCamerasFromCache, redisKeyForCountry } from '../_lib/providers/cameras.js'
import { redis, isRedisConfigured } from '../_lib/db/redis.js'
import type { SpeedCamera } from '../_lib/providers/cameras.js'

// ── Region registry ──────────────────────────────────────────────────────
const REGIONS: Record<string, { bbox: BBox; redisCountry: string }> = {

  // ── Bulgaria (single region) ───────────────────────────────────────────
  BG: { bbox: BULGARIA_BBOX, redisCountry: 'BG' },

  // ── Norway (17 lat bands, same Redis key 'NO') ─────────────────────────
  'NO-1A':  { bbox: { minLat: 57.959, minLng: 4.479,  maxLat: 58.4,   maxLng: 31.293 }, redisCountry: 'NO' },
  'NO-1B1': { bbox: { minLat: 58.4,   minLng: 4.479,  maxLat: 58.6,   maxLng: 31.293 }, redisCountry: 'NO' },
  'NO-1B2': { bbox: { minLat: 58.6,   minLng: 4.479,  maxLat: 58.8,   maxLng: 31.293 }, redisCountry: 'NO' },
  'NO-2':   { bbox: { minLat: 58.8,   minLng: 4.479,  maxLat: 59.5,   maxLng: 31.293 }, redisCountry: 'NO' },
  'NO-3':   { bbox: { minLat: 59.5,   minLng: 4.479,  maxLat: 60.0,   maxLng: 31.293 }, redisCountry: 'NO' },
  'NO-4A1': { bbox: { minLat: 60.0,   minLng: 4.479,  maxLat: 60.15,  maxLng: 31.293 }, redisCountry: 'NO' },
  'NO-4A2': { bbox: { minLat: 60.15,  minLng: 4.479,  maxLat: 60.225, maxLng: 31.293 }, redisCountry: 'NO' },
  'NO-4A3': { bbox: { minLat: 60.225, minLng: 4.479,  maxLat: 60.3,   maxLng: 31.293 }, redisCountry: 'NO' },
  'NO-4B':  { bbox: { minLat: 60.3,   minLng: 4.479,  maxLat: 60.6,   maxLng: 31.293 }, redisCountry: 'NO' },
  'NO-5A':  { bbox: { minLat: 60.6,   minLng: 4.479,  maxLat: 60.95,  maxLng: 31.293 }, redisCountry: 'NO' },
  'NO-5B1': { bbox: { minLat: 60.95,  minLng: 4.479,  maxLat: 61.125, maxLng: 31.293 }, redisCountry: 'NO' },
  'NO-5B2': { bbox: { minLat: 61.125, minLng: 4.479,  maxLat: 61.3,   maxLng: 31.293 }, redisCountry: 'NO' },
  'NO-6A':  { bbox: { minLat: 61.3,   minLng: 4.479,  maxLat: 62.15,  maxLng: 31.293 }, redisCountry: 'NO' },
  'NO-6B':  { bbox: { minLat: 62.15,  minLng: 4.479,  maxLat: 63.0,   maxLng: 31.293 }, redisCountry: 'NO' },
  'NO-7':   { bbox: { minLat: 63.0,   minLng: 4.479,  maxLat: 67.5,   maxLng: 31.293 }, redisCountry: 'NO' },
  'NO-8':   { bbox: { minLat: 67.5,   minLng: 4.479,  maxLat: 71.182, maxLng: 31.293 }, redisCountry: 'NO' },

  // ── Sweden (5 lat bands, Redis key 'SE') ──────────────────────────────
  'SE-1':   { bbox: { minLat: 55.337, minLng: 11.120, maxLat: 57.5,   maxLng: 24.166 }, redisCountry: 'SE' },
  'SE-2':   { bbox: { minLat: 57.5,   minLng: 11.120, maxLat: 59.5,   maxLng: 24.166 }, redisCountry: 'SE' },
  'SE-3':   { bbox: { minLat: 59.5,   minLng: 11.120, maxLat: 62.0,   maxLng: 24.166 }, redisCountry: 'SE' },
  'SE-4':   { bbox: { minLat: 62.0,   minLng: 11.120, maxLat: 65.5,   maxLng: 24.166 }, redisCountry: 'SE' },
  'SE-5':   { bbox: { minLat: 65.5,   minLng: 11.120, maxLat: 69.060, maxLng: 24.166 }, redisCountry: 'SE' },

  // ── Finland (3 lat bands, Redis key 'FI') ─────────────────────────────
  'FI-1':   { bbox: { minLat: 59.808, minLng: 20.550, maxLat: 62.0,   maxLng: 31.587 }, redisCountry: 'FI' },
  'FI-2':   { bbox: { minLat: 62.0,   minLng: 20.550, maxLat: 65.5,   maxLng: 31.587 }, redisCountry: 'FI' },
  'FI-3':   { bbox: { minLat: 65.5,   minLng: 20.550, maxLat: 70.093, maxLng: 31.587 }, redisCountry: 'FI' },
}

// Countries that split multiple regions into a single Redis key
const MULTI_REGION_COUNTRIES = new Set(['NO', 'SE', 'FI'])

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

    if (MULTI_REGION_COUNTRIES.has(config.redisCountry)) {
      // Merge with existing cameras from other lat bands (same Redis key)
      const existing = await getCamerasFromCache(config.redisCountry)
      const { minLat, maxLat } = config.bbox
      // Remove old cameras from this lat band, keep cameras from other bands
      const otherBands = existing.filter((c: SpeedCamera) => c.lat < minLat || c.lat > maxLat)
      const merged = [...otherBands, ...newCams]
      // Write merged back to Redis under the country key
      await redis.set(redisKeyForCountry(config.redisCountry), merged)
      // Clear tmp key
      await redis.del(redisKeyForCountry(`${config.redisCountry}-tmp`))
      res.status(200).json({
        region,
        newCameras: newCams.length,
        total: merged.length,
        elapsedMs: Date.now() - t0,
        syncedAt: new Date().toISOString(),
      })
    } else {
      res.status(200).json({
        region,
        cameras: newCams.length,
        elapsedMs: Date.now() - t0,
        syncedAt: new Date().toISOString(),
      })
    }
  } catch (err) {
    res.status(500).json({ region, error: String(err), elapsedMs: Date.now() - t0 })
  }
}
