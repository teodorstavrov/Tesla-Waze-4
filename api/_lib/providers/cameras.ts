// ─── Speed Camera provider (OpenStreetMap / Overpass) ─────────────────
//
// Queries OSM for highway=speed_camera nodes within any bbox.
// Speed cameras change rarely — cached 24 hours server-side per country.
// Fallback to mirror endpoint on Overpass primary failure.

import { fetchWithTimeout, errorMessage } from '../utils/request.js'
import { cacheGet, cacheSet } from '../cache/memory.js'
import type { BBox } from '../utils/bbox.js'
import { toOverpassBBox } from '../utils/bbox.js'

export interface SpeedCamera {
  id:       string
  lat:      number
  lng:      number
  maxspeed: number | null   // enforced speed limit (km/h) if tagged in OSM
  direction: number | null  // camera facing direction in degrees (0=N, 90=E)
}

const CACHE_TTL_MS    = 24 * 60 * 60 * 1000  // 24 hours — cameras rarely change
const FETCH_TIMEOUT   = 20_000
const OVERPASS_URL    = 'https://overpass-api.de/api/interpreter'
const OVERPASS_MIRROR = 'https://overpass.kumi.systems/api/interpreter'

function buildQuery(bboxStr: string): string {
  return [
    '[out:json][timeout:25];',
    '(',
    `  node["highway"="speed_camera"](${bboxStr});`,
    `  node["enforcement"="maxspeed"](${bboxStr});`,
    ');',
    'out body qt;',
  ].join('\n')
}

interface OverpassNode {
  id: number
  lat: number
  lon: number
  tags?: Record<string, string | undefined>
}

interface OverpassResponse {
  elements: OverpassNode[]
}

async function query(q: string, url: string): Promise<OverpassResponse> {
  const res = await fetchWithTimeout(
    url,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: `data=${encodeURIComponent(q)}`,
    },
    FETCH_TIMEOUT,
  )
  if (!res.ok) throw new Error(`Overpass HTTP ${res.status}`)
  return res.json() as Promise<OverpassResponse>
}

function normalize(el: OverpassNode): SpeedCamera | null {
  if (!isFinite(el.lat) || !isFinite(el.lon)) return null
  const tags = el.tags ?? {}

  const rawSpeed = tags['maxspeed:enforcement'] ?? tags['maxspeed']
  const maxspeed = rawSpeed ? parseInt(rawSpeed, 10) : null

  const rawDir = tags['direction']
  const direction = rawDir ? parseFloat(rawDir) : null

  return {
    id:        `cam:${el.id}`,
    lat:       el.lat,
    lng:       el.lon,
    maxspeed:  maxspeed != null && isFinite(maxspeed) ? maxspeed : null,
    direction: direction != null && isFinite(direction) ? direction : null,
  }
}

export async function fetchCameras(bbox: BBox, cacheKey: string): Promise<SpeedCamera[]> {
  const cached = cacheGet<SpeedCamera[]>(cacheKey)
  if (cached) return cached

  const bboxStr = toOverpassBBox(bbox)
  const q = buildQuery(bboxStr)

  let data: OverpassResponse
  try {
    data = await query(q, OVERPASS_URL)
  } catch {
    data = await query(q, OVERPASS_MIRROR)
  }

  const cameras: SpeedCamera[] = []
  for (const el of data.elements) {
    const cam = normalize(el)
    if (cam) cameras.push(cam)
  }

  cacheSet(cacheKey, cameras, CACHE_TTL_MS)
  return cameras
}
