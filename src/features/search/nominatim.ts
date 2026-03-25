// ─── Nominatim geocoding (OSM) ────────────────────────────────────────
// Free, no key. Bulgaria-scoped. Rate-limit: max 1 req/s — enforced by
// 400ms debounce in SearchBar. Attribution already present via tile layer.

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
  const params = new URLSearchParams({
    q:                query,
    format:           'json',
    countrycodes:     'bg',
    limit:            '5',
    addressdetails:   '1',
    'accept-language': 'bg,en',
  })

  // Bias results toward the currently visible map extent (bounded=0 → still
  // returns results outside the box, just ranked lower)
  if (viewbox) params.set('viewbox', viewbox)

  const res = await fetch(
    `https://nominatim.openstreetmap.org/search?${params.toString()}`,
    {
      signal,
      headers: { 'User-Agent': 'TeslaEVNav/1.0 (https://teslaradar.tech)' },
    },
  )

  if (!res.ok) throw new Error(`Nominatim ${res.status}`)

  const data = (await res.json()) as NominatimItem[]

  return data.map((r): GeoResult => {
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
      // smuggle city for subtitle display
      ...(city ? { _city: city } : {}),
    } as GeoResult & { _city?: string }
  })
}
