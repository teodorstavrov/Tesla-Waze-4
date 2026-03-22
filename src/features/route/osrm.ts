// ─── OSRM routing client ───────────────────────────────────────────────
//
// Uses the public OSRM demo server (project-osrm.org).
// For production traffic, replace with a self-hosted instance or
// a service like GraphHopper / OpenRouteService.
//
// GeoJSON convention is [lng, lat] — we reverse to Leaflet [lat, lng].

import type { Route } from './types.js'

const OSRM_BASE = 'https://router.project-osrm.org/route/v1/driving'

interface OSRMResponse {
  code:   string
  routes: Array<{
    distance: number
    duration: number
    geometry: {
      coordinates: [number, number][]  // [lng, lat]
    }
  }>
}

export async function fetchOSRMRoute(
  origin: [number, number],   // [lat, lng]
  dest:   [number, number],   // [lat, lng]
  signal?: AbortSignal,
): Promise<Route> {
  // OSRM coordinate order: lng,lat
  const coords = `${origin[1]},${origin[0]};${dest[1]},${dest[0]}`
  const url = `${OSRM_BASE}/${coords}?overview=full&geometries=geojson&steps=false`

  const res = await fetch(url, { signal })
  if (!res.ok) throw new Error(`OSRM HTTP ${res.status}`)

  const data = (await res.json()) as OSRMResponse
  if (data.code !== 'Ok' || !data.routes.length) throw new Error('No route found')

  const r = data.routes[0]!
  return {
    // Reverse GeoJSON [lng, lat] → Leaflet [lat, lng]
    polyline:  r.geometry.coordinates.map(([lng, lat]) => [lat, lng] as [number, number]),
    distanceM: r.distance,
    durationS: r.duration,
  }
}
