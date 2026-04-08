// ─── Road event types (shared API model) ──────────────────────────────

export type EventType =
  | 'police'
  | 'accident'
  | 'hazard'
  | 'traffic'
  | 'camera'
  | 'construction'

const TWO_DAYS_MS   = 2 * 24 * 60 * 60 * 1000
const FIVE_DAYS_MS  = 5 * 24 * 60 * 60 * 1000

const EVENT_TTL_MS: Record<EventType, number> = {
  police:       TWO_DAYS_MS,
  accident:     FIVE_DAYS_MS,
  hazard:       FIVE_DAYS_MS,
  traffic:      FIVE_DAYS_MS,
  camera:       FIVE_DAYS_MS,
  construction: FIVE_DAYS_MS,
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
  denies: number       // vote count for "no longer there"; auto-deletes at DENY_THRESHOLD
}

export const DENY_THRESHOLD = 1
