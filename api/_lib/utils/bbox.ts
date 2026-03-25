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
