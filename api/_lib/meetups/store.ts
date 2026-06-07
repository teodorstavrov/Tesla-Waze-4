// ─── Community meetups store (Redis-backed, in-memory fallback) ──────────
//
// "Meetups" are community gatherings (date + description + organizer + FB
// group), distinct from road events. Single Redis key holds a JSON array.
// Prune-on-read: meetups whose date passed more than KEEP_PAST_MS ago are
// dropped lazily, so no cron is needed.

import { redis, isRedisConfigured } from '../db/redis.js'

export interface Meetup {
  id:          string
  lat:         number
  lng:         number
  title:       string          // short description / name
  date:        string          // ISO datetime of the event
  organizer:   string | null
  facebookUrl: string | null
  createdAt:   string          // ISO
  interested:  string[]        // emails of people who want to follow
}

const KEY          = 'teslaradar:meetups:v1'
const MAX_MEETUPS  = 500
const KEEP_PAST_MS = 24 * 60 * 60 * 1000   // keep events until 1 day after their date

// In-memory fallback (used when Redis is not configured)
let _mem: Meetup[] = []

function _prune(list: Meetup[]): Meetup[] {
  const cutoff = Date.now() - KEEP_PAST_MS
  return list.filter((m) => {
    const t = new Date(m.date).getTime()
    return isNaN(t) || t > cutoff
  })
}

async function _readAll(): Promise<Meetup[]> {
  if (isRedisConfigured()) {
    const data = await redis.get<Meetup[]>(KEY)
    return data ?? []
  }
  return _mem
}

async function _write(list: Meetup[]): Promise<void> {
  if (isRedisConfigured()) await redis.set(KEY, list)
  else _mem = list
}

export const meetupStore = {
  async getAll(): Promise<Meetup[]> {
    const raw = await _readAll()
    const pruned = _prune(raw)
    if (pruned.length < raw.length) {
      _write(pruned).catch((err) => console.warn('[meetupStore] prune write failed:', String(err)))
    }
    // soonest first
    return pruned.sort((a, b) => a.date.localeCompare(b.date))
  },

  async add(m: Meetup): Promise<void> {
    let all = _prune(await _readAll())
    if (all.length >= MAX_MEETUPS) {
      all = all.sort((a, b) => a.createdAt.localeCompare(b.createdAt)).slice(1)
    }
    all.push(m)
    await _write(all)
  },

  async addInterest(id: string, email: string): Promise<boolean> {
    const all = _prune(await _readAll())
    const m = all.find((x) => x.id === id)
    if (!m) return false
    if (!m.interested.includes(email)) m.interested.push(email)
    await _write(all)
    return true
  },

  async remove(id: string): Promise<boolean> {
    const all = _prune(await _readAll())
    const filtered = all.filter((m) => m.id !== id)
    if (filtered.length === all.length) return false
    await _write(filtered)
    return true
  },
}
