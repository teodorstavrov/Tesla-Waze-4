// ─── OpenChargeMap provider ────────────────────────────────────────────
//
// OpenChargeMap (https://openchargemap.org) is a community-maintained
// open registry of EV charging stations. Free to use with or without an
// API key (key increases rate limits).
//
// Set OCM_API_KEY env variable for higher rate limits (free registration
// at openchargemap.org). Without it, anonymous requests are rate-limited.
//
// Cached per-bbox for 15 minutes — status updates are semi-frequent.

import type { BBox } from '../utils/bbox.js'
import { toOCMBBox, bboxCacheKey, quantizeBBox } from '../utils/bbox.js'
import { fetchWithTimeout, errorMessage } from '../utils/request.js'
import { cacheGet, cacheSet } from '../cache/memory.js'
import type { NormalizedStation, ProviderResult, Connector } from '../normalize/types.js'

const CACHE_TTL_MS = 15 * 60 * 1000   // 15 minutes
const FETCH_TIMEOUT_MS = 12_000
const BASE_URL = 'https://api.openchargemap.io/v3/poi/'
const MAX_RESULTS = 500

// ── Raw OCM types ─────────────────────────────────────────────────

interface OCMConnectionType { Title?: string | null }
interface OCMCurrentType    { Title?: string | null }

interface OCMConnection {
  ConnectionType?: OCMConnectionType | null
  CurrentType?: OCMCurrentType | null
  PowerKW?: number | null
  Quantity?: number | null
}

interface OCMAddressInfo {
  Title?: string | null
  AddressLine1?: string | null
  Town?: string | null
  Country?: { ISOCode?: string | null; Title?: string | null } | null
  Latitude?: number | null
  Longitude?: number | null
}

interface OCMStatusType {
  IsOperational?: boolean | null
  Title?: string | null
}

interface OCMStation {
  ID: number
  UUID?: string | null
  AddressInfo: OCMAddressInfo
  Connections?: OCMConnection[] | null
  OperatorInfo?: { Title?: string | null } | null
  StatusType?: OCMStatusType | null
  UsageCost?: string | null
  NumberOfPoints?: number | null
  DateLastStatusUpdate?: string | null
}

// ── Normalize ─────────────────────────────────────────────────────

/** Map OCM connector type string to simplified type */
function simplifyConnectorType(title: string | null | undefined): string {
  const t = (title ?? '').toLowerCase()
  if (t.includes('chademo'))          return 'CHAdeMO'
  if (t.includes('ccs') || t.includes('combo')) return 'CCS'
  if (t.includes('type 2') || t.includes('mennekes') || t.includes('iec 62196')) return 'Type2'
  if (t.includes('type 1') || t.includes('j1772')) return 'Type1'
  if (t.includes('tesla'))            return 'Tesla'
  if (t.includes('schuko') || t.includes('2-pin') || t.includes('europlug')) return 'Schuko'
  return 'Other'
}

function normalizeConnectors(raw: OCMConnection[] | null | undefined): Connector[] {
  if (!raw?.length) return []

  return raw
    .filter((c) => c.ConnectionType?.Title)
    .map((c): Connector => ({
      type: simplifyConnectorType(c.ConnectionType?.Title),
      powerKw: c.PowerKW ?? null,
      count: c.Quantity ?? 1,
    }))
}

/**
 * Parse OCM UsageCost free-text field into a numeric price and currency.
 * Examples seen in the wild:
 *   "0.35 BGN/kWh"  "0,35 лв/kWh"  "0.49 EUR/kWh"
 *   "£0.33/kWh"     "0.49€/kWh"    "Free"  ""  null
 */
function parseUsageCost(raw: string | null | undefined): { pricePerKwh: number | null; priceCurrency: string | null } {
  if (raw == null || raw.trim() === '') return { pricePerKwh: null, priceCurrency: null }

  const s = raw.trim().toLowerCase()

  // Explicitly free
  if (s === 'free' || s === 'безплатно' || s === '0' || s === '0.00') {
    return { pricePerKwh: 0, priceCurrency: null }
  }

  // Only proceed if it looks like a per-kWh price
  if (!s.includes('kwh') && !s.includes('кwh')) return { pricePerKwh: null, priceCurrency: null }

  // Extract numeric value — handle both "0.35" and "0,35"
  const numMatch = s.match(/(\d+[.,]\d+|\d+)/)
  if (!numMatch) return { pricePerKwh: null, priceCurrency: null }
  const price = parseFloat(numMatch[1]!.replace(',', '.'))
  if (!isFinite(price) || price <= 0) return { pricePerKwh: null, priceCurrency: null }

  // Detect currency
  let currency: string | null = null
  if (raw.includes('BGN') || raw.includes('bgn') || raw.includes('лв')) currency = 'BGN'
  else if (raw.includes('EUR') || raw.includes('eur') || raw.includes('€'))  currency = 'EUR'
  else if (raw.includes('GBP') || raw.includes('gbp') || raw.includes('£'))  currency = 'GBP'
  else if (raw.includes('USD') || raw.includes('usd') || raw.includes('$'))  currency = 'USD'

  return { pricePerKwh: price, priceCurrency: currency }
}

