// ─── Community meetup store ─────────────────────────────────────────────
// Holds the meetup list + UI flags (add/edit form, list panel, detail modal).

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
  editing:     Meetup | null   // non-null → form is in edit mode
  listOpen:    boolean
  selected:    Meetup | null   // detail modal
}

let _state: MeetupState = {
  meetups: [], status: 'idle',
  formOpen: false, formLat: 0, formLng: 0, formAddress: '', editing: null,
  listOpen: false, selected: null,
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

  upsertLocal(m: Meetup): void {
    const rest = _state.meetups.filter((x) => x.id !== m.id)
    const meetups = [...rest, m].sort((a, b) => a.date.localeCompare(b.date))
    // keep selected/editing in sync if it's the same event
    const patch: Partial<MeetupState> = { meetups }
    if (_state.selected?.id === m.id) patch.selected = m
    _set(patch)
  },

  // ── Add form ──
  openForm(lat: number, lng: number, address: string): void {
    _set({ formOpen: true, formLat: lat, formLng: lng, formAddress: address, editing: null })
  },
  // ── Edit form ──
  openEdit(m: Meetup): void {
    _set({ formOpen: true, formLat: m.lat, formLng: m.lng, formAddress: '', editing: m, selected: null })
  },
  closeForm(): void { _set({ formOpen: false, editing: null }) },

  openList(): void { _set({ listOpen: true }) },
  closeList(): void { _set({ listOpen: false }) },

  select(m: Meetup): void { _set({ selected: m }) },
  closeDetail(): void { _set({ selected: null }) },
}
