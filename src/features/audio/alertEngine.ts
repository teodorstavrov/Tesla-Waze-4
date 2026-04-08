// ─── Proximity Alert Engine ────────────────────────────────────────────
//
// Runs entirely outside React. Subscribes to gpsStore position updates
// and checks distances to all active road events. When the driver enters
// the alert zone for an event, it fires a beep + Bulgarian voice alert.
//
// COOLDOWN: each event is alerted at most once per 5 minutes so the
// driver isn't spammed if they drive slowly past it.
//
// THRESHOLDS: police 700m, traffic 800m, camera/accident 600m, hazard/construction 300-500m.

import { gpsStore } from '@/features/gps/gpsStore'
import { eventStore } from '@/features/events/eventStore'
import { audioManager } from './audioManager'
import { haversineMeters } from '@/lib/geo'
import { logger } from '@/lib/logger'
import { isTeslaBrowser } from '@/lib/browser'
import { t } from '@/lib/locale'
import type { EventType } from '@/features/events/types'

// ── Config ────────────────────────────────────────────────────────

const THRESHOLDS_M: Record<EventType, number> = {
  police:        700,
  accident:      600,
  hazard:        300,
  traffic:       800,
  camera:       600,
  construction:  500,
}

// Second (close) threshold — only for police
const POLICE_CLOSE_M = 300

// Alert texts are looked up via t() at alert time — automatically use
// the current language without any re-render or reactivity overhead.
function _alertText(type: EventType): string {
  return t(`alerts.${type}`)
}

// ── Toast store (tiny — only used by AlertToast component) ────────

interface ToastState {
  type:    EventType | null
  eventId: string | null
  text:    string
  distM:   number | null
  visible: boolean
}

let _toast: ToastState = { type: null, eventId: null, text: '', distM: null, visible: false }
let _toastTimer: ReturnType<typeof setTimeout> | null = null
type ToastListener = () => void
const _toastListeners = new Set<ToastListener>()

export const toastStore = {
  getState: (): Readonly<ToastState> => _toast,
  subscribe(fn: ToastListener): () => void {
    _toastListeners.add(fn)
    return () => { _toastListeners.delete(fn) }
  },
  dismiss(): void {
    if (_toastTimer) clearTimeout(_toastTimer)
    _toast = { ..._toast, visible: false }
    _toastListeners.forEach((fn) => fn())
  },
}

function _showToast(type: EventType, eventId: string, text: string, distM: number): void {
  if (_toastTimer) clearTimeout(_toastTimer)
  _toast = { type, eventId, text, distM, visible: true }
  _toastListeners.forEach((fn) => fn())
  // 12s — enough time to read + tap Потвърждавам / Вече го няма
  _toastTimer = setTimeout(() => {
    _toast = { ..._toast, visible: false }
    _toastListeners.forEach((fn) => fn())
  }, 12000)
}

// ── Engine ────────────────────────────────────────────────────────

// eventId → distance at previous scan (for zone-entry detection on ALL types)
const _prevDistances = new Map<string, number>()
// eventId → timestamp of last EventPanel open (separate, shorter cooldown)
const _panelCooldowns = new Map<string, number>()

const PANEL_COOLDOWN_MS = 3 * 60 * 1000  // don't re-open panel within 3 min
const PANEL_TRIGGER_M   = 80             // open panel when first entering 80m zone

let _unsub: (() => void) | null = null
let _lastScanAt = 0
const SCAN_THROTTLE_MS = 2000  // scan at most every 2s (GPS fires ~1Hz)

function _onPosition(): void {
  const now = Date.now()
  if (now - _lastScanAt < SCAN_THROTTLE_MS) return
  _lastScanAt = now

  const pos = gpsStore.getPosition()
  if (!pos) return

  const { events } = eventStore.getState()

  for (const event of events) {
    const threshold = THRESHOLDS_M[event.type] ?? 500

    const distM = haversineMeters(
      [pos.lat, pos.lng],
      [event.lat, event.lng],
    )

    const prevDist = _prevDistances.get(event.id) ?? Infinity
    _prevDistances.set(event.id, distM)

    // ── Advance warning toast (zone-entry for ALL types) ─────────────────
    // Fires exactly once when crossing inward. Auto-resets when driver
    // moves back beyond the threshold — no time-based cooldown needed.
    if (prevDist > threshold && distM <= threshold) {
      const text = _alertText(event.type)
      logger.audio.info('Proximity alert (zone entry)', { type: event.type, distM: Math.round(distM) })
      audioManager.beep(880, event.type === 'police' ? 150 : 100)
      if (!isTeslaBrowser) setTimeout(() => audioManager.speak(text), 200)
      _showToast(event.type, event.id, text, Math.round(distM))
    }

    // ── Police siren at 200m — zone-entry only ────────────────────
    // Fires exactly once when crossing into 200m zone. Resets automatically
    // when driver moves back beyond 200m (prevDist will be > POLICE_CLOSE_M again).
    if (event.type === 'police' && prevDist > POLICE_CLOSE_M && distM <= POLICE_CLOSE_M) {
      const text = t('alerts.policeClose')
      logger.audio.info('Police close warning (zone entry)', { distM: Math.round(distM) })
      audioManager.siren(3)
      if (!isTeslaBrowser) setTimeout(() => audioManager.speak(text), 600)
      _showToast(event.type, event.id, text, Math.round(distM))
    }

    // ── EventPanel — first entry into 80m zone (approaching) ─────
    // "prevDist > PANEL_TRIGGER_M && distM <= PANEL_TRIGGER_M" = just crossed the threshold
    if (prevDist > PANEL_TRIGGER_M && distM <= PANEL_TRIGGER_M) {
      const lastPanel = _panelCooldowns.get(event.id) ?? 0
      if (now - lastPanel >= PANEL_COOLDOWN_MS) {
        _panelCooldowns.set(event.id, now)
        logger.audio.info('EventPanel auto-open (5m zone entry)', { id: event.id, distM: Math.round(distM) })
        eventStore.selectEvent(event, true)
      }
    }
  }

  // ── Prune stale entries from _prevDistances ────────────────────
  // Events can expire/be deleted; without cleanup the Map grows forever.
  if (_prevDistances.size > events.length) {
    const activeIds = new Set(events.map((e) => e.id))
    for (const id of _prevDistances.keys()) {
      if (!activeIds.has(id)) {
        _prevDistances.delete(id)
        _panelCooldowns.delete(id)
      }
    }
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
