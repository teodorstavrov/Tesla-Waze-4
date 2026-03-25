// ─── OSRM routing client ───────────────────────────────────────────────
//
// Uses the public OSRM demo server (project-osrm.org).
// For production traffic, replace with a self-hosted instance or
// a service like GraphHopper / OpenRouteService.
//
// GeoJSON convention is [lng, lat] — we reverse to Leaflet [lat, lng].
// Returns up to 3 routes (primary + 2 alternatives).

import type { Route, RouteStep } from './types.js'

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
  origin: [number, number],   // [lat, lng]
  dest:   [number, number],   // [lat, lng]
  signal?: AbortSignal,
): Promise<Route[]> {
  // OSRM coordinate order: lng,lat
  const coords = `${origin[1]},${origin[0]};${dest[1]},${dest[0]}`
  const url = `${OSRM_BASE}/${coords}?overview=full&geometries=geojson&steps=true&alternatives=2`

  const res = await fetch(url, { signal })
  if (!res.ok) throw new Error(`OSRM HTTP ${res.status}`)

  const data = (await res.json()) as OSRMResponse
  if (data.code !== 'Ok' || !data.routes.length) throw new Error('No route found')

  return data.routes.map((r) => ({
    polyline:  r.geometry.coordinates.map(([lng, lat]) => [lat, lng] as [number, number]),
    distanceM: r.distance,
    durationS: r.duration,
    steps:     r.legs[0] ? parseSteps(r.legs[0]) : [],
  }))
}
