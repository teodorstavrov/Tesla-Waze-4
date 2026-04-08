// ─── Battery Planning — Types ───────────────────────────────────────────

export type TeslaModel = 'Model 3' | 'Model Y' | 'Model S' | 'Model X' | 'Cybertruck'

export interface VehicleProfile {
  model:                 TeslaModel
  year:                  number
  trim:                  string
  currentBatteryPercent: number
  degradationPercent:    number | null   // null = user didn't provide; estimator uses default
  updatedAt:             number          // Date.now() timestamp
}
