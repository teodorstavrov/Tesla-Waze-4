// ─── Speed Limit Store ───────────────────────────────────────────────────
//
// Fetches the current road speed limit from OpenStreetMap (Overpass API)
// based on the user's GPS position. Works worldwide — Norway, Bulgaria, etc.
//
// Strategy:
//  1. Re-fetches every FETCH_THRESHOLD_M meters of movement
//  2. Queries ALL road ways within SEARCH_RADIUS_M — no maxspeed filter
//  3. Picks the highest-priority road (motorway > trunk > primary > ...)
//  4. Uses maxspeed tag if present; falls back to country + road-type default
//  5. Never resets to null mid-trip — keeps last known value while re-fetching
//
// Data source: OpenStreetMap via Overpass API
// Accuracy note: depends on OSM tagging quality in the current country.
// Segments with explicit maxspeed tags are precise. Untagged segments
// fall back to national road-type defaults (e.g. BG motorway = 140 km/h).

import { gpsStore } from '@/features/gps/gpsStore'
import { countryStore } from '@/lib/countryStore'

// ── Constants ────────────────────────────────────────────────────────────
const FETCH_THRESHOLD_M = 50    // re-fetch after 50 m movement (was 100)
const SEARCH_RADIUS_M   = 40    // query radius around GPS position
const OVERPASS_URL      = 'https://overpass-api.de/api/interpreter'
const REQUEST_TIMEOUT   = 8_000 // ms

// ── Highway priority (lower = more important road) ────────────────────────
const HIGHWAY_PRIORITY: Record<string, number> = {
  motorway:       1,
  motorway_link:  2,
  trunk:          3,
  trunk_link:     4,
  primary:        5,
  primary_link:   6,
  secondary:      7,
  secondary_link: 8,
  tertiary:       9,
  tertiary_link: 10,
  residential:   11,
  living_street: 12,
  service:       13,
  unclassified:  14,
  road:          15,
}

// ── Country + road-type speed defaults (km/h) ────────────────────────────
// Used when the OSM way has no maxspeed tag.
// Reference: https://wiki.openstreetmap.org/wiki/Speed_limits
const HIGHWAY_DEFAULTS: Record<string, Partial<Record<string, number>>> = {
  BG: {
    motorway: 140, motorway_link: 80,
    trunk: 120,    trunk_link: 60,
    primary: 90,   primary_link: 70,
    secondary: 90, secondary_link: 70,
    tertiary: 90,  residential: 50,
    living_street: 20, service: 30, unclassified: 70,
  },
  NO: {
    motorway: 110, motorway_link: 70,
    trunk: 90,     trunk_link: 70,
    primary: 80,   secondary: 80,
    tertiary: 80,  residential: 50,
    living_street: 10, service: 30, unclassified: 60,
  },
  SE: {
    motorway: 120, motorway_link: 80,
    trunk: 110,    trunk_link: 80,
    primary: 90,   secondary: 80,
    tertiary: 70,  residential: 50,
    living_street: 30, service: 30, unclassified: 70,
  },
  FI: {
    motorway: 120, motorway_link: 80,
    trunk: 100,    trunk_link: 80,
    primary: 80,   secondary: 80,
    tertiary: 80,  residential: 50,
    living_street: 20, service: 30, unclassified: 70,
  },
}

// Generic fallback when country not in table
const GENERIC_DEFAULTS: Partial<Record<string, number>> = {
  motorway: 130, motorway_link: 80,
  trunk: 110,    trunk_link: 80,
  primary: 90,   secondary: 80,
  tertiary: 70,  residential: 50,
  living_street: 20, service: 30,
}

// ── Zone-key parser (e.g. "NO:urban", "BG:motorway") ─────────────────────
const ZONE_DEFAULTS: Record<string, Record<string, number>> = {
  NO: { urban: 50, rural: 80, motorway: 110, living_street: 10 },
  BG: { urban: 50, rural: 90, motorway: 140, living_street: 20 },
  DE: { urban: 50, rural: 100, motorway: 130, living_street: 7 },
  FR: { urban: 50, rural: 80,  motorway: 130, living_street: 20 },
  PL: { urban: 50, rural: 90,  motorway: 140, living_street: 20 },
  RO: { urban: 50, rural: 90,  motorway: 130, living_street: 20 },
  GB: { urban: 48, rural: 96,  motorway: 112, living_street: 16 },
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

// ── Best limit from a list of OSM way tag objects ─────────────────────────
function bestLimit(
  elements: Array<{ tags?: Record<string, string> }>,
  countryCode: string,
): number | null {
  // Collect (priority, limit) pairs from all ways
  const candidates: Array<{ priority: number; limit: number }> = []

  for (const el of elements) {
    const tags = el.tags ?? {}
    const hw   = tags.highway ?? ''
    const priority = HIGHWAY_PRIORITY[hw] ?? 99

    // Prefer explicit maxspeed tag
    const raw = tags.maxspeed ?? tags['maxspeed:forward']
    let limit: number | null = raw ? parseMaxspeed(raw) : null

    // Fall back to country + road-type default
    if (limit === null) {
      const countryDefaults = HIGHWAY_DEFAULTS[countryCode] ?? GENERIC_DEFAULTS
      limit = countryDefaults[hw] ?? null
    }

    if (limit !== null) {
      candidates.push({ priority, limit })
    }
  }

  if (candidates.length === 0) return null

  // Pick the candidate from the highest-priority road
  candidates.sort((a, b) => a.priority - b.priority)
  return candidates[0]!.limit
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
      // Query ALL road ways within radius — no maxspeed filter.
      // We apply road-type defaults for untagged ways in bestLimit().
      const query =
        `[out:json][timeout:7];` +
        `way(around:${SEARCH_RADIUS_M},${lat},${lng})[highway~"^(motorway|motorway_link|trunk|trunk_link|primary|primary_link|secondary|secondary_link|tertiary|tertiary_link|residential|living_street|unclassified|service|road)$"];` +
        `out tags 10;`

      const res = await fetch(OVERPASS_URL, {
        method:  'POST',
        body:    `data=${encodeURIComponent(query)}`,
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        signal:  controller.signal,
      })

      if (!res.ok) return  // keep last known limit on error

      const json: { elements?: Array<{ tags?: Record<string, string> }> } =
        await res.json()

      const countryCode = countryStore.getCode() ?? 'BG'
      const found = bestLimit(json.elements ?? [], countryCode)

      // Only update if changed — avoids unnecessary React re-renders.
      // If found is null (no road detected) keep the last known limit
      // so the sign doesn't flicker empty mid-trip.
      if (found !== null && found !== this.limit) {
        this.limit = found
        this.notify()
      }
    } catch {
      // Network error / timeout / AbortError — keep last known limit
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
