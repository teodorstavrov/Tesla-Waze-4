// ─── Nominatim geocoding (OSM) ────────────────────────────────────────────
// Free, no key. Country-scoped via countryStore. Rate-limit: max 1 req/s —
// enforced by 400ms debounce in SearchBar. Attribution present via tile layer.
//
// CLIENT CACHE: results are cached per (country, cacheKey) for 10 minutes.
//
// TWO SEARCH STRATEGIES:
//
//  1. STRUCTURED search  — used when the query contains a house number.
//     Sends ?street=<name+number>&city=<city> to Nominatim, which is far
//     more precise for exact address lookups than free-text.
//     e.g. "Pop Dimitar 15" → street="Pop Dimitar 15"
//          "Pop Dimitar 15, Sofia" → street="Pop Dimitar 15", city="Sofia"
//
//  2. FREE-TEXT search   — used for all other queries (city, POI, street name).
//     Generates up to 3 transliterated/shva variants and tries them in sequence,
//     stopping when ≥3 results are found.
//
// Results from multiple requests are deduplicated by coordinate proximity (~110m).

import { countryStore } from '@/lib/countryStore'
import { generateQueryVariants, normalizeText, latinToCyrillic, stripStreetPrefix } from './normalizeQuery.js'

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
  class?: string
  type?: string
  place_rank?: number
  importance?: number
  osm_type?: string  // 'N' node | 'W' way | 'R' relation
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

const PLACE_TYPES   = new Set(['place', 'highway', 'amenity', 'shop', 'tourism', 'leisure'])
// OSM types with precise coordinates (nodes/ways) ranked over relations (boundary centroids)
const PRECISE_TYPES = new Set(['N', 'W'])

// ─── Result parsing & sorting ──────────────────────────────────────────────

interface ParsedResult extends GeoResult {
  _class:      string
  _placeRank:  number
  _importance: number
  _osmType:    string
}

function _parseResults(data: NominatimItem[]): ParsedResult[] {
  return data.map((r): ParsedResult => {
    const addr     = r.address ?? {}
    const road     = addr.road
    const houseNum = addr.house_number
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
      _class:      r.class      ?? '',
      _placeRank:  r.place_rank ?? 0,
      _importance: r.importance ?? 0,
      _osmType:    r.osm_type   ?? '',
    }
  })
}

function _sortResults(raw: ParsedResult[]): GeoResult[] {
  // Priority rules (descending):
  //  1. class=place/highway/amenity > boundary (boundary centroids can be km away)
  //  2. osm_type N/W (precise point) > R (relation/polygon centroid)
  //  3. place_rank DESC — higher rank = more specific settlement (city > county)
  //  4. importance DESC
  raw.sort((a, b) => {
    const aIsPlace  = PLACE_TYPES.has(a._class)
    const bIsPlace  = PLACE_TYPES.has(b._class)
    if (aIsPlace !== bIsPlace) return aIsPlace ? -1 : 1

    const aPrecise  = PRECISE_TYPES.has(a._osmType)
    const bPrecise  = PRECISE_TYPES.has(b._osmType)
    if (aPrecise !== bPrecise) return aPrecise ? -1 : 1

    if (b._placeRank  !== a._placeRank)  return b._placeRank  - a._placeRank
    if (b._importance !== a._importance) return b._importance - a._importance
    return 0
  })
  return raw.map(({ _class: _c, _placeRank: _pr, _importance: _im, _osmType: _ot, ...rest }) => rest as GeoResult)
}

// ─── Address parsing ───────────────────────────────────────────────────────

/** True if the query likely contains a house number. */
function _hasHouseNumber(q: string): boolean {
  // Must have at least one letter before the digits so pure numbers like "15"
  // don't trigger structured search. Matches both "Street 15" and "Street15a".
  return /[а-яёa-z].*\d+\s*[а-яёa-z]?\s*$/i.test(q)
}

/**
 * Parse "Street Name 15" or "Street Name 15, City" into parts.
 * The house number is kept attached to the street (Nominatim expects it there).
 * Returns { street, city? } — city is only set when a comma separator is found.
 */
function _parseAddressQuery(q: string): { street: string; city?: string } {
  const commaIdx = q.lastIndexOf(',')
  if (commaIdx > 0) {
    const maybeCity   = q.slice(commaIdx + 1).trim()
    const maybeStreet = q.slice(0, commaIdx).trim()
    // Only split if both parts are non-empty and the city part has no digits
    // (avoids splitting "15 Pop Dimitar, 5" incorrectly)
    if (maybeCity && maybeStreet && !/\d/.test(maybeCity)) {
      return { street: maybeStreet, city: maybeCity }
    }
  }
  return { street: q }
}

// ─── Low-level fetch helpers ───────────────────────────────────────────────

