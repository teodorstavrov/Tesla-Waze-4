// ─── Road Event Store (module-level) ──────────────────────────────────
// Mirrors evStore pattern: fetch on bbox change, pub/sub, stale-while-revalidate.
// Events have short TTLs (~1-4h) so stale threshold is 60s (much shorter than EV).

import type { RoadEvent, EventType } from './types.js'
import { logger } from '@/lib/logger'

const STALE_MS = 60 * 1000  // 60 seconds — events are time-sensitive

interface EventState {
  events: RoadEvent[]
  status: 'idle' | 'loading' | 'ok' | 'error'
  error: string | null
  fetchedAt: number | null
  bboxKey: string | null
  selectedEvent: RoadEvent | null
  reportModalOpen: boolean
  /** Pre-set location for the report modal (e.g. station coords). null = use GPS/map center. */
  reportLocation: { lat: number; lng: number } | null
}

let _state: EventState = {
  events:          [],
  status:          'idle',
  error:           null,
  fetchedAt:       null,
  bboxKey:         null,
  selectedEvent:   null,
  reportModalOpen: false,
  reportLocation:  null,
}

type Listener = () => void
const _listeners = new Set<Listener>()
let _abortController: AbortController | null = null
let _fetchVersion = 0

function _emit(): void { _listeners.forEach((fn) => fn()) }

function _bboxKey(b: { minLat: number; minLng: number; maxLat: number; maxLng: number }): string {
  const r = (n: number) => Math.round(n * 100) / 100
  return `${r(b.minLat)},${r(b.minLng)},${r(b.maxLat)},${r(b.maxLng)}`
}

export const eventStore = {
  getState(): Readonly<EventState> { return _state },

  subscribe(listener: Listener): () => void {
    _listeners.add(listener)
    return () => { _listeners.delete(listener) }
  },

  selectEvent(event: RoadEvent | null): void {
    if (_state.selectedEvent?.id === event?.id) return
    _state = { ..._state, selectedEvent: event }
    _emit()
  },

  openReportModal(location?: { lat: number; lng: number }): void {
    _state = { ..._state, reportModalOpen: true, selectedEvent: null, reportLocation: location ?? null }
    _emit()
  },

  closeReportModal(): void {
    _state = { ..._state, reportModalOpen: false, reportLocation: null }
    _emit()
  },

  /** Optimistically add a just-reported event without waiting for re-fetch */
  addEvent(event: RoadEvent): void {
    _state = { ..._state, events: [event, ..._state.events] }
    _emit()
  },

  /** Update event after confirm */
  updateEvent(updated: RoadEvent): void {
    _state = {
      ..._state,
      events: _state.events.map((e) => e.id === updated.id ? updated : e),
      selectedEvent: _state.selectedEvent?.id === updated.id ? updated : _state.selectedEvent,
    }
    _emit()
  },

  async fetch(bbox: { minLat: number; minLng: number; maxLat: number; maxLng: number }): Promise<void> {
    const key = _bboxKey(bbox)
    const isStale = _state.fetchedAt == null || Date.now() - _state.fetchedAt >= STALE_MS

    if (_state.bboxKey === key && !isStale && _state.status !== 'error') return

    _abortController?.abort()
    _abortController = new AbortController()
    const version = ++_fetchVersion

    _state = { ..._state, status: 'loading', bboxKey: key, error: null }
    _emit()

    const url = `/api/events?bbox=${bbox.minLat},${bbox.minLng},${bbox.maxLat},${bbox.maxLng}`

    try {
      const res = await fetch(url, { signal: _abortController.signal })
      if (version !== _fetchVersion) return
      if (!res.ok) throw new Error(`HTTP ${res.status}`)

      const data = (await res.json()) as { events: RoadEvent[] }
      if (version !== _fetchVersion) return

      _state = {
        ..._state,
        events: data.events,
        status: 'ok',
        error: null,
        fetchedAt: Date.now(),
      }

      logger.events.debug('Events loaded', { count: data.events.length })
      _emit()
    } catch (err) {
      if (version !== _fetchVersion) return
      if ((err as Error).name === 'AbortError') return
      _state = { ..._state, status: 'error', error: String(err) }
      _emit()
    }
  },

  async report(type: EventType, lat: number, lng: number): Promise<RoadEvent | null> {
    try {
      const res = await fetch('/api/events', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type, lat, lng }),
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = (await res.json()) as { event: RoadEvent }
      eventStore.addEvent(data.event)
      logger.events.info('Event reported', { type, lat, lng })
      return data.event
    } catch (err) {
      logger.events.warn('Report failed', { err: String(err) })
      return null
    }
  },

  async confirm(id: string): Promise<void> {
    try {
      const res = await fetch('/api/events/confirm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      })
      if (!res.ok) return
      const data = (await res.json()) as { event: RoadEvent }
      eventStore.updateEvent(data.event)
    } catch {
      // silent — confirms are best-effort
    }
  },
}
