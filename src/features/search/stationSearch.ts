// ─── Local EV station search ───────────────────────────────────────────
// Searches already-loaded stations by name, network, address, city.
// O(n) over ~800 stations — fast enough for keypress debounce.

import { evStore } from '@/features/ev/evStore'
import type { NormalizedStation } from '@/features/ev/types'

export interface StationResult {
  type:     'station'
  station:  NormalizedStation
  subtitle: string   // network · maxPower
}

const MAX_RESULTS = 5

export function searchStations(query: string): StationResult[] {
  if (!query.trim()) return []

  const q = query.toLowerCase()
  const stations = evStore.getState().stations
  const matches: StationResult[] = []

  for (const s of stations) {
    if (matches.length >= MAX_RESULTS) break

    const haystack = [
      s.name,
      s.network,
      s.address,
      s.city,
    ].filter(Boolean).join(' ').toLowerCase()

    if (!haystack.includes(q)) continue

    const parts: string[] = []
    if (s.network) parts.push(s.network)
    if (s.maxPowerKw) parts.push(`${s.maxPowerKw} kW`)
    if (s.city) parts.push(s.city)

    matches.push({
      type:     'station',
      station:  s,
      subtitle: parts.join(' · ') || s.source.toUpperCase(),
    })
  }

  return matches
}