async function _doFetch(
  params: URLSearchParams,
  cacheKey: string,
  signal?: AbortSignal,
): Promise<GeoResult[]> {
  const hit = _searchCache.get(cacheKey)
  if (hit && Date.now() < hit.expiresAt) return hit.results

  const res = await fetch(
    `https://nominatim.openstreetmap.org/search?${params.toString()}`,
    {
      signal,
      headers: { 'User-Agent': 'TeslaEVNav/1.0 (https://tesradar.tech)' },
    },
  )

  if (!res.ok) throw new Error(`Nominatim ${res.status}`)

  const data    = (await res.json()) as NominatimItem[]
  const results = _sortResults(_parseResults(data)).slice(0, 5)

  if (_searchCache.size >= 100) _searchCache.delete(_searchCache.keys().next().value!)
  _searchCache.set(cacheKey, { results, expiresAt: Date.now() + SEARCH_CACHE_TTL_MS })

  return results
}

/** Structured address search — precise for "Street Name 15" queries. */
async function _fetchStructured(
  street: string,
  city: string | undefined,
  countryCode: string,
  searchCode: string,
  searchLang: string,
  signal?: AbortSignal,
): Promise<GeoResult[]> {
  const cacheKey = `${countryCode}:structured:${street}${city ? ',' + city : ''}`

  const params = new URLSearchParams({
    street:            street,
    format:            'json',
    countrycodes:      searchCode,
    limit:             '5',
    addressdetails:    '1',
    'accept-language': searchLang,
  })
  if (city) params.set('city', city)

  return _doFetch(params, cacheKey, signal)
}

/** Free-text search — good for city/POI/street-name-only queries. */
async function _fetchFreeText(
  variant: string,
  countryCode: string,
  searchCode: string,
  searchLang: string,
  signal?: AbortSignal,
): Promise<GeoResult[]> {
  const cacheKey = `${countryCode}:${variant}`

  const params = new URLSearchParams({
    q:                 variant,
    format:            'json',
    countrycodes:      searchCode,
    limit:             '10',
    addressdetails:    '1',
    extratags:         '0',
    'accept-language': searchLang,
  })

  return _doFetch(params, cacheKey, signal)
}

// ─── Dedup helper ──────────────────────────────────────────────────────────

function _merge(
  merged: GeoResult[],
  seen: Set<string>,
  incoming: GeoResult[],
): void {
  for (const r of incoming) {
    const key = `${r.lat.toFixed(3)},${r.lng.toFixed(3)}`
    if (!seen.has(key)) { seen.add(key); merged.push(r) }
  }
}

// ─── Public API ────────────────────────────────────────────────────────────

export async function searchNominatim(
  query:    string,
  signal?:  AbortSignal,
  viewbox?: string,   // kept for API compat — not used (countrycodes scoping is sufficient)
): Promise<GeoResult[]> {
  void viewbox

  const country = countryStore.getCountryOrDefault()
  const forBG   = country.code === 'BG'
  const norm    = normalizeText(query)
  const stripped = stripStreetPrefix(norm)

  const seen   = new Set<string>()
  const merged: GeoResult[] = []

  async function tryFetch(fn: () => Promise<GeoResult[]>): Promise<void> {
    try {
      _merge(merged, seen, await fn())
    } catch (err) {
      if ((err as Error)?.name === 'AbortError') throw err
    }
  }

  // ── Strategy 1: Structured address search (when house number detected) ──
  if (_hasHouseNumber(norm)) {
    const { street: rawStreet, city: rawCity } = _parseAddressQuery(stripped)

    // Try the primary form (as typed) and a Cyrillic transliterated form
    const streetVariants: Array<{ street: string; city?: string }> = [
      { street: rawStreet, city: rawCity },
    ]

    // For BG: also try Cyrillic street name (e.g. "Pop Dimitar 15" → "Поп Димитър 15")
    if (forBG) {
      // Separate the digits from the street name for transliteration
      const numMatch  = rawStreet.match(/^(.*?)\s*(\d+\s*[а-яa-z]?)$/i)
      const streetOnly = numMatch ? numMatch[1]!.trim() : rawStreet
      const numPart    = numMatch ? numMatch[2]!.trim() : ''

      const cyrStreet = latinToCyrillic(streetOnly)
      if (cyrStreet !== streetOnly && !/[a-z]/.test(cyrStreet)) {
        const cyrWithShva = cyrStreet.replace(/ар(?=\s|$)/g, 'ър')
        const cyrFull     = numPart ? `${cyrWithShva} ${numPart}` : cyrWithShva
        const cyrCity     = rawCity ? latinToCyrillic(rawCity) : undefined
        streetVariants.push({ street: cyrFull, city: cyrCity })
      }
    }

    for (const { street, city } of streetVariants) {
      if (merged.length >= 3) break
      await tryFetch(() => _fetchStructured(
        street, city,
        country.code, country.searchCode, country.searchLang,
        signal,
      ))
    }

    // If structured search found results, return early — no need for free-text
    if (merged.length > 0) return merged.slice(0, 5)
  }

  // ── Strategy 2: Free-text search (city, POI, street name without number) ─
  const variants = generateQueryVariants(query, { forBG })

  for (const variant of variants) {
    if (merged.length >= 3) break
    await tryFetch(() => _fetchFreeText(
      variant,
      country.code, country.searchCode, country.searchLang,
      signal,
    ))
  }

  return merged.slice(0, 5)
}
