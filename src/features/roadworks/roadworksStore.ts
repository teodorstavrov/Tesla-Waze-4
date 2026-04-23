// ─── Roadworks Store ──────────────────────────────────────────────────────────
// Fetches Bulgaria's official road closure data from /api/roadworks.
// Data is daily — one fetch per session is enough.

export interface RoadworkRecord {
  id:        string
  lat:       number
  lng:       number
  descBg:    string
  descEn:    string
  startTime: string | null
  endTime:   string | null
  severity:  string
}

type Status = 'idle' | 'loading' | 'ok' | 'error'

interface State {
  records: RoadworkRecord[]
  status:  Status
  error:   string | null
  visible: boolean
}

let _state: State = {
  records: [],
  status:  'idle',
  error:   null,
  visible: false,
}

type Listener = () => void
const _listeners = new Set<Listener>()
function _emit(): void { _listeners.forEach((fn) => fn()) }

function _set(patch: Partial<State>): void {
  _state = { ..._state, ...patch }
  _emit()
}

export const roadworksStore = {
  getState(): State { return _state },

  subscribe(fn: Listener): () => void {
    _listeners.add(fn)
    return () => { _listeners.delete(fn) }
  },

  /** Toggle visibility — triggers a fetch if this is the first time showing. */
  toggle(): void {
    const next = !_state.visible
    _set({ visible: next })
    if (next && _state.status === 'idle') {
      void roadworksStore.load()
    }
  },

  async load(): Promise<void> {
    if (_state.status === 'loading') return
    _set({ status: 'loading', error: null })
    try {
      const res = await fetch('/api/roadworks')
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = (await res.json()) as { roadworks: RoadworkRecord[] }
      _set({ records: data.roadworks, status: 'ok' })
    } catch (err) {
      _set({ status: 'error', error: String(err) })
    }
  },
}
