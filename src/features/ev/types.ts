// ─── Frontend EV station types ─────────────────────────────────────────
// Mirror of api/_lib/normalize/types.ts — kept in sync manually.
// The API and frontend have separate TS configs so we can't share directly.

export type StationSource = 'tesla' | 'ocm' | 'osm'

export type StationStatus =
  | 'available'
  | 'busy'
  | 'offline'
  | 'planned'
  | 'unknown'

export interface Connector {
  type: string          // CCS, CHAdeMO, Type2, Tesla, Type1, Schuko, Other
  powerKw: number | null
  count: number
}

export interface NormalizedStation {
  id: string            // "${source}:${externalId}" — globally unique
  source: StationSource
  externalId: string
  name: string
  lat: number
  lng: number
  address: string | null
  city: string | null
  country: string
  network: string | null
  totalPorts: number
  availablePorts: number | null
  maxPowerKw: number | null
  connectors: Connector[]
  status: StationStatus
  isFree: boolean | null
  lastUpdated: string | null
}

export interface ProviderMeta {
  status: 'ok' | 'error' | 'timeout' | 'empty'
  count: number
  error?: string
  fetchMs: number
}

export interface StationsApiResponse {
  stations: NormalizedStation[]
  meta: {
    providers: Record<StationSource, ProviderMeta>
    total: number
    deduplicated: number
    bbox: { minLat: number; minLng: number; maxLat: number; maxLng: number }
    cachedAt: string
    cacheHit: boolean
  }
}