function normalizeStatus(raw: OCMStatusType | null | undefined): NormalizedStation['status'] {
  if (raw == null) return 'unknown'
  if (raw.IsOperational === false) return 'offline'
  if (raw.IsOperational === true)  return 'available'
  const t = (raw.Title ?? '').toLowerCase()
  if (t.includes('operational'))        return 'available'
  if (t.includes('planned'))            return 'planned'
  if (t.includes('not operational'))    return 'offline'
  return 'unknown'
}

function normalize(raw: OCMStation): NormalizedStation | null {
  const lat = raw.AddressInfo.Latitude
  const lng = raw.AddressInfo.Longitude

  if (lat == null || lng == null || !isFinite(lat) || !isFinite(lng)) return null

  const connectors = normalizeConnectors(raw.Connections)
  const maxPowerKw = connectors.reduce<number | null>((max, c) => {
    if (c.powerKw == null) return max
    return max == null ? c.powerKw : Math.max(max, c.powerKw)
  }, null)

  const externalId = String(raw.UUID ?? raw.ID)
  const totalPorts = raw.NumberOfPoints ?? connectors.reduce((s, c) => s + c.count, 0)

  // OCM usage cost of null / undefined = no info. Empty string = free.
  const isFree = raw.UsageCost === '' ? true
               : raw.UsageCost == null ? null
               : false

  const { pricePerKwh, priceCurrency } = parseUsageCost(raw.UsageCost)
  const pricingText = (raw.UsageCost && raw.UsageCost.trim()) ? raw.UsageCost.trim() : null

  return {
    id: `ocm:${externalId}`,
    source: 'ocm',
    externalId,
    name: raw.AddressInfo.Title ?? 'Charging Station',
    lat,
    lng,
    address: raw.AddressInfo.AddressLine1 ?? null,
    city: raw.AddressInfo.Town ?? null,
    country: raw.AddressInfo.Country?.ISOCode ?? 'BG',
    network: raw.OperatorInfo?.Title ?? null,
    totalPorts,
    availablePorts: null,
    maxPowerKw,
    connectors,
    status: normalizeStatus(raw.StatusType),
    isFree,
    pricePerKwh,
    priceCurrency,
    pricingText,
    lastUpdated: raw.DateLastStatusUpdate ?? null,
  }
}

// ── Public API ────────────────────────────────────────────────────

export async function fetchOCMStations(bbox: BBox): Promise<ProviderResult> {
  const t0 = Date.now()
  const qbbox = quantizeBBox(bbox)
  const key = bboxCacheKey('ocm', qbbox)

  try {
    const cached = cacheGet<NormalizedStation[]>(key)
    if (cached) {
      return { source: 'ocm', stations: cached, meta: { status: 'ok', count: cached.length, fetchMs: 0 } }
    }

    const apiKey = process.env['OCM_API_KEY'] ?? ''
    const params = new URLSearchParams({
      output: 'json',
      boundingbox: toOCMBBox(qbbox),
      maxresults: String(MAX_RESULTS),
      verbose: 'false',
      ...(apiKey ? { key: apiKey } : {}),
    })

    // Read as text first — OCM returns plain "REJECTED_APIKEY" when rate-limited
    const httpRes = await fetchWithTimeout(
      `${BASE_URL}?${params.toString()}`,
      { headers: { 'Accept': 'application/json' } },
      FETCH_TIMEOUT_MS,
    )
    if (!httpRes.ok) throw new Error(`OCM HTTP ${httpRes.status}`)

    const text = await httpRes.text()
    if (text.startsWith('REJECTED')) {
      throw new Error('OCM rate-limited — set OCM_API_KEY env variable (free at openchargemap.org/site/developerinfo)')
    }

    const raw = JSON.parse(text) as OCMStation[]
    if (!Array.isArray(raw)) throw new Error('Unexpected OCM response shape')

    const stations: NormalizedStation[] = []
    for (const item of raw) {
      const station = normalize(item)
      if (station) stations.push(station)
    }

    cacheSet(key, stations, CACHE_TTL_MS)

    return {
      source: 'ocm',
      stations,
      meta: { status: stations.length === 0 ? 'empty' : 'ok', count: stations.length, fetchMs: Date.now() - t0 },
    }
  } catch (err) {
    return {
      source: 'ocm',
      stations: [],
      meta: { status: 'error', count: 0, error: errorMessage(err), fetchMs: Date.now() - t0 },
    }
  }
}
