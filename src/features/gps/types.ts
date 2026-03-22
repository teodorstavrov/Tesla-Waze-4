// ─── GPS types ─────────────────────────────────────────────────────────

export interface GpsPosition {
  lat: number
  lng: number
  /** Compass heading in degrees from true north. null when unavailable or speed too low. */
  heading: number | null
  /** Accuracy radius in meters */
  accuracy: number
  /** Unix timestamp in ms */
  timestamp: number
}

export type GpsStatus = 'idle' | 'requesting' | 'active' | 'error'
