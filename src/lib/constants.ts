// ─── Map defaults ─────────────────────────────────────────────────────
export const DEFAULT_CENTER: [number, number] = [42.6977, 23.3219] // Sofia, Bulgaria
export const DEFAULT_ZOOM = 18
export const MIN_ZOOM = 6
export const MAX_ZOOM = 19

// ─── Tile providers ───────────────────────────────────────────────────
// MapTiler (preferred) — set VITE_MAPTILER_API_KEY in Vercel env vars.
//   Free tier: 100 000 map views/month. Native dark tiles — no CSS filter needed.
//   Styles used:
//     streets-v2      — clean OSM-based day map
//     streets-v2-dark — native dark night map
//     bright-v2       — vibrant day style (Voyager mode)
// Fallback: OpenStreetMap (no key, dark via CSS filter invert).
//
// Key validation: real MapTiler API keys are 32+ hex characters.
// Short values ("0", "key", "test", etc.) are treated as missing → OSM fallback.
// This prevents the "Invalid key 0" error when a placeholder is set in Vercel env vars.
const _rawMT = (import.meta.env['VITE_MAPTILER_API_KEY'] as string | undefined) ?? ''
const _MT = _rawMT.length >= 20 ? _rawMT : ''

/** True when MapTiler tiles are active (key present). Used to skip CSS dark filter. */
export const MAPTILER_ENABLED = Boolean(_MT)

export const TILE_LIGHT = _MT
  ? `https://api.maptiler.com/maps/streets-v2/{z}/{x}/{y}.png?key=${_MT}`
  : 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png'

export const TILE_DARK = _MT
  ? `https://api.maptiler.com/maps/streets-v2-dark/{z}/{x}/{y}.png?key=${_MT}`
  : 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png'

// Voyager = bright/colorful day style; stays sharp & readable at any rotation
export const TILE_VOYAGER = _MT
  ? `https://api.maptiler.com/maps/bright-v2/{z}/{x}/{y}.png?key=${_MT}`
  : 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png'

export const TILE_VOYAGER_DARK = _MT
  ? `https://api.maptiler.com/maps/streets-v2-dark/{z}/{x}/{y}.png?key=${_MT}`
  : 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png'

// ArcGIS World Imagery — free for non-commercial use, no key required
export const TILE_SATELLITE =
  'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'

export const TILE_ATTRIBUTION = _MT
  ? '&copy; <a href="https://www.maptiler.com/copyright/">MapTiler</a> &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
  : '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
export const TILE_SATELLITE_ATTRIBUTION =
  'Tiles &copy; Esri &mdash; Source: Esri, i-cubed, USDA, USGS, AEX, GeoEye, Getmapping, Aerogrid, IGN, IGP, UPR-EGP'

// ─── TomTom Traffic overlay ──────────────────────────────────────────
// Official TomTom Traffic Flow Tiles API (ToS-safe, free tier: 2 500 req/day).
// Overlaid on top of the base tile layer — shows green/yellow/red on streets.
// Key is restricted to this domain in the TomTom dashboard.
export const TOMTOM_API_KEY = 'synDxfD6IUFX5NNEFmLbE26JUz3e1zEI'
export const TILE_TRAFFIC =
  `https://api.tomtom.com/traffic/map/4/tile/flow/relative0/{z}/{x}/{y}.png?key=${TOMTOM_API_KEY}`

// ─── App ──────────────────────────────────────────────────────────────
export const APP_NAME = 'TesRadar'
export const APP_VERSION = '2.0.0'

// ─── Bulgaria bounding box ────────────────────────────────────────────
export const BULGARIA_BOUNDS: [[number, number], [number, number]] = [
  [41.235, 22.36],
  [44.215, 28.609],
]
