// ─── Tesla Vehicle Config ───────────────────────────────────────────────
// Single source of truth for all model/year/trim assumptions.
// Edit this file to add new models or refine efficiency numbers.
//
// Sources: Tesla specs, EPA range data, real-world efficiency averages.
// All efficiency values are Wh/km at ~100 km/h, neutral temperature (20°C).

import type { TeslaModel } from './types'

export interface TrimConfig {
  id:             string    // internal key saved in profile
  label:          string    // display name
  usableKwh:      number    // usable battery in kWh
  efficiencyWhKm: number    // baseline consumption Wh/km
  yearRange:      [number, number]  // [from, to] inclusive
}

export interface ModelConfig {
  model:     TeslaModel
  yearRange: [number, number]
  trims:     TrimConfig[]
}

export const VEHICLE_CONFIGS: ModelConfig[] = [
  {
    model: 'Model 3',
    yearRange: [2017, 2025],
    trims: [
      { id: 'SR',      label: 'Standard Range',        usableKwh: 50,   efficiencyWhKm: 145, yearRange: [2017, 2022] },
      { id: 'SR+',     label: 'Standard Range Plus',   usableKwh: 54,   efficiencyWhKm: 145, yearRange: [2019, 2021] },
      { id: 'RWD',     label: 'RWD',                   usableKwh: 57.5, efficiencyWhKm: 140, yearRange: [2023, 2025] },
      { id: 'LR',      label: 'Long Range AWD',        usableKwh: 75,   efficiencyWhKm: 148, yearRange: [2017, 2025] },
      { id: 'PERF',    label: 'Performance',           usableKwh: 75,   efficiencyWhKm: 158, yearRange: [2018, 2025] },
    ],
  },
  {
    model: 'Model Y',
    yearRange: [2020, 2025],
    trims: [
      { id: 'SR',      label: 'Standard Range',        usableKwh: 57.5, efficiencyWhKm: 158, yearRange: [2020, 2021] },
      { id: 'RWD',     label: 'RWD',                   usableKwh: 57.5, efficiencyWhKm: 155, yearRange: [2022, 2025] },
      { id: 'LR',      label: 'Long Range AWD',        usableKwh: 75,   efficiencyWhKm: 162, yearRange: [2020, 2025] },
      { id: 'PERF',    label: 'Performance',           usableKwh: 75,   efficiencyWhKm: 172, yearRange: [2020, 2025] },
    ],
  },
  {
    model: 'Model S',
    yearRange: [2012, 2025],
    trims: [
      // ── 85 kWh era (2012–2016) ──────────────────────────────────
      { id: 'S60',     label: '60',                    usableKwh: 58,   efficiencyWhKm: 195, yearRange: [2012, 2016] },
      { id: 'S85',     label: '85',                    usableKwh: 74,   efficiencyWhKm: 178, yearRange: [2012, 2016] },
      { id: 'S85D',    label: '85D',                   usableKwh: 74,   efficiencyWhKm: 172, yearRange: [2014, 2016] },
      { id: 'P85',     label: 'P85',                   usableKwh: 74,   efficiencyWhKm: 188, yearRange: [2012, 2015] },
      { id: 'P85D',    label: 'P85D',                  usableKwh: 74,   efficiencyWhKm: 185, yearRange: [2014, 2016] },
      // ── 90 kWh era (2015–2017) ──────────────────────────────────
      { id: 'S70D',    label: '70D',                   usableKwh: 65,   efficiencyWhKm: 175, yearRange: [2015, 2016] },
      { id: 'S90D',    label: '90D',                   usableKwh: 81,   efficiencyWhKm: 170, yearRange: [2015, 2017] },
      { id: 'P90D',    label: 'P90D',                  usableKwh: 81,   efficiencyWhKm: 185, yearRange: [2015, 2017] },
      // ── 100 kWh era (2017–2019) ─────────────────────────────────
      { id: 'S100D',   label: '100D',                  usableKwh: 93,   efficiencyWhKm: 168, yearRange: [2017, 2019] },
      { id: 'P100D',   label: 'P100D',                 usableKwh: 93,   efficiencyWhKm: 182, yearRange: [2017, 2019] },
      // ── Long Range refresh (2019–2025) ──────────────────────────
      { id: 'LR',      label: 'Long Range',            usableKwh: 95,   efficiencyWhKm: 172, yearRange: [2019, 2020] },
      { id: 'LR_AWD',  label: 'Long Range AWD',        usableKwh: 95,   efficiencyWhKm: 175, yearRange: [2019, 2025] },
      { id: 'PLAID',   label: 'Plaid',                 usableKwh: 95,   efficiencyWhKm: 192, yearRange: [2021, 2025] },
    ],
  },
  {
    model: 'Model X',
    yearRange: [2015, 2025],
    trims: [
      { id: 'LR',      label: 'Long Range',            usableKwh: 95,   efficiencyWhKm: 195, yearRange: [2015, 2020] },
      { id: 'LR_AWD',  label: 'Long Range AWD',        usableKwh: 95,   efficiencyWhKm: 198, yearRange: [2021, 2025] },
      { id: 'PLAID',   label: 'Plaid',                 usableKwh: 95,   efficiencyWhKm: 215, yearRange: [2021, 2025] },
    ],
  },
  {
    model: 'Cybertruck',
    yearRange: [2023, 2025],
    trims: [
      { id: 'RWD',     label: 'RWD',                   usableKwh: 100,  efficiencyWhKm: 240, yearRange: [2024, 2025] },
      { id: 'AWD',     label: 'AWD',                   usableKwh: 123,  efficiencyWhKm: 248, yearRange: [2023, 2025] },
      { id: 'CS',      label: 'Cyberbeast',            usableKwh: 123,  efficiencyWhKm: 265, yearRange: [2023, 2025] },
    ],
  },
]

export function getModelConfig(model: TeslaModel): ModelConfig | undefined {
  return VEHICLE_CONFIGS.find((c) => c.model === model)
}

export function getTrimsForYear(model: TeslaModel, year: number): TrimConfig[] {
  const cfg = getModelConfig(model)
  if (!cfg) return []
  return cfg.trims.filter((t) => year >= t.yearRange[0] && year <= t.yearRange[1])
}

export function getTrimConfig(model: TeslaModel, year: number, trimId: string): TrimConfig | undefined {
  return getTrimsForYear(model, year).find((t) => t.id === trimId)
}

export function getYearsForModel(model: TeslaModel): number[] {
  const cfg = getModelConfig(model)
  if (!cfg) return []
  const [from, to] = cfg.yearRange
  return Array.from({ length: to - from + 1 }, (_, i) => to - i)  // newest first
}

export const TESLA_MODELS: TeslaModel[] = [
  'Model 3', 'Model Y', 'Model S', 'Model X', 'Cybertruck',
]
