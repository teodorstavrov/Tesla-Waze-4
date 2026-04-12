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
  class?: string    // 'place' | 'boundary' | 'highway' | ...
  type?: string     // 'city' | 'town' | 'village' | 'administrative' | ...
  place_rank?: number
  address?: {
    city?: string
    town?: string
    village?: string
    suburb?: string
    road?: string
    house_number?: string
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
    limit:             '10',   // fetch more so we can re-sort and trim to 5
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

  const rawResults = data.map((r): GeoResult & { _class: string } => {
    const addr = r.address ?? {}
    const city = addr.city ?? addr.town ?? addr.village ?? addr.suburb ?? ''

    // Build a human-friendly short name that includes house number for addresses.
    // Priority: explicit name tag → road + house_number → road → first display segment
    const road      = addr.road
    const houseNum  = addr.house_number
    const shortName =
      r.name ??
      (road && houseNum ? `${road} ${houseNum}` :
       road              ? road                  :
       r.display_name.split(',')[0]?.trim()      ??
       r.display_name)

    return {
      type:        'geo',
      displayName: r.display_name,
      shortName,
      category:    r.addresstype ?? r.category ?? 'place',
      lat: parseFloat(r.lat),
      lng: parseFloat(r.lon),
      _class: r.class ?? '',
      ...(city ? { _city: city } : {}),
    } as GeoResult & { _class: string; _city?: string }
  })

  // Re-sort: actual place nodes (class=place: city/town/village) before
  // administrative boundaries (class=boundary). Boundary centroids can be
  // several km away from the city centre they represent, causing the route
  // destination to land in the wrong location.
  // Within each group, preserve Nominatim's original importance ordering.
  const PLACE_TYPES = new Set(['place', 'highway', 'amenity', 'shop', 'tourism', 'leisure'])
  rawResults.sort((a, b) => {
    const aIsPlace = PLACE_TYPES.has(a._class)
    const bIsPlace = PLACE_TYPES.has(b._class)
    if (aIsPlace && !bIsPlace) return -1
    if (!aIsPlace && bIsPlace) return  1
    return 0   // stable — preserve original order within each group
  })

  // Strip internal _class field and cap at 5
  const results: GeoResult[] = rawResults.slice(0, 5).map(({ _class: _c, ...rest }) => rest as GeoResult)

  // Store in client cache — evict oldest if over 100 entries
  if (_searchCache.size >= 100) {
    _searchCache.delete(_searchCache.keys().next().value!)
  }
  _searchCache.set(cacheKey, { results, expiresAt: Date.now() + SEARCH_CACHE_TTL_MS })

  return results
}
