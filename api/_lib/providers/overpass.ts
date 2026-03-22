// ─── OpenStreetMap / Overpass provider ────────────────────────────────
//
// Queries OSM via Overpass API for amenity=charging_station nodes/ways
// within the bbox. OSM has excellent Bulgarian coverage from local mappers.
//
// Cached per-bbox for 30 minutes — OSM map data changes slowly.
//
// Uses the public Overpass API endpoint (free, no auth required).
// If overpass-api.de is slow, an alternative is overpass.kumi.systems.

import type { BBox } from '../utils/bbox.js'
import { toOverpassBBox, bboxCacheKey, quantizeBBox } from '../utils/bbox.js'
import { fetchWithTimeout, errorMessage } from '../utils/request.js'
import { cacheGet, cacheSet } from '../cache/memory.js'
import type { NormalizedStation, ProviderResult, Connector } from '../normalize/types.js'

const CACHE_TTL_MS = 30 * 60 * 1000  // 30 minutes
const FETCH_TIMEOUT_MS = 15_000       // Overpass can be slow on complex queries
const OVERPASS_URL = 'https://overpass-api.de/api/interpreter'
const OVERPASS_FALLBACK = 'https://overpass.kumi.systems/api/interpreter'

// ── Raw Overpass types ────────────────────────────────────────────

type OverpassTags = Record<string, string | undefined>

interface OverpassNode {
  type: 'node'
  id: number
  lat: number
  lon: number
  tags: OverpassTags
}

interface OverpassWay {
  type: 'way' | 'relation'
  id: number
  center?: { lat: number; lon: number }
  tags: OverpassTags
}

type OverpassElement = OverpassNode | OverpassWay

interface OverpassResponse {
  elements: OverpassElement[]
}

// ── Normalize ─────────────────────────────────────────────────────

function getCoords(el: OverpassElement): { lat: number; lon: number } | null {
  if (el.type === 'node') return { lat: el.lat, lon: el.lon }
  if (el.center) return el.center
  return null
}

function parseSocketCount(tags: OverpassTags, key: string): number {
  const v = tags[key]
  if (!v) return 0
  const n = parseInt(v, 10)
  return isFinite(n) && n > 0 ? n : 1
}

function parsePowerKw(tags: OverpassTags): number | null {
  // maxpower is in watts in OSM convention
  const raw = tags['maxpower'] ?? tags['charging:power']
  if (!raw) return null
  const n = parseFloat(raw.replace(/[^\d.]/g, ''))
  if (!isFinite(n) || n <= 0) return null
  // If the value looks like it's already in kW (< 1000), keep it; else convert from W
  return n > 1000 ? Math.round(n / 1000) : n
}

function extractConnectors(tags: OverpassTags): Connector[] {
  const connectors: Connector[] = []
  const powerKw = parsePowerKw(tags)

  const socketMap: Array<[string, string]> = [
    ['socket:ccs',                   'CCS'],
    ['socket:type2_combo',           'CCS'],
    ['socket:chademo',               'CHAdeMO'],
    ['socket:type2',                 'Type2'],
    ['socket:type2_cable',           'Type2'],
    ['socket:tesla_supercharger',    'Tesla'],
    ['socket:tesla_ccs',             'CCS'],
    ['socket:type1',                 'Type1'],
    ['socket:type1_cable',           'Type1'],
    ['socket:schuko',                'Schuko'],
  ]

  for (const [key, type] of socketMap) {
    const count = parseSocketCount(tags, key)
    if (count > 0) connectors.push({ type, powerKw, count })
  }

  // Fallback: if no sockets found, infer from capacity
  if (connectors.length === 0) {
    const capacity = parseInt(tags['capacity'] ?? '1', 10)
    connectors.push({ type: 'Other', powerKw, count: isFinite(capacity) ? capacity : 1 })
  }

  return connectors
}

