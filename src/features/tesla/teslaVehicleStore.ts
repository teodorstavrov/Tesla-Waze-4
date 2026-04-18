// ─── Tesla Vehicle Snapshot Store ────────────────────────────────────────
//
// Holds the LAST KNOWN vehicle state received from the Tesla Fleet API.
// Completely separate from batteryStore (which drives the estimation engine).
//
// PURPOSE:
//   Give the UI a direct, raw Tesla data source so it can show:
//   - live battery % when car is online
//   - "asleep" state when car is sleeping (instead of silently falling back)
//   - last-seen timestamp so the user knows how fresh the data is
//
// UPDATED BY: teslaPoller (on every successful or sleeping response)
// READ BY:    FloatingStatsCard, future UI

export interface TeslaVehicleSnapshot {
  batteryPercent: number         // last known battery % from Tesla
  chargingState:  string | null  // 'Charging' | 'Stopped' | 'Disconnected' | 'Complete' | null
  updatedAt:      number         // Unix ms of last successful data fetch
  sleeping:       boolean        // true if vehicle was asleep on last check
}

type Listener = () => void
const _listeners = new Set<Listener>()
let _snap: TeslaVehicleSnapshot | null = null

function _emit(): void { _listeners.forEach((fn) => fn()) }

export const teslaVehicleStore = {
  getSnapshot(): TeslaVehicleSnapshot | null { return _snap },

  /** Called by teslaPoller when fresh vehicle_data arrives. */
  setFromVehicleData(batteryPercent: number, chargingState: string | null): void {
    _snap = {
      batteryPercent,
      chargingState,
      updatedAt: Date.now(),
      sleeping:  false,
    }
    _emit()
  },

  /**
   * Called by teslaPoller when vehicle is sleeping.
   * @param batteryPercent — pass the server's cached % so the snapshot shows
   *   the real last-known value even on the very first poll when the car was
   *   already asleep. Without this, first-sleep defaults to 0%.
   */
  setSleeping(batteryPercent?: number): void {
    _snap = {
      batteryPercent: batteryPercent ?? _snap?.batteryPercent ?? 0,
      chargingState:  _snap?.chargingState ?? null,
      updatedAt:      _snap?.updatedAt ?? Date.now(),
      sleeping:       true,
    }
    _emit()
  },

  /** Clear snapshot on Tesla disconnect. */
  clear(): void {
    _snap = null
    _emit()
  },

  subscribe(fn: Listener): () => void {
    _listeners.add(fn)
    return () => _listeners.delete(fn)
  },
}
