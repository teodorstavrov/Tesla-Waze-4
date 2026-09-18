// ─── Map defaults ─────────────────────────────────────────────────────
export const DEFAULT_CENTER: [number, number] = [42.6977, 23.3219] // Sofia, Bulgaria
export const DEFAULT_ZOOM = 18
export const MIN_ZOOM = 6
export const MAX_ZOOM = 19

// ─── Tile providers ───────────────────────────────────────────────────
// OpenStreetMap — no key required, free, unlimited.
// Dark mode applied via CSS filter invert in MapShell.tsx.
// Satellite: ArcGIS World Imagery (no key, free non-commercial use).

/** Always false — MapTiler not active. Used in MapShell to decide CSS dark filter. */
export const MAPTILER_ENABLED = false

export const TILE_LIGHT        = 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png'
export const TILE_DARK         = 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png'
export const TILE_VOYAGER      = 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png'
export const TILE_VOYAGER_DARK = 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png'

// ArcGIS World Imagery — free for non-commercial use, no key required
export const TILE_SATELLITE =
  'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'

export const TILE_ATTRIBUTION =
  '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
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
