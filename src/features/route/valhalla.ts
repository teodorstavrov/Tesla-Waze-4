// ─── Valhalla routing client ────────────────────────────────────────────
//
// Replaces the public OSRM demo server.
// Uses the FOSSGIS public Valhalla instance (https://valhalla1.openstreetmap.de)
// which runs on OSM data updated weekly — more current than the OSRM demo server.
//
// Key advantage: properly routes via newer motorways (e.g. A2 Hemus, Bulgaria)
// that may be missing or blocked in the OSRM demo server's snapshot.
//
// Valhalla uses encoded polyline6 (precision 6, factor 1e6) for geometry.
// We decode to [lat, lng] pairs for Leaflet.

import type { Route, RouteStep } from './types.js'

const VALHALLA_BASE      = '/api/route'  // proxy — avoids CORS/connection issues on Tesla browser
const ROUTE_CACHE_TTL_MS = 30 * 60 * 1000

// ── Client-side cache ──────────────────────────────────────────────────
const _cache = new Map<string, { routes: Route[]; expiresAt: number }>()

function _snap(n: number): number { return Math.round(n * 200) / 200 }
function _cacheKey(o: [number, number], d: [number, number]): string {
  return `${_snap(o[0])},${_snap(o[1])}-${_snap(d[0])},${_snap(d[1])}`
}

// ── Encoded polyline 6 decoder (Valhalla default precision) ────────────

function decodePoly6(encoded: string): [number, number][] {
  const coords: [number, number][] = []
  let i = 0, lat = 0, lng = 0

  while (i < encoded.length) {
    let b: number, shift = 0, val = 0
    do { b = encoded.charCodeAt(i++) - 63; val |= (b & 0x1f) << shift; shift += 5 } while (b >= 0x20)
    lat += (val & 1) ? ~(val >> 1) : val >> 1

    shift = 0; val = 0
    do { b = encoded.charCodeAt(i++) - 63; val |= (b & 0x1f) << shift; shift += 5 } while (b >= 0x20)
    lng += (val & 1) ? ~(val >> 1) : val >> 1

    coords.push([lat / 1e6, lng / 1e6])
  }
  return coords
}

// ── Valhalla maneuver type → RouteStep {type, modifier} ───────────────
// Valhalla numeric types: https://valhalla.github.io/valhalla/api/turn-by-turn/api-reference/

function mapManeuver(type: number): { type: string; modifier?: string } {
  switch (type) {
    case 1: case 2: case 3:  return { type: 'depart' }
    case 4: case 5: case 6:  return { type: 'arrive' }
    case 7: case 8:          return { type: 'turn',     modifier: 'straight' }
    case 9:                  return { type: 'turn',     modifier: 'slight right' }
    case 10:                 return { type: 'turn',     modifier: 'right' }
    case 11:                 return { type: 'turn',     modifier: 'sharp right' }
    case 12: case 13:        return { type: 'turn',     modifier: 'uturn' }
    case 14:                 return { type: 'turn',     modifier: 'sharp left' }
    case 15:                 return { type: 'turn',     modifier: 'left' }
    case 16:                 return { type: 'turn',     modifier: 'slight left' }
    case 17:                 return { type: 'on ramp',  modifier: 'straight' }
    case 18:                 return { type: 'on ramp',  modifier: 'right' }
    case 19:                 return { type: 'on ramp',  modifier: 'left' }
    case 20:                 return { type: 'off ramp', modifier: 'right' }
    case 21:                 return { type: 'off ramp', modifier: 'left' }
    case 22:                 return { type: 'fork',     modifier: 'straight' }
    case 23:                 return { type: 'fork',     modifier: 'right' }
    case 24:                 return { type: 'fork',     modifier: 'left' }
    case 25: case 37: case 38: return { type: 'merge',  modifier: 'straight' }
    case 26:                 return { type: 'roundabout' }
    case 27:                 return { type: 'exit roundabout' }
    default:                 return { type: 'turn',     modifier: 'straight' }
  }
}

