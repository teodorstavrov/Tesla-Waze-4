// ─── Normalized EV station model ──────────────────────────────────────
// All three providers (Tesla, OCM, Overpass) are reduced to this shape.
// The frontend only ever sees NormalizedStation — never raw provider data.

export type StationSource = 'tesla' | 'ocm' | 'osm' | 'user'

export type StationStatus =
  | 'available'   // confirmed operational
  | 'busy'        // in use / no free ports
  | 'offline'     // broken / not operational
  | 'planned'     // under construction / not yet open
  | 'unknown'     // status not reported

export interface Connector {
  /** Simplified type string: CCS, CHAdeMO, Type2, Tesla, Type1, Schuko, Other */
  type: string
  powerKw: number | null
  count: number
}

export interface NormalizedStation {
  /** Globally unique: "${source}:${externalId}" */
  id: string
  source: StationSource
  externalId: string
  name: string
  lat: number
  lng: number
  address: string | null
  city: string | null
  country: string
  /** Operator/network name, e.g. "Tesla", "EVN", "Charge Point" */
  network: string | null
  totalPorts: number
  availablePorts: number | null
  /** Highest power connector in kW */
  maxPowerKw: number | null
  connectors: Connector[]
  status: StationStatus
  isFree: boolean | null
  /** Price per kWh in local currency, e.g. 0.35 */
  pricePerKwh: number | null
  /** ISO 4217 currency code, e.g. "BGN", "EUR" */
  priceCurrency: string | null
  /** Raw pricing description from provider (e.g. "Pay at machine", "0.35 BGN/kWh") */
  pricingText: string | null
  lastUpdated: string | null
  /** Only set for source='user' stations submitted by users */
  approvalStatus?: 'pending' | 'approved'
  /** Free-text notes from the submitter (source='user' only) */
  submitterNotes?: string | null
  /** ISO timestamp when a user submitted this station */
  submittedAt?: string
  /** Secret token that authorises the submitter to edit/delete.
   *  INTERNAL ONLY — must be stripped before sending to the public API. */
  ownerToken?: string
}

// ── Provider result envelope ──────────────────────────────────────

export type ProviderStatus = 'ok' | 'error' | 'timeout' | 'empty'

export interface ProviderMeta {
  status: ProviderStatus
  count: number
  error?: string
  fetchMs: number
}

export interface ProviderResult {
  source: StationSource
  stations: NormalizedStation[]
  meta: ProviderMeta
}

// ── API response ──────────────────────────────────────────────────

export interface StationsApiResponse {
  stations: NormalizedStation[]
  meta: {
    providers: Partial<Record<StationSource, ProviderMeta>>
    total: number
    deduplicated: number
    bbox: { minLat: number; minLng: number; maxLat: number; maxLng: number }
    cachedAt: string
    cacheHit: boolean
  }
}