function normalizeStatus(tags: OverpassTags): NormalizedStation['status'] {
  const disused = tags['disused:amenity'] ?? tags['disused']
  if (disused) return 'offline'
  const opening = (tags['opening_hours'] ?? '').toLowerCase()
  if (opening === 'planned' || tags['planned:amenity']) return 'planned'
  return 'available'  // OSM doesn't typically encode real-time status
}

function normalize(el: OverpassElement): NormalizedStation | null {
  const coords = getCoords(el)
  if (!coords) return null

  const { lat, lon: lng } = coords
  if (!isFinite(lat) || !isFinite(lng)) return null

  const tags = el.tags ?? {}
  const connectors = extractConnectors(tags)
  const maxPowerKw = connectors.reduce<number | null>((max, c) => {
    if (c.powerKw == null) return max
    return max == null ? c.powerKw : Math.max(max, c.powerKw)
  }, null)

  const name =
    tags['name'] ??
    tags['operator'] ??
    tags['network'] ??
    tags['brand'] ??
    'Charging Station'

  const totalPorts = connectors.reduce((s, c) => s + c.count, 0)
  const isFree = tags['fee'] === 'no' ? true : tags['fee'] === 'yes' ? false : null

  return {
    id: `osm:${el.id}`,
    source: 'osm',
    externalId: String(el.id),
    name,
    lat,
    lng,
    address: tags['addr:street'] ?? null,
    city: tags['addr:city'] ?? null,
    country: 'BG',
    network: tags['network'] ?? tags['operator'] ?? null,
    totalPorts,
    availablePorts: null,
    maxPowerKw,
    connectors,
    status: normalizeStatus(tags),
    isFree,
    lastUpdated: null,
  }
}

// ── Overpass QL query ─────────────────────────────────────────────

function buildQuery(bboxStr: string): string {
  return [
    '[out:json][timeout:25];',
    '(',
    `  node["amenity"="charging_station"](${bboxStr});`,
    `  way["amenity"="charging_station"](${bboxStr});`,
    ');',
    'out body center qt;',  // center gives lat/lng for ways
  ].join('\n')
}

async function queryOverpass(query: string, url: string): Promise<OverpassResponse> {
  const res = await fetchWithTimeout(
    url,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: `data=${encodeURIComponent(query)}`,
    },
    FETCH_TIMEOUT_MS,
  )

  if (!res.ok) throw new Error(`Overpass HTTP ${res.status}`)
  return res.json() as Promise<OverpassResponse>
}

// ── Public API ────────────────────────────────────────────────────

export async function fetchOverpassStations(bbox: BBox): Promise<ProviderResult> {
  const t0 = Date.now()
  const qbbox = quantizeBBox(bbox)
  const key = bboxCacheKey('osm', qbbox)

  try {
    const cached = cacheGet<NormalizedStation[]>(key)
    if (cached) {
      return { source: 'osm', stations: cached, meta: { status: 'ok', count: cached.length, fetchMs: 0 } }
    }

    const bboxStr = toOverpassBBox(qbbox)
    const query = buildQuery(bboxStr)

    // Try primary, fallback to mirror on error
    let data: OverpassResponse
    try {
      data = await queryOverpass(query, OVERPASS_URL)
    } catch {
      data = await queryOverpass(query, OVERPASS_FALLBACK)
    }

    const stations: NormalizedStation[] = []
    for (const el of data.elements) {
      const station = normalize(el)
      if (station) stations.push(station)
    }

    cacheSet(key, stations, CACHE_TTL_MS)

    return {
      source: 'osm',
      stations,
      meta: { status: stations.length === 0 ? 'empty' : 'ok', count: stations.length, fetchMs: Date.now() - t0 },
    }
  } catch (err) {
    return {
      source: 'osm',
      stations: [],
      meta: { status: 'error', count: 0, error: errorMessage(err), fetchMs: Date.now() - t0 },
    }
  }
}
