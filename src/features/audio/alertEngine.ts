// ─── Proximity Alert Engine ────────────────────────────────────────────
//
// Runs entirely outside React. Subscribes to gpsStore position updates
// and checks distances to all active road events. When the driver enters
// the alert zone for an event, it fires a beep + Bulgarian voice alert.
//
// COOLDOWN: each event is alerted at most once per 5 minutes so the
// driver isn't spammed if they drive slowly past it.
//
// THRESHOLDS: police gets 1 km warning, others 500-800 m.

import { gpsStore } from '@/features/gps/gpsStore'
import { eventStore } from '@/features/events/eventStore'
import { audioManager } from './audioManager'
import { haversineMeters } from '@/lib/geo'
import { logger } from '@/lib/logger'
import type { EventType } from '@/features/events/types'

// ── Config ────────────────────────────────────────────────────────

const COOLDOWN_MS = 5 * 60 * 1000  // 5 minutes per event

const THRESHOLDS_M: Record<EventType, number> = {
  police:       1000,
  accident:      600,
  hazard:        500,
  traffic:       800,
  closure:       600,
  construction:  500,
}

const ALERT_TEXTS: Record<EventType, string> = {
  police:       'Полиция напред',
  accident:     'Катастрофа напред',
  hazard:       'Опасност на пътя',
  traffic:      'Задръстване напред',
  closure:      'Затворен път напред',
  construction: 'Строителни работи напред',
}

// ── Toast store (tiny — only used by AlertToast component) ────────

interface ToastState {
  type:    EventType | null
  text:    string
  visible: boolean
}

let _toast: ToastState = { type: null, text: '', visible: false }
let _toastTimer: ReturnType<typeof setTimeout> | null = null
type ToastListener = () => void
const _toastListeners = new Set<ToastListener>()

export const toastStore = {
  getState: (): Readonly<ToastState> => _toast,
  subscribe(fn: ToastListener): () => void {
    _toastListeners.add(fn)
    return () => { _toastListeners.delete(fn) }
  },
}

function _showToast(type: EventType, text: string): void {
  if (_toastTimer) clearTimeout(_toastTimer)
  _toast = { type, text, visible: true }
  _toastListeners.forEach((fn) => fn())
  _toastTimer = setTimeout(() => {
    _toast = { ..._toast, visible: false }
    _toastListeners.forEach((fn) => fn())
  }, 4000)
}

// ── Engine ────────────────────────────────────────────────────────

const _cooldowns = new Map<string, number>()  // eventId → lastAlertedAt
let _unsub: (() => void) | null = null

function _onPosition(): void {
  const pos = gpsStore.getPosition()
  if (!pos) return

  const { events } = eventStore.getState()
  const now = Date.now()

  for (const event of events) {
    const threshold = THRESHOLDS_M[event.type] ?? 500

    const distM = haversineMeters(
      [pos.lat, pos.lng],
      [event.lat, event.lng],
    )

    if (distM > threshold) continue

    const lastAlerted = _cooldowns.get(event.id) ?? 0
    if (now - lastAlerted < COOLDOWN_MS) continue

    // Trigger alert
    _cooldowns.set(event.id, now)

    const text = ALERT_TEXTS[event.type]
    logger.audio.info('Proximity alert', { type: event.type, distM: Math.round(distM) })

    audioManager.beep(880, 100)
    setTimeout(() => audioManager.speak(text), 200)
    _showToast(event.type, text)
  }
}

export const alertEngine = {
  start(): void {
    if (_unsub) return  // already running
    _unsub = gpsStore.onPosition(_onPosition)
    logger.audio.debug('Alert engine started')
  },

  stop(): void {
    _unsub?.()
    _unsub = null
  },
}
