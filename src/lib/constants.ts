// ─── Map defaults ─────────────────────────────────────────────────────
export const DEFAULT_CENTER: [number, number] = [42.6977, 23.3219] // Sofia, Bulgaria
export const DEFAULT_ZOOM = 16
export const MIN_ZOOM = 6
export const MAX_ZOOM = 19

// ─── Tile providers ───────────────────────────────────────────────────
// Note: no {r} — we set detectRetina:true on the TileLayer instead
export const TILE_DARK =
  'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png'
export const TILE_LIGHT =
  'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png'
export const TILE_VOYAGER =
  'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}.png'
export const TILE_VOYAGER_DARK =
  'https://{s}.basemaps.cartocdn.com/rastertiles/voyager_nolabels/{z}/{x}/{y}.png'
// ArcGIS World Imagery — free for non-commercial use, no key required
export const TILE_SATELLITE =
  'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'

export const TILE_ATTRIBUTION =
  '&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a> &copy; <a href="https://carto.com/">CARTO</a>'
export const TILE_SATELLITE_ATTRIBUTION =
  'Tiles &copy; Esri &mdash; Source: Esri, i-cubed, USDA, USGS, AEX, GeoEye, Getmapping, Aerogrid, IGN, IGP, UPR-EGP'

// ─── TomTom Traffic overlay ──────────────────────────────────────────
// Official TomTom Traffic Flow Tiles API (ToS-safe, free tier: 2 500 req/day).
// Overlaid on top of the base tile layer — shows green/yellow/red on streets.
// Key is restricted to this domain in the TomTom dashboard.
export const TOMTOM_API_KEY = 'UZy6QCNYERobnoEtB8Zsxh7dry6NKvtD'
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
