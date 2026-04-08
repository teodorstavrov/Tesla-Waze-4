// ─── OSRM routing client ───────────────────────────────────────────────
//
// Uses the public OSRM demo server (project-osrm.org).
// For production traffic, replace with a self-hosted instance or
// a service like GraphHopper / OpenRouteService.
//
// GeoJSON convention is [lng, lat] — we reverse to Leaflet [lat, lng].
// Returns up to 3 routes (primary + 2 alternatives).
//
// CLIENT CACHE: routes cached 30 min by O/D pair (~500m grid snapping).
// Prevents re-fetching the same route when user re-navigates to the same
// destination or reroutes back to a recent origin. Saves OSRM quota.

import type { Route, RouteStep } from './types.js'

const _routeCache = new Map<string, { routes: Route[]; expiresAt: number }>()
const ROUTE_CACHE_TTL_MS = 30 * 60 * 1000  // 30 minutes

// Snap to ~500m grid to share cache across nearby origins
function _snap(n: number): number { return Math.round(n * 200) / 200 }
function _routeKey(o: [number, number], d: [number, number]): string {
  return `${_snap(o[0])},${_snap(o[1])}-${_snap(d[0])},${_snap(d[1])}`
}

const OSRM_BASE = 'https://router.project-osrm.org/route/v1/driving'

interface OSRMManeuver {
  type:      string
  modifier?: string
  location:  [number, number]  // [lng, lat]
}

interface OSRMStep {
  distance: number
  duration: number
  name:     string
  maneuver: OSRMManeuver
}

interface OSRMLeg {
  steps: OSRMStep[]
}

interface OSRMResponse {
  code:   string
  routes: Array<{
    distance: number
    duration: number
    geometry: { coordinates: [number, number][] }  // [lng, lat]
    legs:     OSRMLeg[]
  }>
}

function parseSteps(leg: OSRMLeg): RouteStep[] {
  return leg.steps.map((s): RouteStep => ({
    lat:       s.maneuver.location[1],  // GeoJSON → Leaflet
    lng:       s.maneuver.location[0],
    type:      s.maneuver.type,
    modifier:  s.maneuver.modifier,
    name:      s.name,
    distanceM: s.distance,
    durationS: s.duration,
  }))
}

export async function fetchOSRMRoute(
  origin:       [number, number],   // [lat, lng]
  dest:         [number, number],   // [lat, lng]
  signal?:      AbortSignal,
  alternatives: number = 2,
): Promise<Route[]> {
  // Client cache — same O/D pair within 30 min returns instantly
  const cacheKey = _routeKey(origin, dest)
  const hit = _routeCache.get(cacheKey)
  if (hit && Date.now() < hit.expiresAt) return hit.routes

  // OSRM coordinate order: lng,lat
  const coords = `${origin[1]},${origin[0]};${dest[1]},${dest[0]}`
  const url = `${OSRM_BASE}/${coords}?overview=full&geometries=geojson&steps=true&alternatives=${alternatives}`

  const res = await fetch(url, { signal })
  if (!res.ok) throw new Error(`OSRM HTTP ${res.status}`)

  const data = (await res.json()) as OSRMResponse
  if (data.code !== 'Ok' || !data.routes.length) throw new Error('No route found')

  const routes = data.routes.map((r) => ({
    polyline:  r.geometry.coordinates.map(([lng, lat]) => [lat, lng] as [number, number]),
    distanceM: r.distance,
    durationS: r.duration,
    steps:     r.legs[0] ? parseSteps(r.legs[0]) : [],
  }))

  // Evict oldest if over 20 cached routes (routes are large objects)
  if (_routeCache.size >= 20) {
    _routeCache.delete(_routeCache.keys().next().value!)
  }
  _routeCache.set(cacheKey, { routes, expiresAt: Date.now() + ROUTE_CACHE_TTL_MS })

  return routes
}
