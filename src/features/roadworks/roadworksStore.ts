// ─── Roadworks Store ──────────────────────────────────────────────────────────
// Fetches Bulgaria's official road closure data from /api/roadworks.
// Data is daily — one fetch per session is enough.
// Visibility is persisted to localStorage so the user's choice survives reload.

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

const STORAGE_KEY = 'teslaradar:roadworks:visible'

function _loadVisible(): boolean {
  try { return localStorage.getItem(STORAGE_KEY) === '1' } catch { return false }
}
function _saveVisible(v: boolean): void {
  try { localStorage.setItem(STORAGE_KEY, v ? '1' : '0') } catch { /* full */ }
}

let _state: State = {
  records: [],
  status:  'idle',
  error:   null,
  visible: _loadVisible(),
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

  /** Toggle visibility. Triggers a fetch on first show OR on retry after error. */
  toggle(): void {
    const next = !_state.visible
    _saveVisible(next)
    _set({ visible: next })
    if (next && (_state.status === 'idle' || _state.status === 'error')) {
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

// Auto-load on startup if visibility was previously enabled
if (_state.visible) {
  void roadworksStore.load()
}
