// ─── Tesla vehicle_data → internal VehicleState ───────────────────────────
// Converts Tesla's raw vehicle_data API payload into a clean, app-internal
// model that the rest of the application uses regardless of data source.
//
// Unit conversions:
//   Speed:    mph  → km/h  (× 1.60934)
//   Range:    miles → km   (× 1.60934)
//   Odometer: miles → km   (× 1.60934)

const MI_TO_KM = 1.60934

// ── Internal model ────────────────────────────────────────────────────────

export interface VehicleState {
  // Battery
  currentBatteryPercent: number                                          // 0–100
  batteryRangeKm:        number | null                                   // estimated remaining range
  chargingState:         'Charging' | 'Stopped' | 'Disconnected' | 'Complete' | 'NoPower' | null
  chargeLimitPercent:    number | null

  // Motion
  currentSpeedKmh: number | null   // null when parked
  headingDeg:      number | null
  powerKw:         number | null   // positive = consuming, negative = regen

  // Location (only present when vehicle_location scope is granted)
  lat: number | null
  lng: number | null

  // Meta
  vehicleParked: boolean
  odometerKm:   number | null
  timestamp:    number   // Unix ms when this snapshot was taken
  source:       'tesla_live'
}

// ── Tesla raw payload types ────────────────────────────────────────────────

export interface TeslaChargeState {
  battery_level?:    number
  charging_state?:   string
  charge_limit_soc?: number
  battery_range?:    number   // miles
}

export interface TeslaDriveState {
  speed?:       number | null   // mph
  heading?:     number
  latitude?:    number
  longitude?:   number
  power?:       number          // kW
  shift_state?: string | null   // null = parked
}

export interface TeslaVehicleState {
  odometer?: number   // miles
}

export interface TeslaVehicleDataPayload {
  charge_state?:  TeslaChargeState
  drive_state?:   TeslaDriveState
  vehicle_state?: TeslaVehicleState
}

// ── Normalization ──────────────────────────────────────────────────────────

export function normalizeVehicleData(raw: TeslaVehicleDataPayload): VehicleState {
  const cs = raw.charge_state  ?? {}
  const ds = raw.drive_state   ?? {}
  const vs = raw.vehicle_state ?? {}

  const speedMph = ds.speed ?? null

  return {
    currentBatteryPercent: cs.battery_level ?? 0,
    batteryRangeKm:   cs.battery_range != null
      ? Math.round(cs.battery_range * MI_TO_KM)
      : null,
    chargingState:    _chargeState(cs.charging_state),
    chargeLimitPercent: cs.charge_limit_soc ?? null,

    currentSpeedKmh: speedMph != null ? Math.round(speedMph * MI_TO_KM) : null,
    headingDeg:      ds.heading  ?? null,
    powerKw:         ds.power    ?? null,

    lat: ds.latitude  ?? null,
    lng: ds.longitude ?? null,

    vehicleParked: ds.shift_state == null,
    odometerKm:   vs.odometer != null ? Math.round(vs.odometer * MI_TO_KM) : null,

    timestamp: Date.now(),
    source:    'tesla_live',
  }
}

function _chargeState(s?: string): VehicleState['chargingState'] {
  switch (s) {
    case 'Charging':     return 'Charging'
    case 'Stopped':      return 'Stopped'
    case 'Disconnected': return 'Disconnected'
    case 'Complete':     return 'Complete'
    case 'NoPower':      return 'NoPower'
    default:             return null
  }
}
