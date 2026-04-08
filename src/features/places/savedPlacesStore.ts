// ─── Saved Places Store (localStorage) ────────────────────────────────
// Stores Home and Work locations on the device only.
// No server sync — each device/car has its own places.

export type PlaceType = 'home' | 'work'

export interface SavedPlace {
  type:    PlaceType
  lat:     number
  lng:     number
  name:    string   // resolved address or coords
}

const STORAGE_KEY = 'teslaradar:saved_places'

type Listener = () => void
const _listeners = new Set<Listener>()

function _emit(): void { _listeners.forEach((fn) => fn()) }

function _load(): Partial<Record<PlaceType, SavedPlace>> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? (JSON.parse(raw) as Partial<Record<PlaceType, SavedPlace>>) : {}
  } catch {
    return {}
  }
}

function _save(data: Partial<Record<PlaceType, SavedPlace>>): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data))
  } catch { /* storage full */ }
}

export const savedPlacesStore = {
  getAll(): Partial<Record<PlaceType, SavedPlace>> {
    return _load()
  },

  get(type: PlaceType): SavedPlace | null {
    return _load()[type] ?? null
  },

  set(place: SavedPlace): void {
    const data = _load()
    data[place.type] = place
    _save(data)
    _emit()
  },

  remove(type: PlaceType): void {
    const data = _load()
    delete data[type]
    _save(data)
    _emit()
  },

  subscribe(fn: Listener): () => void {
    _listeners.add(fn)
    return () => { _listeners.delete(fn) }
  },
}
