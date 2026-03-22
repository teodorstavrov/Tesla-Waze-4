// ─── Frontend road event types ─────────────────────────────────────────

export type EventType =
  | 'police'
  | 'accident'
  | 'hazard'
  | 'traffic'
  | 'closure'
  | 'construction'

export interface RoadEvent {
  id: string
  type: EventType
  lat: number
  lng: number
  description: string | null
  reportedAt: string
  expiresAt: string
  confirms: number
}

export const EVENT_LABELS: Record<EventType, string> = {
  police:       'Police',
  accident:     'Accident',
  hazard:       'Hazard',
  traffic:      'Traffic',
  closure:      'Road Closed',
  construction: 'Construction',
}

export const EVENT_COLORS: Record<EventType, string> = {
  police:       '#3b82f6',
  accident:     '#ef4444',
  hazard:       '#f59e0b',
  traffic:      '#8b5cf6',
  closure:      '#dc2626',
  construction: '#f97316',
}

export const EVENT_EMOJI: Record<EventType, string> = {
  police:       '🚔',
  accident:     '🚨',
  hazard:       '⚠️',
  traffic:      '🚗',
  closure:      '🚫',
  construction: '🚧',
}
