// ─── Local EV station search ───────────────────────────────────────────────
// Searches already-loaded stations by name, network, address, city.
// O(n) over ~800 stations — fast enough for keypress debounce.
//
// Uses normalized query variants so that "Sofia" / "София" / "sofiq" all
// match stations whose haystack contains the city name in either script.

import { evStore } from '@/features/ev/evStore'
import { normalizeText, cyrillicToLatin, latinToCyrillic, generateQueryVariants } from './normalizeQuery.js'
import type { NormalizedStation } from '@/features/ev/types'

export interface StationResult {
  type:     'station'
  station:  NormalizedStation
  subtitle: string   // network · maxPower
}

const MAX_RESULTS = 5

/** Normalize + transliterate a station haystack string once for matching. */
function _buildHaystack(s: NormalizedStation): string {
  const raw = [s.name, s.network, s.address, s.city]
    .filter(Boolean)
    .join(' ')
  const normalized = normalizeText(raw)
  // Add transliterated forms so both scripts match the same haystack
  const latin = cyrillicToLatin(normalized)
  const cyr   = latinToCyrillic(normalized)
  return [normalized, latin, cyr].join(' ')
}

/** True if every word in the query appears somewhere in the haystack. */
function _wordMatch(haystack: string, q: string): boolean {
  // Prefer exact substring first (fast path)
  if (haystack.includes(q)) return true
  // Fallback: all words in the query must appear in the haystack
  const words = q.split(/\s+/).filter(Boolean)
  return words.every((w) => haystack.includes(w))
}

export function searchStations(query: string): StationResult[] {
  if (!query.trim()) return []

  // Generate query variants — country-agnostic here since station data
  // can include Cyrillic/Latin regardless of active country
  const variants = generateQueryVariants(query, { forBG: true })

  const stations = evStore.getState().stations
  const matches: StationResult[] = []

  for (const s of stations) {
    if (matches.length >= MAX_RESULTS) break

    const haystack = _buildHaystack(s)

    const hit = variants.some((v) => _wordMatch(haystack, v))
    if (!hit) continue

    const parts: string[] = []
    if (s.network)    parts.push(s.network)
    if (s.maxPowerKw) parts.push(`${s.maxPowerKw} kW`)
    if (s.city)       parts.push(s.city)

    matches.push({
      type:     'station',
      station:  s,
      subtitle: parts.join(' · ') || s.source.toUpperCase(),
    })
  }

  return matches
}
