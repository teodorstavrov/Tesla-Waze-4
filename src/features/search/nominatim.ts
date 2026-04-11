// ─── Nominatim geocoding (OSM) ────────────────────────────────────────
// Free, no key. Country-scoped via countryStore. Rate-limit: max 1 req/s —
// enforced by 400ms debounce in SearchBar. Attribution present via tile layer.
//
// CLIENT CACHE: results are cached per (country, query) for 10 minutes so
// repeated searches hit zero network. Cache key includes country code so
// switching country always produces fresh results for the new scope.

import { countryStore } from '@/lib/countryStore'

const _searchCache = new Map<string, { results: GeoResult[]; expiresAt: number }>()
const SEARCH_CACHE_TTL_MS = 10 * 60 * 1000  // 10 minutes

export interface GeoResult {
  type: 'geo'
  displayName: string   // full OSM display name
  shortName:   string   // first segment (city / POI name)
  category:    string   // 'place', 'highway', etc.
  lat: number
  lng: number
}

interface NominatimItem {
  display_name: string
  name?: string
  lat: string
  lon: string
  category?: string
  addresstype?: string
  address?: {
    city?: string
    town?: string
    village?: string
    suburb?: string
    road?: string
    country?: string
  }
}

export async function searchNominatim(
  query:    string,
  signal?:  AbortSignal,
  viewbox?: string,   // 'minLng,maxLat,maxLng,minLat' — prioritises visible map area
): Promise<GeoResult[]> {
  const country = countryStore.getCountryOrDefault()

  // Cache key includes country code — switching country always yields fresh results
  const cacheKey = `${country.code}:${query.trim().toLowerCase()}`
  const hit = _searchCache.get(cacheKey)
  if (hit && Date.now() < hit.expiresAt) return hit.results

  const params = new URLSearchParams({
    q:                 query,
    format:            'json',
    countrycodes:      country.searchCode,
    limit:             '5',
    addressdetails:    '1',
    'accept-language': country.searchLang,
  })

  // Intentionally NOT using viewbox bias — it caused wrong results when
  // the visible map area was far from the searched city.
  // countrycodes scoping is sufficient for single-country mode.
  void viewbox

  const res = await fetch(
    `https://nominatim.openstreetmap.org/search?${params.toString()}`,
    {
      signal,
      headers: { 'User-Agent': 'TeslaEVNav/1.0 (https://tesradar.tech)' },
    },
  )

  if (!res.ok) throw new Error(`Nominatim ${res.status}`)

  const data = (await res.json()) as NominatimItem[]

  const results = data.map((r): GeoResult => {
    const addr = r.address ?? {}
    const city = addr.city ?? addr.town ?? addr.village ?? addr.suburb ?? ''
    const shortName =
      r.name ??
      r.display_name.split(',')[0]?.trim() ??
      r.display_name

    return {
      type:        'geo',
      displayName: r.display_name,
      shortName,
      category:    r.addresstype ?? r.category ?? 'place',
      lat: parseFloat(r.lat),
      lng: parseFloat(r.lon),
      ...(city ? { _city: city } : {}),
    } as GeoResult & { _city?: string }
  })

  // Store in client cache — evict oldest if over 100 entries
  if (_searchCache.size >= 100) {
    _searchCache.delete(_searchCache.keys().next().value!)
  }
  _searchCache.set(cacheKey, { results, expiresAt: Date.now() + SEARCH_CACHE_TTL_MS })

  return results
}