// ── Valhalla response types ────────────────────────────────────────────

interface VManeuver {
  type:                  number
  begin_shape_index:     number
  length:                number    // km
  time:                  number    // seconds
  street_names?:         string[]
  roundabout_exit_count?: number
}

interface VTrip {
  summary: { length: number; time: number }
  legs:    Array<{ shape: string; maneuvers: VManeuver[] }>
}

interface VResponse {
  trip:       VTrip
  alternates?: Array<{ trip: VTrip }>
}

// ── A2 Hemus through-waypoint (В.Търново junction on E772) ────────────
// OSM gap: Ябланица→В.Търново section is incomplete in the DB.
// Forcing a through-waypoint here makes Valhalla stitch the available
// A2 segments instead of falling back to A1 Тракия.
const HEMUS_WAYPOINT: [number, number] = [43.0870, 25.6172]

// ── Trip parser ────────────────────────────────────────────────────────

function parseTrip(trip: VTrip): Route {
  const leg      = trip.legs[0]!
  const polyline = decodePoly6(leg.shape)

  const steps: RouteStep[] = leg.maneuvers.map((m) => {
    const { type, modifier } = mapManeuver(m.type)
    const pt = polyline[m.begin_shape_index] ?? polyline[0]!
    return {
      lat:       pt[0],
      lng:       pt[1],
      type,
      modifier,
      exit:      m.type === 26 ? (m.roundabout_exit_count ?? undefined) : undefined,
      name:      m.street_names?.[0] ?? '',
      distanceM: Math.round(m.length * 1000),
      durationS: Math.round(m.time),
    }
  })

  return {
    polyline,
    distanceM: Math.round(trip.summary.length * 1000),
    durationS: Math.round(trip.summary.time),
    steps,
  }
}

// ── Multi-leg trip parser (used when through-waypoints are present) ───
// Valhalla emits one leg per break/through segment.
// We decode each leg's shape separately, merge them into one polyline
// (skipping the duplicate point at each join), and map maneuver
// begin_shape_index values to the merged array.

function parseTripMultiLeg(trip: VTrip): Route {
  if (trip.legs.length === 1) return parseTrip(trip)

  const steps: RouteStep[] = []
  let fullPolyline: [number, number][] = []

  for (let li = 0; li < trip.legs.length; li++) {
    const leg      = trip.legs[li]!
    const legPoly  = decodePoly6(leg.shape)
    const isLast   = li === trip.legs.length - 1

    // legStartInFull: index in fullPolyline where this leg's shape[0] lives.
    // For leg 0 it's 0; for subsequent legs the through-waypoint is the
    // last point already appended, so offset = fullPolyline.length - 1.
    const legStartInFull = li === 0 ? 0 : fullPolyline.length - 1

    if (li === 0) {
      fullPolyline = [...legPoly]
    } else {
      // leg[0] == previous leg's last point — skip to avoid duplicate
      fullPolyline = fullPolyline.concat(legPoly.slice(1))
    }

    for (const m of leg.maneuvers) {
      // Skip the intermediate "arrive" maneuver at through-waypoints
      if (!isLast && (m.type === 4 || m.type === 5 || m.type === 6)) continue

      const { type, modifier } = mapManeuver(m.type)
      const absIdx = legStartInFull + m.begin_shape_index
      const pt     = fullPolyline[absIdx] ?? fullPolyline[0]!
      steps.push({
        lat:       pt[0],
        lng:       pt[1],
        type,
        modifier,
        exit:      m.type === 26 ? (m.roundabout_exit_count ?? undefined) : undefined,
        name:      m.street_names?.[0] ?? '',
        distanceM: Math.round(m.length * 1000),
        durationS: Math.round(m.time),
      })
    }
  }

  return {
    polyline:  fullPolyline,
    distanceM: Math.round(trip.summary.length * 1000),
    durationS: Math.round(trip.summary.time),
    steps,
  }
}

// ── Public API — same signature as the old OSRM client ─────────────────

