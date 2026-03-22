// ─── Tesla Supercharger provider ──────────────────────────────────────
//
// Data source: OpenStreetMap via Overpass — Tesla-specific query
//
// OSM mappers diligently tag Tesla Superchargers with:
//   network=Tesla  or  operator=Tesla  or  brand=Tesla
//
// We query ONLY Tesla-tagged nodes/ways — a small, fast query (~5-20
// results for Bulgaria). This gives us:
//   • Correct `source: 'tesla'` labeling
//   • Priority over the general OSM provider in dedup (tesla > osm)
//   • All OSM attributes (connector types, power, stall counts)
//
// The general Overpass provider queries ALL charging stations and would
// include Tesla stations too (as source: 'osm'). The 80m dedup keeps the
// Tesla-sourced record and discards the OSM duplicate.
//
// Cached 2 hours per bbox — Supercharger locations rarely change.

import type { BBox } from '../utils/bbox.js'
import { toOverpassBBox, bboxCacheKey, quantizeBBox } from '../utils/bbox.js'
import { fetchWithTimeout, errorMessage } from '../utils/request.js'
import { cacheGet, cacheSet } from '../cache/memory.js'
import type { NormalizedStation, ProviderResult, Connector } from '../normalize/types.js'

const CACHE_TTL_MS = 2 * 60 * 60 * 1000   // 2 hours
const FETCH_TIMEOUT_MS = 12_000
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
  return el.center ?? null
}

function parseSocketCount(tags: OverpassTags, key: string): number {
  const v = tags[key]
  if (!v) return 0
  const n = parseInt(v, 10)
  return isFinite(n) && n > 0 ? n : 1
}

function extractConnectors(tags: OverpassTags): Connector[] {
  const connectors: Connector[] = []

  // Tesla-specific socket tags in OSM
  const teslaKeys: Array<[string, string]> = [
    ['socket:tesla_supercharger', 'Tesla'],
    ['socket:tesla_ccs',          'CCS'],
    ['socket:ccs',                'CCS'],
    ['socket:type2',              'Type2'],
  ]

  // Determine max power
  const maxpowerRaw = tags['maxpower']
  let powerKw: number | null = null
  if (maxpowerRaw) {
    const n = parseFloat(maxpowerRaw.replace(/[^\d.]/g, ''))
    if (isFinite(n) && n > 0) powerKw = n > 1000 ? Math.round(n / 1000) : n
  }
  // Default Tesla V3 power if none specified
  if (powerKw == null) powerKw = 250

  for (const [key, type] of teslaKeys) {
    const count = parseSocketCount(tags, key)
    if (count > 0) connectors.push({ type, powerKw, count })
  }

  // Fallback: check generic capacity tag
  if (connectors.length === 0) {
    const capacity = parseInt(tags['capacity'] ?? '0', 10)
    connectors.push({ type: 'Tesla', powerKw, count: capacity > 0 ? capacity : 1 })
  }

  return connectors
}

function normalize(el: OverpassElement): NormalizedStation | null {
  const coords = getCoords(el)
  if (!coords) return null

  const { lat, lon: lng } = coords
  if (!isFinite(lat) || !isFinite(lng)) return null

  const tags = el.tags ?? {}
  const connectors = extractConnectors(tags)
  const maxPowerKw = connectors.reduce<number | null>((m, c) =>
    c.powerKw == null ? m : m == null ? c.powerKw : Math.max(m, c.powerKw), null)
  const totalPorts = connectors.reduce((s, c) => s + c.count, 0)

  const name =
    tags['name'] ??
    tags['brand'] ??
    `Tesla Supercharger${tags['addr:city'] ? ` — ${tags['addr:city']}` : ''}`

  return {
    id: `tesla:osm:${el.id}`,
    source: 'tesla',
    externalId: `osm:${el.id}`,
    name,
    lat,
    lng,
    address: tags['addr:street'] ?? null,
    city: tags['addr:city'] ?? null,
    country: 'BG',
    network: 'Tesla',
    totalPorts,
    availablePorts: null,
    maxPowerKw,
    connectors,
    status: 'available',
    isFree: false,
    lastUpdated: null,
  }
}

// ── Overpass query — Tesla-specific ──────────────────────────────

function buildTeslaQuery(bboxStr: string): string {
  // Match nodes/ways with any Tesla-identifying tag
  return [
    '[out:json][timeout:20];',
    '(',
    // network=Tesla (most common tagging)
    `  node["amenity"="charging_station"]["network"="Tesla"](${bboxStr});`,
    `  way["amenity"="charging_station"]["network"="Tesla"](${bboxStr});`,
    // operator=Tesla (alternative tagging)
    `  node["amenity"="charging_station"]["operator"="Tesla"](${bboxStr});`,
    `  way["amenity"="charging_station"]["operator"="Tesla"](${bboxStr});`,
    // brand=Tesla
    `  node["amenity"="charging_station"]["brand"="Tesla"](${bboxStr});`,
    `  way["amenity"="charging_station"]["brand"="Tesla"](${bboxStr});`,
    ');',
    'out body center qt;',
  ].join('\n')
}

async function queryOverpass(query: string, url: string): Promise<OverpassResponse> {
  const res = await fetchWithTimeout(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `data=${encodeURIComponent(query)}`,
  }, FETCH_TIMEOUT_MS)
  if (!res.ok) throw new Error(`Overpass HTTP ${res.status}`)
  return res.json() as Promise<OverpassResponse>
}

// ── Public API ────────────────────────────────────────────────────

export async function fetchTeslaStations(bbox: BBox): Promise<ProviderResult> {
  const t0 = Date.now()
  const qbbox = quantizeBBox(bbox)
  const key = bboxCacheKey('tesla', qbbox)

  try {
    const cached = cacheGet<NormalizedStation[]>(key)
    if (cached) {
      return { source: 'tesla', stations: cached, meta: { status: 'ok', count: cached.length, fetchMs: 0 } }
    }

    const bboxStr = toOverpassBBox(qbbox)
    const query = buildTeslaQuery(bboxStr)

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
      source: 'tesla',
      stations,
      meta: { status: stations.length === 0 ? 'empty' : 'ok', count: stations.length, fetchMs: Date.now() - t0 },
    }
  } catch (err) {
    return {
      source: 'tesla',
      stations: [],
      meta: { status: 'error', count: 0, error: errorMessage(err), fetchMs: Date.now() - t0 },
    }
  }
}
