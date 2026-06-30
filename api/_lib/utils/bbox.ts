// ─── Bounding-box utilities ────────────────────────────────────────────

export interface BBox {
  minLat: number
  minLng: number
  maxLat: number
  maxLng: number
}

/** Default bbox covering all of Bulgaria */
export const BULGARIA_BBOX: BBox = {
  minLat: 41.235,
  minLng: 22.360,
  maxLat: 44.215,
  maxLng: 28.609,
}

/** Bbox covering all of Norway (mainland + islands) */
export const NORWAY_BBOX: BBox = {
  minLat: 57.959,
  minLng:  4.479,
  maxLat: 71.182,
  maxLng: 31.293,
}

/** Bbox covering all of Sweden */
export const SWEDEN_BBOX: BBox = {
  minLat: 55.337,
  minLng: 11.120,
  maxLat: 69.060,
  maxLng: 24.166,
}

/** Bbox covering all of Finland */
export const FINLAND_BBOX: BBox = {
  minLat: 59.808,
  minLng: 20.550,
  maxLat: 70.093,
  maxLng: 31.587,
}

/** Bbox covering all of the Netherlands */
export const NETHERLANDS_BBOX: BBox = {
  minLat: 50.750,
  minLng:  3.360,
  maxLat: 53.560,
  maxLng:  7.230,
}

/**
 * NL split into west/east for OCM fetching.
 * OCM returns stations sorted by internal order — fetching the full NL bbox
 * with 6 pages (3000 stations) misses western NL (Amsterdam/Rotterdam area).
 * Splitting at lng 5.30 gives each half up to 3000 stations → full coverage.
 */
export const NETHERLANDS_WEST_BBOX: BBox = {
  minLat: 50.750,
  minLng:  3.360,
  maxLat: 53.560,
  maxLng:  5.300,   // Amsterdam, Rotterdam, Den Haag, Zeeland
}
export const NETHERLANDS_EAST_BBOX: BBox = {
  minLat: 50.750,
  minLng:  5.300,
  maxLat: 53.560,
  maxLng:  7.230,   // Utrecht, Eindhoven, Arnhem, Groningen
}

/** Bbox covering all of Belgium */
export const BELGIUM_BBOX: BBox = {
  minLat: 49.497,
  minLng:  2.546,
  maxLat: 51.505,
  maxLng:  6.408,
}

/**
 * Belgium split into west/east for OCM fetching — same reasoning as the
 * Netherlands split (Belgium has dense charger coverage; one bbox risks
 * silently truncating to 3000 stations and missing a whole region).
 */
export const BELGIUM_WEST_BBOX: BBox = {
  minLat: 49.497,
  minLng:  2.546,
  maxLat: 51.505,
  maxLng:  4.500,   // West/East Flanders, Antwerp, Brussels
}
export const BELGIUM_EAST_BBOX: BBox = {
  minLat: 49.497,
  minLng:  4.500,
  maxLat: 51.505,
  maxLng:  6.408,   // Wallonia, Liège, Namur, Luxembourg province
}

/**
 * Parse a comma-separated bbox string: "minLat,minLng,maxLat,maxLng".
 * Returns null if invalid.
 */
export function parseBBox(raw: string | string[] | undefined): BBox | null {
  const str = Array.isArray(raw) ? raw[0] : raw
  if (!str) return null
  const parts = str.split(',').map(Number)
  if (parts.length !== 4 || parts.some((n) => !isFinite(n))) return null
  const [minLat, minLng, maxLat, maxLng] = parts as [number, number, number, number]
  if (minLat >= maxLat || minLng >= maxLng) return null
  return { minLat, minLng, maxLat, maxLng }
}

/**
 * Quantize bbox to 0.5-degree grid so nearby viewports share a cache key.
 * This increases cache hit rate without significantly expanding the query area.
 */
export function quantizeBBox(b: BBox): BBox {
  const q = 0.5
  return {
    minLat: Math.floor(b.minLat / q) * q,
    minLng: Math.floor(b.minLng / q) * q,
    maxLat: Math.ceil(b.maxLat / q) * q,
    maxLng: Math.ceil(b.maxLng / q) * q,
  }
}

export function bboxCacheKey(prefix: string, b: BBox): string {
  return `${prefix}:${b.minLat},${b.minLng},${b.maxLat},${b.maxLng}`
}

/** Overpass QL bbox filter: (south,west,north,east) */
export function toOverpassBBox(b: BBox): string {
  return `${b.minLat},${b.minLng},${b.maxLat},${b.maxLng}`
}

/** OCM boundingbox param: (sw_lat,sw_lng),(ne_lat,ne_lng) — two coordinate pairs */
export function toOCMBBox(b: BBox): string {
  return `(${b.minLat},${b.minLng}),(${b.maxLat},${b.maxLng})`
}

/** Is the point inside the bbox? */
export function inBBox(lat: number, lng: number, b: BBox): boolean {
  return lat >= b.minLat && lat <= b.maxLat && lng >= b.minLng && lng <= b.maxLng
}
