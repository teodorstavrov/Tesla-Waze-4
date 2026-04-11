// ─── Swedish sträckmätning (average-speed camera sections) ────────────
//
// Average-speed enforcement zones in Sweden.
// Sources: Trafikverket, NTF, Polisen, community verification.
//
// Coordinates: approximate camera sign positions on the carriageway.
// Sections marked with // ~ need field verification.
//
// lengthM = road distance in metres (used for avg speed calculation).
// limitKmh = car speed limit.
//
// Swedish motorways: 110–120 km/h on E-roads, often 80–100 km/h elsewhere.

import type { SpeedSection } from './sectionTypes'

export const SPEED_SECTIONS_SE: SpeedSection[] = [

  // ══ E4 Stockholm south — Hallunda → Fittja ════════════════════════════

  {
    id:       'se-e4-hallunda-fittja',
    road:     'E4',
    name:     'Hallunda — Fittja',
    startLat:  59.238,
    startLng:  17.864,
    endLat:    59.261,
    endLng:    17.826,
    lengthM:   4_000,
    limitKmh:  80,
  },
  {
    id:       'se-e4-fittja-hallunda',
    road:     'E4',
    name:     'Fittja — Hallunda',
    startLat:  59.261,
    startLng:  17.826,
    endLat:    59.238,
    endLng:    17.864,
    lengthM:   4_000,
    limitKmh:  80,
  },

  // ══ E18/E20 Hjulsta — Stockholm west ══════════════════════════════════

  {
    id:       'se-e18-hjulsta-west',          // ~approximate
    road:     'E18',
    name:     'Hjulsta (E → W)',
    startLat:  59.397,
    startLng:  17.948,
    endLat:    59.399,
    endLng:    17.868,
    lengthM:   6_000,
    limitKmh:  80,
  },
  {
    id:       'se-e18-hjulsta-east',          // ~approximate
    road:     'E18',
    name:     'Hjulsta (W → E)',
    startLat:  59.399,
    startLng:  17.868,
    endLat:    59.397,
    endLng:    17.948,
    lengthM:   6_000,
    limitKmh:  80,
  },

  // ══ E4 Södertälje — south of Stockholm ════════════════════════════════

  {
    id:       'se-e4-sodertalje-north',       // ~approximate
    road:     'E4',
    name:     'Södertälje N — Rönninge',
    startLat:  59.196,
    startLng:  17.636,
    endLat:    59.236,
    endLng:    17.720,
    lengthM:   7_000,
    limitKmh:  100,
  },
  {
    id:       'se-e4-sodertalje-south',       // ~approximate
    road:     'E4',
    name:     'Rönninge — Södertälje N',
    startLat:  59.236,
    startLng:  17.720,
    endLat:    59.196,
    endLng:    17.636,
    lengthM:   7_000,
    limitKmh:  100,
  },

  // ══ E4 Uppsala bypass ══════════════════════════════════════════════════

  {
    id:       'se-e4-uppsala-s-knivsta',      // ~approximate
    road:     'E4',
    name:     'Uppsala S — Knivsta',
    startLat:  59.850,
    startLng:  17.607,
    endLat:    59.718,
    endLng:    17.784,
    lengthM:   19_000,
    limitKmh:  110,
  },
  {
    id:       'se-e4-knivsta-uppsala-s',      // ~approximate
    road:     'E4',
    name:     'Knivsta — Uppsala S',
    startLat:  59.718,
    startLng:  17.784,
    endLat:    59.850,
    endLng:    17.607,
    lengthM:   19_000,
    limitKmh:  110,
  },

  // ══ E6/E20 Göteborg — Tingstadsmotet area ═════════════════════════════

  {
    id:       'se-e6-goteborg-tingstads',     // ~approximate
    road:     'E6',
    name:     'Göteborg Tingstads (N → S)',
    startLat:  57.734,
    startLng:  11.967,
    endLat:    57.708,
    endLng:    11.979,
    lengthM:   3_500,
    limitKmh:  80,
  },
  {
    id:       'se-e6-goteborg-tingstads-s',   // ~approximate
    road:     'E6',
    name:     'Göteborg Tingstads (S → N)',
    startLat:  57.708,
    startLng:  11.979,
    endLat:    57.734,
    endLng:    11.967,
    lengthM:   3_500,
    limitKmh:  80,
  },

  // ══ E6 Kungsbacka — south of Göteborg ═════════════════════════════════

  {
    id:       'se-e6-kungsbacka-north',       // ~approximate
    road:     'E6',
    name:     'Kungsbacka N — Göteborg S',
    startLat:  57.504,
    startLng:  12.076,
    endLat:    57.594,
    endLng:    12.014,
    lengthM:   12_000,
    limitKmh:  110,
  },
  {
    id:       'se-e6-kungsbacka-south',       // ~approximate
    road:     'E6',
    name:     'Göteborg S — Kungsbacka N',
    startLat:  57.594,
    startLng:  12.014,
    endLat:    57.504,
    endLng:    12.076,
    lengthM:   12_000,
    limitKmh:  110,
  },

  // ══ E4 Malmö — Vellinge bypass ════════════════════════════════════════

  {
    id:       'se-e4-malmo-vellinge',         // ~approximate
    road:     'E4',
    name:     'Malmö S — Vellinge',
    startLat:  55.523,
    startLng:  13.095,
    endLat:    55.474,
    endLng:    12.985,
    lengthM:   10_000,
    limitKmh:  110,
  },
  {
    id:       'se-e4-vellinge-malmo',         // ~approximate
    road:     'E4',
    name:     'Vellinge — Malmö S',
    startLat:  55.474,
    startLng:  12.985,
    endLat:    55.523,
    endLng:    13.095,
    lengthM:   10_000,
    limitKmh:  110,
  },

  // ══ E22 Malmö — Lund bypass ═══════════════════════════════════════════

  {
    id:       'se-e22-malmo-lund',            // ~approximate
    road:     'E22',
    name:     'Malmö E — Lund',
    startLat:  55.595,
    startLng:  13.069,
    endLat:    55.709,
    endLng:    13.173,
    lengthM:   14_000,
    limitKmh:  110,
  },

  // ══ E4 Sundsvall bypass ═══════════════════════════════════════════════

  {
    id:       'se-e4-sundsvall-north',        // ~approximate
    road:     'E4',
    name:     'Sundsvall N bypass (N → S)',
    startLat:  62.465,
    startLng:  17.430,
    endLat:    62.386,
    endLng:    17.312,
    lengthM:   12_000,
    limitKmh:  90,
  },
  {
    id:       'se-e4-sundsvall-south',        // ~approximate
    road:     'E4',
    name:     'Sundsvall N bypass (S → N)',
    startLat:  62.386,
    startLng:  17.312,
    endLat:    62.465,
    endLng:    17.430,
    lengthM:   12_000,
    limitKmh:  90,
  },
]
