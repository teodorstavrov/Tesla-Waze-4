// ─── Redis-backed event store ───────────────────────────────────────────
//
// Replaces the in-memory store so all Vercel function instances share the
// same event list. Uses a single Redis key (events:v1) holding a JSON
// array of RoadEvents.
//
// Prune-on-read: expired events are removed and written back lazily so we
// don't need a separate cron job for cleanup.
//
// Race conditions: two simultaneous writes could lose one event in extreme
// edge cases, but for the scale this app targets (<50 concurrent users
// reporting events rarely) this is acceptable.

import { redis } from '../db/redis.js'
import type { RoadEvent } from './types.js'
import { DENY_THRESHOLD } from './types.js'

const KEY = 'teslaradar:events:v1'
const MAX_EVENTS = 500

async function _readAll(): Promise<RoadEvent[]> {
  const data = await redis.get<RoadEvent[]>(KEY)
  return data ?? []
}

function _pruneExpired(events: RoadEvent[]): RoadEvent[] {
  const now = Date.now()
  // permanent flag = admin marker (red circle, deny-immune), but still expires via expiresAt
  return events.filter((e) => new Date(e.expiresAt).getTime() > now)
}

async function _write(events: RoadEvent[]): Promise<void> {
  await redis.set(KEY, events)
}

export const eventRedisStore = {
  async getInBBox(bbox: { minLat: number; minLng: number; maxLat: number; maxLng: number }): Promise<RoadEvent[]> {
    const all = _pruneExpired(await _readAll())
    // Write pruned list back lazily (fire-and-forget — don't block the response)
    void _write(all)
    return all.filter(
      (e) =>
        e.lat >= bbox.minLat && e.lat <= bbox.maxLat &&
        e.lng >= bbox.minLng && e.lng <= bbox.maxLng,
    )
  },

  async add(event: RoadEvent): Promise<void> {
    let all = _pruneExpired(await _readAll())
    if (all.length >= MAX_EVENTS) {
      // Evict oldest
      all = all.sort((a, b) => a.reportedAt.localeCompare(b.reportedAt)).slice(1)
    }
    all.push(event)
    await _write(all)
  },

  async remove(id: string): Promise<boolean> {
    const all = _pruneExpired(await _readAll())
    const filtered = all.filter((e) => e.id !== id)
    if (filtered.length === all.length) return false
    await _write(filtered)
    return true
  },

  async getAll(): Promise<RoadEvent[]> {
    const all = _pruneExpired(await _readAll())
    void _write(all)
    return all
  },

  async confirm(id: string): Promise<RoadEvent | null> {
    const all = _pruneExpired(await _readAll())
    const idx = all.findIndex((e) => e.id === id)
    if (idx === -1) return null
    all[idx] = { ...all[idx]!, confirms: (all[idx]!.confirms ?? 0) + 1 }
    await _write(all)
    return all[idx]!
  },

  /** Returns null if not found, 'deleted' if auto-removed after DENY_THRESHOLD denies. */
  /** Reset confirms/denies to 0 for every event. Returns count of events reset. */
  async resetAllCounters(): Promise<number> {
    const all = _pruneExpired(await _readAll())
    const reset = all.map((e) => ({ ...e, confirms: 0, denies: 0 }))
    await _write(reset)
    return reset.length
  },

  /** Delete every event unconditionally. */
  async clearAll(): Promise<void> {
    await _write([])
  },

  async deny(id: string): Promise<RoadEvent | null | 'deleted'> {
    const all = _pruneExpired(await _readAll())
    const idx = all.findIndex((e) => e.id === id)
    if (idx === -1) return null
    // Permanent (admin) events are immune to deny-votes
    if (all[idx]!.permanent) return all[idx]!
    const denies = (all[idx]!.denies ?? 0) + 1
    if (denies >= DENY_THRESHOLD) {
      all.splice(idx, 1)
      await _write(all)
      return 'deleted'
    }
    all[idx] = { ...all[idx]!, denies }
    await _write(all)
    return all[idx]!
  },
}