export async function fetchRoute(
  origin:       [number, number],  // [lat, lng]
  dest:         [number, number],  // [lat, lng]
  signal?:      AbortSignal,
  alternatives: number = 2,
): Promise<Route[]> {
  const cacheKey = _cacheKey(origin, dest)
  const hit = _cache.get(cacheKey)
  if (hit && Date.now() < hit.expiresAt) return hit.routes

  const body = JSON.stringify({
    locations: [
      { lat: origin[0], lon: origin[1], type: 'break',                   search_cutoff: 500 },
      { lat: dest[0],   lon: dest[1],   type: 'break', street_side_tolerance: 50, search_cutoff: 1000 },
    ],
    costing: 'auto',
    costing_options: {
      auto: {
        use_highways:       0.8,
        use_living_streets: 0.6,
        service_penalty:    15,
      },
    },
    alternates: alternatives,
  })

  const timeoutSignal = AbortSignal.timeout(12_000)
  const combinedSignal: AbortSignal = signal && 'any' in AbortSignal
    ? (AbortSignal as unknown as { any: (s: AbortSignal[]) => AbortSignal }).any([signal, timeoutSignal])
    : signal ?? timeoutSignal

  const res = await fetch(VALHALLA_BASE, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body,
    signal: combinedSignal,
  })
  if (!res.ok) {
    const txt = await res.text().catch(() => '')
    throw new Error(`Valhalla ${res.status}: ${txt.slice(0, 120)}`)
  }

  const data = (await res.json()) as VResponse
  const routes: Route[] = [parseTrip(data.trip)]
  for (const alt of data.alternates ?? []) routes.push(parseTrip(alt.trip))

  if (_cache.size >= 20) _cache.delete(_cache.keys().next().value!)
  _cache.set(cacheKey, { routes, expiresAt: Date.now() + ROUTE_CACHE_TTL_MS })

  return routes
}

// Backward-compatible alias (routeStore imports this name)
export { fetchRoute as fetchOSRMRoute }

// ── Via Хемус variant — forces a through-waypoint on A2 ───────────────

export async function fetchRouteViaHemus(
  origin:  [number, number],
  dest:    [number, number],
  signal?: AbortSignal,
): Promise<Route[]> {
  const cacheKey = _cacheKey(origin, dest) + ':hemus'
  const hit = _cache.get(cacheKey)
  if (hit && Date.now() < hit.expiresAt) return hit.routes

  const body = JSON.stringify({
    locations: [
      { lat: origin[0],         lon: origin[1],         type: 'break',   search_cutoff: 500 },
      { lat: HEMUS_WAYPOINT[0], lon: HEMUS_WAYPOINT[1], type: 'through' },
      { lat: dest[0],           lon: dest[1],            type: 'break',  street_side_tolerance: 50, search_cutoff: 1000 },
    ],
    costing: 'auto',
    costing_options: {
      auto: {
        use_highways:       0.8,
        use_living_streets: 0.6,
        service_penalty:    15,
      },
    },
    alternates: 0,
  })

  const timeoutSignal = AbortSignal.timeout(12_000)
  const combinedSignal: AbortSignal = signal && 'any' in AbortSignal
    ? (AbortSignal as unknown as { any: (s: AbortSignal[]) => AbortSignal }).any([signal, timeoutSignal])
    : signal ?? timeoutSignal

  const res = await fetch(VALHALLA_BASE, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body,
    signal: combinedSignal,
  })
  if (!res.ok) {
    const txt = await res.text().catch(() => '')
    throw new Error(`Valhalla ${res.status}: ${txt.slice(0, 120)}`)
  }

  const data   = (await res.json()) as VResponse
  const routes = [parseTripMultiLeg(data.trip)]

  if (_cache.size >= 20) _cache.delete(_cache.keys().next().value!)
  _cache.set(cacheKey, { routes, expiresAt: Date.now() + ROUTE_CACHE_TTL_MS })
  return routes
}
