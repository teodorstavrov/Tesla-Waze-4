// ─── Route types ───────────────────────────────────────────────────────

export interface RouteDestination {
  lat:  number
  lng:  number
  name: string
}

export interface Route {
  polyline:  [number, number][]  // [lat, lng] pairs for Leaflet
  distanceM: number              // metres
  durationS: number              // seconds
}

export interface RouteState {
  destination: RouteDestination | null
  route:       Route | null
  status:      'idle' | 'loading' | 'ok' | 'error'
  error:       string | null
}
