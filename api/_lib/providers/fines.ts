// ─── Fines Charging provider ───────────────────────────────────────────
//
// Fetches Bulgaria-specific EV stations from the public Fines Charging API.
// Endpoint: GET https://public.finescharging.com/v1/locations.geojson
// No auth required; CORS-enabled; GeoJSON FeatureCollection.
// Cached for 5 minutes (data changes infrequently).
//
// All stations from this API are Fines Charging branded.
// Live availability is a separate endpoint (/v1/live.json) polled client-side.

import { fetchWithTimeout, errorMessage } from '../utils/request.js'
import { cacheGet, cacheSet } from '../cache/memory.js'
import type { NormalizedStation, ProviderResult, Connector } from '../normalize/types.js'

const CATALOG_URL  = 'https://public.finescharging.com/v1/locations.geojson'
const CACHE_KEY    = 'fines:catalog'
const CACHE_TTL_MS = 5 * 60 * 1000   // 5 minutes
const FETCH_TIMEOUT_MS = 15_000

// ── Raw types ─────────────────────────────────────────────────────────

interface FinesConnectors {
  [type: string]: number  // e.g. { "CCS": 2, "CHAdeMO": 1 }
}

interface FinesPriceRange {
  min?: number
  max?: number
  currency?: string
}

interface FinesProperties {
  name?: string
  address?: string
  city?: string
  max_power_kw?: number
  connectors?: FinesConnectors
  price_range?: FinesPriceRange
  restricted?: boolean
  status?: string
}

interface FinesFeature {
  type: 'Feature'
  id?: string | number
  geometry: {
    type: 'Point'
    coordinates: [number, number]  // [lng, lat]
  }
  properties: FinesProperties
}

interface FinesGeoJSON {
  type: 'FeatureCollection'
  features: FinesFeature[]
}

// ── Connector type normalization ──────────────────────────────────────

const CONNECTOR_TYPE_MAP: Record<string, string> = {
  ccs:      'CCS',
  ccs2:     'CCS',
  chademo:  'CHAdeMO',
  type2:    'Type2',
  type1:    'Type1',
  tesla:    'Tesla',
  schuko:   'Schuko',
  mennekes: 'Type2',
}

function normalizeConnectorType(raw: string): string {
  const key = raw.toLowerCase().replace(/[-_\s]/g, '')
  return CONNECTOR_TYPE_MAP[key] ?? raw
}

function extractConnectors(props: FinesProperties): Connector[] {
  if (!props.connectors) return []
  const powerKw = props.max_power_kw ?? null
  return Object.entries(props.connectors).map(([type, count]) => ({
    type:    normalizeConnectorType(type),
    powerKw: powerKw,
    count:   typeof count === 'number' && count > 0 ? count : 1,
  }))
}

// ── Normalize ─────────────────────────────────────────────────────────

function normalize(feature: FinesFeature, index: number): NormalizedStation {
  const props = feature.properties ?? {}
  const [lng, lat] = feature.geometry.coordinates
  const externalId = String(feature.id ?? `fines_${index}`)

  const connectors = extractConnectors(props)
  const totalPorts = connectors.reduce((sum, c) => sum + c.count, 0) || 1
  const maxPowerKw = props.max_power_kw ?? null

  const price       = props.price_range?.min ?? null
  const currency    = props.price_range?.currency ?? (price != null ? 'EUR' : null)
  const pricingText = price != null
    ? `${price}${props.price_range?.max != null ? `–${props.price_range.max}` : ''} ${currency ?? 'EUR'}/kWh`
    : null

  const rawStatus = props.status?.toLowerCase() ?? ''
  let status: NormalizedStation['status'] = 'unknown'
  if (rawStatus === 'operational' || rawStatus === 'available') status = 'available'
  else if (rawStatus === 'planned' || rawStatus === 'under_construction') status = 'planned'
  else if (rawStatus === 'offline' || rawStatus === 'out_of_service') status = 'offline'

  if (props.restricted) status = 'offline'

  return {
    id:             `fines:${externalId}`,
    source:         'fines',
    externalId,
    name:           props.name?.trim() || 'Fines Charging',
    lat,
    lng,
    address:        props.address?.trim() ?? null,
    city:           props.city?.trim() ?? null,
    country:        'BG',
    network:        'Fines Charging',
    totalPorts,
    availablePorts: null,   // live status polled separately
    maxPowerKw,
    connectors,
    status,
    isFree:         price != null ? price === 0 : null,
    pricePerKwh:    price,
    priceCurrency:  currency,
    pricingText,
    lastUpdated:    new Date().toISOString(),
  }
}

// ── Public fetch ──────────────────────────────────────────────────────

export async function fetchFinesStations(): Promise<ProviderResult> {
  const t0 = Date.now()

  const cached = cacheGet<NormalizedStation[]>(CACHE_KEY)
  if (cached) {
    return {
      source: 'fines',
      stations: cached,
      meta: { status: 'ok', count: cached.length, fetchMs: 0 },
    }
  }

  try {
    const res = await fetchWithTimeout(CATALOG_URL, { method: 'GET' }, FETCH_TIMEOUT_MS)
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const geo: FinesGeoJSON = await res.json() as FinesGeoJSON

    if (!Array.isArray(geo.features)) throw new Error('No features array in response')

    const stations = geo.features
      .filter((f) => f.geometry?.type === 'Point' && Array.isArray(f.geometry.coordinates))
      .map((f, i) => normalize(f, i))

    cacheSet(CACHE_KEY, stations, CACHE_TTL_MS)

    return {
      source: 'fines',
      stations,
      meta: { status: stations.length > 0 ? 'ok' : 'empty', count: stations.length, fetchMs: Date.now() - t0 },
    }
  } catch (err) {
    return {
      source: 'fines',
      stations: [],
      meta: { status: 'error', count: 0, error: errorMessage(err), fetchMs: Date.now() - t0 },
    }
  }
}
