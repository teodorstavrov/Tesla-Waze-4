// ─── Frontend road event types ─────────────────────────────────────────

export type EventType =
  | 'police'
  | 'accident'
  | 'hazard'
  | 'traffic'
  | 'camera'
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
  denies:   number
  permanent?: boolean  // admin-added — never expires, immune to deny-votes
}

export const DENY_THRESHOLD = 1

export const EVENT_LABELS: Record<EventType, string> = {
  police:       'Полиция',
  accident:     'Катастрофа',
  hazard:       'Опасност',
  traffic:      'Задръстване',
  camera:      'Камера',
  construction: 'Строеж',
}

export const EVENT_COLORS: Record<EventType, string> = {
  police:       '#3b82f6',
  accident:     '#ef4444',
  hazard:       '#f59e0b',
  traffic:      '#8b5cf6',
  camera:      '#f97316',
  construction: '#f97316',
}

export const EVENT_EMOJI: Record<EventType, string> = {
  police:       '🚔',
  accident:     '🚨',
  hazard:       '⚠️',
  traffic:      '🚗',
  camera:      '📷',
  construction: '🚧',
}
