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
  destination:      RouteDestination | null
  routes:           Route[]           // primary + alternatives
  activeRouteIndex: number
  route:            Route | null      // = routes[activeRouteIndex]
  status:           'idle' | 'loading' | 'ok' | 'error'
  error:            string | null
  deviated:         boolean           // GPS > 200m from route
  remainingM:       number | null     // live remaining distance
}
