// ─── Community meetups store (Redis-backed, in-memory fallback) ──────────
//
// "Meetups" are community gatherings (date + description + organizer contact +
// Facebook group), distinct from road events. Single Redis key holds a JSON
// array. Past meetups (date + 1 day) are pruned lazily on read.
//
// Extra keys:
//   teslaradar:meetup-subs       — Set-like array of emails subscribed to ALL events
//   teslaradar:meetup-reminded   — array of "<id>:<yyyymmdd>" already emailed

import { redis, isRedisConfigured } from '../db/redis.js'

export interface Meetup {
  id:             string
  lat:            number
  lng:            number
  title:          string
  date:           string          // ISO datetime
  organizer:      string | null
  organizerPhone: string | null
  organizerEmail: string | null
  facebook:       string | null   // free text OR url
  createdAt:      string
  followers:      string[]        // emails to remind about THIS event
  ownerToken:     string          // secret — never returned by the public GET
}

/** Public shape returned to clients (no ownerToken). */
export type PublicMeetup = Omit<Meetup, 'ownerToken'>

/** Strip the secret ownerToken — explicit build avoids unused-var lint. */
export function meetupToPublic(m: Meetup): PublicMeetup {
  return {
    id: m.id, lat: m.lat, lng: m.lng, title: m.title, date: m.date,
    organizer: m.organizer, organizerPhone: m.organizerPhone, organizerEmail: m.organizerEmail,
    facebook: m.facebook, createdAt: m.createdAt, followers: m.followers,
  }
}

const KEY          = 'teslaradar:meetups:v1'
const SUBS_KEY     = 'teslaradar:meetup-subs'
const REMINDED_KEY = 'teslaradar:meetup-reminded'
const MAX_MEETUPS  = 500
const KEEP_PAST_MS = 24 * 60 * 60 * 1000

let _mem: Meetup[] = []
let _memSubs: string[] = []
let _memReminded: string[] = []

function _prune(list: Meetup[]): Meetup[] {
  const cutoff = Date.now() - KEEP_PAST_MS
  return list.filter((m) => {
    const t = new Date(m.date).getTime()
    return isNaN(t) || t > cutoff
  })
}

async function _readAll(): Promise<Meetup[]> {
  if (isRedisConfigured()) return (await redis.get<Meetup[]>(KEY)) ?? []
  return _mem
}
async function _write(list: Meetup[]): Promise<void> {
  if (isRedisConfigured()) await redis.set(KEY, list); else _mem = list
}

export const meetupStore = {
  /** Internal full records (with ownerToken). */
  async getAllRaw(): Promise<Meetup[]> {
    const raw = await _readAll()
    const pruned = _prune(raw)
    if (pruned.length < raw.length) _write(pruned).catch(() => {})
    return pruned.sort((a, b) => a.date.localeCompare(b.date))
  },

  /** Public list (ownerToken stripped). */
  async getAll(): Promise<PublicMeetup[]> {
    const all = await this.getAllRaw()
    return all.map(meetupToPublic)
  },

  async add(m: Meetup): Promise<void> {
    let all = _prune(await _readAll())
    if (all.length >= MAX_MEETUPS) all = all.sort((a, b) => a.createdAt.localeCompare(b.createdAt)).slice(1)
    all.push(m)
    await _write(all)
  },

  /** Update editable fields if ownerToken matches. Returns updated public record or null. */
  async update(id: string, ownerToken: string, patch: Partial<Pick<Meetup,
    'title' | 'date' | 'organizer' | 'organizerPhone' | 'organizerEmail' | 'facebook' | 'lat' | 'lng'>>,
  ): Promise<PublicMeetup | null> {
    const all = _prune(await _readAll())
    const m = all.find((x) => x.id === id)
    if (!m || m.ownerToken !== ownerToken) return null
    Object.assign(m, patch)
    await _write(all)
    return meetupToPublic(m)
  },

  async addFollower(id: string, email: string): Promise<boolean> {
    const all = _prune(await _readAll())
    const m = all.find((x) => x.id === id)
    if (!m) return false
    if (!m.followers.includes(email)) m.followers.push(email)
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

  // ── Global subscribers (remind about every event) ────────────────
  async addSubscriber(email: string): Promise<void> {
    if (isRedisConfigured()) {
      const subs = (await redis.get<string[]>(SUBS_KEY)) ?? []
      if (!subs.includes(email)) { subs.push(email); await redis.set(SUBS_KEY, subs) }
    } else if (!_memSubs.includes(email)) { _memSubs.push(email) }
  },
  async getSubscribers(): Promise<string[]> {
    if (isRedisConfigured()) return (await redis.get<string[]>(SUBS_KEY)) ?? []
    return _memSubs
  },

  // ── Reminder dedup ───────────────────────────────────────────────
  async wasReminded(tag: string): Promise<boolean> {
    if (isRedisConfigured()) return ((await redis.get<string[]>(REMINDED_KEY)) ?? []).includes(tag)
    return _memReminded.includes(tag)
  },
  async markReminded(tag: string): Promise<void> {
    if (isRedisConfigured()) {
      const list = (await redis.get<string[]>(REMINDED_KEY)) ?? []
      if (!list.includes(tag)) { list.push(tag); await redis.set(REMINDED_KEY, list.slice(-2000)) }
    } else { _memReminded.push(tag) }
  },
}
