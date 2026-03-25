// ─── Route types ───────────────────────────────────────────────────────

export interface RouteDestination {
  lat:  number
  lng:  number
  name: string
}

export interface RouteStep {
  lat:       number    // maneuver location (Leaflet)
  lng:       number
  type:      string    // 'depart' | 'turn' | 'arrive' | 'roundabout' | …
  modifier?: string    // 'right' | 'left' | 'straight' | 'slight right' | …
  name:      string    // street name after this maneuver
  distanceM: number    // length of this step's segment
  durationS: number
}

export interface Route {
  polyline:  [number, number][]  // [lat, lng] pairs for Leaflet
  distanceM: number              // metres
  durationS: number              // seconds
  steps:     RouteStep[]         // maneuver list (includes depart + arrive)
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
  currentStepIndex: number            // index into route.steps for next upcoming maneuver
  arrived:          boolean           // GPS within 50m of destination
}
