// ─── Speed Limit Store ───────────────────────────────────────────────────
//
// Fetches the current road speed limit from OpenStreetMap (Overpass API)
// based on the user's GPS position. Works worldwide — Norway, Bulgaria, etc.
//
// Strategy:
//  - Re-fetches only when GPS moves > FETCH_THRESHOLD_M meters from last fetch
//  - Queries for roads within 50 m with a maxspeed tag
//  - Parses numeric ("50"), mph ("30 mph"), and zone ("NO:urban", "BG:rural") values
//  - Exposes getLimit() + subscribe() — compatible with useSyncExternalStore

import { gpsStore } from '@/features/gps/gpsStore'

// ── Constants ────────────────────────────────────────────────────────────
const FETCH_THRESHOLD_M = 100   // re-fetch only after moving 100 m
const SEARCH_RADIUS_M   = 50    // OSM query radius around position
const OVERPASS_URL      = 'https://overpass-api.de/api/interpreter'
const REQUEST_TIMEOUT   = 7_000 // ms

// ── Country/zone default speed limits (km/h) ────────────────────────────
// Used when maxspeed is stored as a zone key like "NO:urban".
// Reference: https://wiki.openstreetmap.org/wiki/Speed_limits
const ZONE_DEFAULTS: Record<string, Record<string, number>> = {
  NO: { urban: 50, rural: 80, motorway: 110, living_street: 10 },
  BG: { urban: 50, rural: 90, motorway: 140, living_street: 20 },
  DE: { urban: 50, rural: 100, motorway: 130, living_street: 7  },
  FR: { urban: 50, rural: 80,  motorway: 130, living_street: 20 },
  PL: { urban: 50, rural: 90,  motorway: 140, living_street: 20 },
  RO: { urban: 50, rural: 90,  motorway: 130, living_street: 20 },
  GB: { urban: 48, rural: 96,  motorway: 112, living_street: 16 },  // mph converted
  US: { urban: 56, rural: 88,  motorway: 104, living_street: 40 },
}

// ── Parse maxspeed tag value ─────────────────────────────────────────────
export function parseMaxspeed(value: string): number | null {
  if (!value) return null
  const v = value.trim()

  // Plain number: "50" or "120"
  if (/^\d+$/.test(v)) return parseInt(v, 10)

  // "XX mph" — convert to km/h
  const mph = v.match(/^(\d+)\s*mph$/i)
  if (mph) return Math.round(parseInt(mph[1]) * 1.60934)

  // "CC:zone" e.g. "NO:urban", "BG:motorway"
  const zone = v.match(/^([A-Z]{2}):(.+)$/i)
  if (zone) {
    const country = zone[1].toUpperCase()
    const zoneKey = zone[2].toLowerCase().replace(/_speed$/, '')
    return ZONE_DEFAULTS[country]?.[zoneKey] ?? null
  }

  return null
}

// ── Haversine distance in metres ─────────────────────────────────────────
function distanceM(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
): number {
  const R    = 6_371_000
  const dLat = ((b.lat - a.lat) * Math.PI) / 180
  const dLng = ((b.lng - a.lng) * Math.PI) / 180
  const s    =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((a.lat * Math.PI) / 180) *
    Math.cos((b.lat * Math.PI) / 180) *
    Math.sin(dLng / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(s), Math.sqrt(1 - s))
}

// ── Store ────────────────────────────────────────────────────────────────
type Listener = () => void

class SpeedLimitStore {
  private limit: number | null = null
  private lastFetchPos: { lat: number; lng: number } | null = null
  private fetching = false
  private readonly listeners = new Set<Listener>()

  constructor() {
    gpsStore.onPosition((pos) => {
      if (
        this.lastFetchPos &&
        distanceM(this.lastFetchPos, pos) < FETCH_THRESHOLD_M
      ) return
      if (this.fetching) return

      this.lastFetchPos = { lat: pos.lat, lng: pos.lng }
      void this.fetchLimit(pos.lat, pos.lng)
    })
  }

  private async fetchLimit(lat: number, lng: number): Promise<void> {
    this.fetching = true
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT)

    try {
      const query =
        `[out:json][timeout:5];` +
        `way(around:${SEARCH_RADIUS_M},${lat},${lng})[highway][maxspeed];` +
        `out tags 1;`

      const res = await fetch(OVERPASS_URL, {
        method:  'POST',
        body:    `data=${encodeURIComponent(query)}`,
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        signal:  controller.signal,
      })

      if (!res.ok) return

      const json: { elements?: Array<{ tags?: Record<string, string> }> } =
        await res.json()

      let found: number | null = null
      for (const el of json.elements ?? []) {
        const raw = el.tags?.maxspeed
        if (raw) {
          const parsed = parseMaxspeed(raw)
          if (parsed !== null) { found = parsed; break }
        }
      }

      if (found !== this.limit) {
        this.limit = found
        this.notify()
      }
    } catch {
      // Network error / timeout / AbortError — silently ignore
    } finally {
      clearTimeout(timer)
      this.fetching = false
    }
  }

  /** Current speed limit in km/h, or null if unknown. */
  getLimit(): number | null {
    return this.limit
  }

  /** useSyncExternalStore-compatible subscribe. */
  subscribe(listener: Listener): () => void {
    this.listeners.add(listener)
    return () => { this.listeners.delete(listener) }
  }

  private notify() {
    this.listeners.forEach((fn) => fn())
  }
}

export const speedLimitStore = new SpeedLimitStore()
