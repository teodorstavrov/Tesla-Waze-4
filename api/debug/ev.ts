// ─── GET /api/debug/ev ─────────────────────────────────────────────────
// Diagnostic: shows Redis contents + live provider status.
// NOT protected — read-only, no sensitive data exposed.

import type { VercelRequest, VercelResponse } from '@vercel/node'
import { redis, isRedisConfigured } from '../_lib/db/redis.js'
import type { NormalizedStation } from '../_lib/normalize/types.js'

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  res.setHeader('Access-Control-Allow-Origin', '*')
  if (req.method !== 'GET') { res.status(405).json({ error: 'Method not allowed' }); return }

  const configured = isRedisConfigured()

  if (!configured) {
    res.status(200).json({ redis: false, hint: 'UPSTASH_REDIS_REST_URL / TOKEN not set' })
    return
  }

  // Check all relevant Redis keys
  const [newKey, legacyKey, newMeta, legacyMeta] = await Promise.allSettled([
    redis.get<NormalizedStation[]>('teslaradar:stations:v1'),
    redis.get<unknown>('stations:v1'),
    redis.get<unknown>('teslaradar:stations:v1:meta'),
    redis.get<unknown>('stations:v1:meta'),
  ])

  function inspect(r: PromiseSettledResult<unknown>) {
    if (r.status === 'rejected') return { error: String(r.reason) }
    const v = r.value
    if (v === null) return { exists: false }
    if (Array.isArray(v)) {
      const first = v[0] as Record<string, unknown> | undefined
      return {
        exists: true,
        count: v.length,
        hasLatLng: typeof first?.lat === 'number' && typeof first?.lng === 'number',
        hasId: typeof first?.id === 'string',
        firstId: first?.id ?? null,
        sample: first ? { id: first.id, lat: first.lat, lng: first.lng, source: first.source } : null,
      }
    }
    return { exists: true, type: typeof v, value: v }
  }

  res.status(200).json({
    redis: true,
    keys: {
      'teslaradar:stations:v1':      inspect(newKey),
      'stations:v1':                 inspect(legacyKey),
      'teslaradar:stations:v1:meta': inspect(newMeta),
      'stations:v1:meta':            inspect(legacyMeta),
    },
    hint: 'If teslaradar:stations:v1 is empty, trigger: GET /api/cron/sync-stations?secret=CRON_SECRET',
  })
}
