// ─── Station Comment DB ────────────────────────────────────────────────
// Comments are stored as a single Redis list (newest first, capped at 2000).
// Each comment carries enough context (stationId, name, lat/lng) so the
// admin map can render them without a secondary lookup.

import { redis } from './redis.js'

const KEY = 'teslaradar:station-comments:v1'
const MAX = 2000

export interface StationComment {
  id:          string
  stationId:   string
  stationName: string
  lat:         number
  lng:         number
  text:        string
  submittedAt: string
}

export const commentDb = {
  async getAll(): Promise<StationComment[]> {
    if (!redis.isConfigured()) return []
    const data = await redis.get<StationComment[]>(KEY)
    return Array.isArray(data) ? data : []
  },

  async add(comment: StationComment): Promise<void> {
    if (!redis.isConfigured()) return
    const all = await this.getAll()
    all.unshift(comment)
    await redis.set(KEY, all.slice(0, MAX))
  },
}
