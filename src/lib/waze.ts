// ─── Official Waze integration helpers ───────────────────────────────────────
//
// Only uses documented, ToS-safe Waze APIs:
//   Deep link: https://developers.google.com/waze/deeplinks
//   Embed:     https://developers.google.com/waze/iframe
//
// No data is read from Waze — embed iframe is view-only.

export interface WazeDeepLinkOptions {
  lat:       number
  lon:       number
  navigate?: boolean  // true = open with turn-by-turn navigation (default)
  zoom?:     number   // 1–17, optional
  query?:    string   // optional search label shown in Waze
}

/**
 * Build an official Waze deep link.
 * Opens the Waze app (mobile) or Waze web (desktop) at the given coordinates.
 * With navigate=true the app starts turn-by-turn navigation immediately.
 */
export function buildWazeDeepLink(opts: WazeDeepLinkOptions): string {
  const { lat, lon, navigate = true, zoom, query } = opts
  const p = new URLSearchParams({
    ll:         `${lat},${lon}`,
    utm_source: 'tesradar',
  })
  if (navigate) p.set('navigate', 'yes')
  if (zoom != null) p.set('zoom', String(zoom))
  if (query)   p.set('q', query)
  return `https://waze.com/ul?${p.toString()}`
}

export interface WazeEmbedOptions {
  lat:   number
  lon:   number
  zoom?: number  // default 14
}

/**
 * Build an official Waze embed iframe src.
 * Renders a read-only Waze map tile. Cannot read traffic data — view only.
 */
export function buildWazeEmbedUrl(opts: WazeEmbedOptions): string {
  const { lat, lon, zoom = 14 } = opts
  return `https://embed.waze.com/iframe?zoom=${zoom}&lat=${lat}&lon=${lon}`
}
