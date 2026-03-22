// ─── Road event types (shared API model) ──────────────────────────────

export type EventType =
  | 'police'
  | 'accident'
  | 'hazard'
  | 'traffic'
  | 'closure'
  | 'construction'

const EVENT_TTL_MS: Record<EventType, number> = {
  police:       2  * 60 * 60 * 1000,       // 2 h
  accident:     3  * 60 * 60 * 1000,       // 3 h
  hazard:       4  * 60 * 60 * 1000,       // 4 h
  traffic:      1  * 60 * 60 * 1000,       // 1 h
  closure:      24 * 60 * 60 * 1000,       // 24 h
  construction: 7  * 24 * 60 * 60 * 1000,  // 7 d
}

export function ttlMs(type: EventType): number {
  return EVENT_TTL_MS[type] ?? 2 * 60 * 60 * 1000
}

export interface RoadEvent {
  id: string
  type: EventType
  lat: number
  lng: number
  description: string | null
  reportedAt: string   // ISO 8601
  expiresAt: string    // ISO 8601
  confirms: number
}
