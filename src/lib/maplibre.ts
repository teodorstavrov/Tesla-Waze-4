// ─── MapLibre GL singleton ─────────────────────────────────────────────
// Single import point for MapLibre GL JS across the entire app.
// Use this instead of importing 'maplibre-gl' directly in layer components.

import * as maplibregl from 'maplibre-gl'

export { maplibregl }
export default maplibregl
