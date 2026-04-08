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
      { id: 'LR',      label: 'Long Range',            usableKwh: 95,   efficiencyWhKm: 175, yearRange: [2012, 2020] },
      { id: 'LR_AWD',  label: 'Long Range AWD',        usableKwh: 95,   efficiencyWhKm: 178, yearRange: [2019, 2025] },
      { id: 'PLAID',   label: 'Plaid',                 usableKwh: 95,   efficiencyWhKm: 195, yearRange: [2021, 2025] },
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
