// ─── Add / Edit Station Store ────────────────────────────────────────────
// Signal store that opens the AddStationForm in 'add' or 'edit' mode.

import type { NormalizedStation, Connector } from './types'

type Listener = () => void

export interface EditData {
  id:           string
  ownerToken:   string
  name:         string
  address:      string
  city:         string
  network:      string
  connectors:   Array<{ type: string; powerKw: number | null; count: number }>
  isFree:       boolean | null
  pricePerKwh:  number | null
  priceCurrency: string
  notes:        string
}

interface AddStationState {
  open:    boolean
  mode:    'add' | 'edit'
  lat:     number
  lng:     number
  address: string
  edit:    EditData | null
}

let _state: AddStationState = { open: false, mode: 'add', lat: 0, lng: 0, address: '', edit: null }
const _listeners = new Set<Listener>()

function _emit() { _listeners.forEach((fn) => fn()) }

export const addStationStore = {
  getState(): Readonly<AddStationState> { return _state },

  subscribe(fn: Listener): () => void {
    _listeners.add(fn)
    return () => { _listeners.delete(fn) }
  },

  open(lat: number, lng: number, address: string): void {
    _state = { open: true, mode: 'add', lat, lng, address, edit: null }
    _emit()
  },

  openEdit(station: NormalizedStation, ownerToken: string): void {
    _state = {
      open:    true,
      mode:    'edit',
      lat:     station.lat,
      lng:     station.lng,
      address: station.address ?? '',
      edit: {
        id:           station.id,
        ownerToken,
        name:         station.name,
        address:      station.address ?? '',
        city:         station.city ?? '',
        network:      station.network ?? '',
        connectors:   (station.connectors as Connector[]).filter((c) => c.type !== 'Other' || c.powerKw != null),
        isFree:       station.isFree ?? null,
        pricePerKwh:  station.pricePerKwh ?? null,
        priceCurrency: station.priceCurrency ?? 'BGN',
        notes:        station.submitterNotes ?? '',
      },
    }
    _emit()
  },

  close(): void {
    _state = { ..._state, open: false }
    _emit()
  },
}
