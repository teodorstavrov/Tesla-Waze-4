// ─── In-memory event store ─────────────────────────────────────────────
//
// Shared across warm invocations of the same Vercel function instance.
// Events auto-expire via their expiresAt field (cleaned on every read).
//
// Phase 6: in-memory only — events lost on cold start (typically every
// 30–60 min of inactivity). Acceptable for demo; replace with Upstash
// Redis in a hardening phase if persistence across cold starts is needed.

import type { RoadEvent } from './types.js'

const MAX_EVENTS = 500

const _events = new Map<string, RoadEvent>()

function _prune(): void {
  const now = Date.now()
  for (const [id, ev] of _events) {
    if (new Date(ev.expiresAt).getTime() < now) _events.delete(id)
  }
}

export const eventMemStore = {
  getInBBox(bbox: { minLat: number; minLng: number; maxLat: number; maxLng: number }): RoadEvent[] {
    _prune()
    return Array.from(_events.values()).filter(
      (e) =>
        e.lat >= bbox.minLat && e.lat <= bbox.maxLat &&
        e.lng >= bbox.minLng && e.lng <= bbox.maxLng,
    )
  },

  add(event: RoadEvent): void {
    // Evict oldest if at capacity
    if (_events.size >= MAX_EVENTS) {
      const oldest = Array.from(_events.values())
        .sort((a, b) => a.reportedAt.localeCompare(b.reportedAt))[0]
      if (oldest) _events.delete(oldest.id)
    }
    _events.set(event.id, event)
  },

  confirm(id: string): RoadEvent | null {
    const ev = _events.get(id)
    if (!ev) return null
    const updated: RoadEvent = { ...ev, confirms: ev.confirms + 1 }
    _events.set(id, updated)
    return updated
  },

  /** Returns null if event was auto-deleted (denies >= DENY_THRESHOLD). */
  deny(id: string): RoadEvent | null | 'deleted' {
    const ev = _events.get(id)
    if (!ev) return null
    const denies = (ev.denies ?? 0) + 1
    if (denies >= 3) {
      _events.delete(id)
      return 'deleted'
    }
    const updated: RoadEvent = { ...ev, denies }
    _events.set(id, updated)
    return updated
  },

  count(): number {
    _prune()
    return _events.size
  },
}
