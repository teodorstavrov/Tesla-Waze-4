// ─── Community meetup store ─────────────────────────────────────────────
// Holds the meetup list + UI flags (add-form open, list-panel open).
// Module-level signal store (same pattern as evStore / addStationStore).

import type { Meetup } from './types'

type Listener = () => void
type Status = 'idle' | 'loading' | 'ok' | 'error'

interface MeetupState {
  meetups:     Meetup[]
  status:      Status
  formOpen:    boolean
  formLat:     number
  formLng:     number
  formAddress: string
  listOpen:    boolean
}

let _state: MeetupState = {
  meetups: [], status: 'idle',
  formOpen: false, formLat: 0, formLng: 0, formAddress: '',
  listOpen: false,
}

const _listeners = new Set<Listener>()
function _emit() { _listeners.forEach((fn) => fn()) }
function _set(patch: Partial<MeetupState>) { _state = { ..._state, ...patch }; _emit() }

let _fetchedAt = 0
const STALE_MS = 60 * 1000

export const meetupStore = {
  getState(): Readonly<MeetupState> { return _state },
  subscribe(fn: Listener): () => void { _listeners.add(fn); return () => { _listeners.delete(fn) } },

  async fetch(force = false): Promise<void> {
    if (!force && Date.now() - _fetchedAt < STALE_MS && _state.status === 'ok') return
    _set({ status: 'loading' })
    try {
      const res = await fetch('/api/meetups')
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = (await res.json()) as { meetups: Meetup[] }
      _fetchedAt = Date.now()
      _set({ meetups: Array.isArray(data.meetups) ? data.meetups : [], status: 'ok' })
    } catch {
      _set({ status: _state.meetups.length > 0 ? 'ok' : 'error' })
    }
  },

  /** Insert/replace a meetup locally (after a successful create). */
  upsertLocal(m: Meetup): void {
    const rest = _state.meetups.filter((x) => x.id !== m.id)
    _set({ meetups: [...rest, m].sort((a, b) => a.date.localeCompare(b.date)) })
  },

  openForm(lat: number, lng: number, address: string): void {
    _set({ formOpen: true, formLat: lat, formLng: lng, formAddress: address })
  },
  closeForm(): void { _set({ formOpen: false }) },

  openList(): void { _set({ listOpen: true }) },
  closeList(): void { _set({ listOpen: false }) },
}
