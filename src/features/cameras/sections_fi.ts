// ─── Finnish jaksonopeudenvalvonta (average-speed camera sections) ────
//
// Average-speed enforcement zones in Finland.
// Sources: Traficom, Liikenneturva, police.fi, community verification.
//
// Coordinates: approximate camera sign positions on the carriageway.
// Sections marked with // ~ need field verification.
//
// lengthM = road distance in metres (used for avg speed calculation).
// limitKmh = car speed limit.
//
// Finnish motorways: 100–120 km/h in summer, 80–100 km/h in winter.
// Ring roads and urban approaches: typically 80 km/h.

import type { SpeedSection } from './sectionTypes'

export const SPEED_SECTIONS_FI: SpeedSection[] = [

  // ══ E18 Helsinki — Kehä III (Ring III) area ═══════════════════════════

  {
    id:       'fi-e18-kehä3-east',            // ~approximate
    road:     'E18 / Kt45',
    name:     'Kehä III — Vantaa E',
    startLat:  60.313,
    startLng:  25.015,
    endLat:    60.295,
    endLng:    25.155,
    lengthM:   9_000,
    limitKmh:  80,
  },
  {
    id:       'fi-e18-kehä3-west',            // ~approximate
    road:     'E18 / Kt45',
    name:     'Vantaa E — Kehä III',
    startLat:  60.295,
    startLng:  25.155,
    endLat:    60.313,
    endLng:    25.015,
    lengthM:   9_000,
    limitKmh:  80,
  },

  // ══ E18 Espoo — Hiidenniemi → Nummela ════════════════════════════════

  {
    id:       'fi-e18-hiidenniemi-nummela',   // ~approximate
    road:     'E18',
    name:     'Hiidenniemi — Nummela',
    startLat:  60.197,
    startLng:  24.459,
    endLat:    60.330,
    endLng:    24.352,
    lengthM:   17_000,
    limitKmh:  100,
  },
  {
    id:       'fi-e18-nummela-hiidenniemi',   // ~approximate
    road:     'E18',
    name:     'Nummela — Hiidenniemi',
    startLat:  60.330,
    startLng:  24.352,
    endLat:    60.197,
    endLng:    24.459,
    lengthM:   17_000,
    limitKmh:  100,
  },

  // ══ E12 / Vt3 Tampere — bypass ════════════════════════════════════════

  {
    id:       'fi-vt3-tampere-north',         // ~approximate
    road:     'Vt3',
    name:     'Tampere N bypass (N → S)',
    startLat:  61.566,
    startLng:  23.701,
    endLat:    61.497,
    endLng:    23.750,
    lengthM:   10_000,
    limitKmh:  100,
  },
  {
    id:       'fi-vt3-tampere-south',         // ~approximate
    road:     'Vt3',
    name:     'Tampere N bypass (S → N)',
    startLat:  61.497,
    startLng:  23.750,
    endLat:    61.566,
    endLng:    23.701,
    lengthM:   10_000,
    limitKmh:  100,
  },

  // ══ E75 / Vt4 Lahti — motorway ════════════════════════════════════════

  {
    id:       'fi-vt4-lahti-north',           // ~approximate
    road:     'E75 / Vt4',
    name:     'Lahti — Heinola (N → S)',
    startLat:  61.069,
    startLng:  25.661,
    endLat:    60.981,
    endLng:    25.663,
    lengthM:   10_000,
    limitKmh:  120,
  },
  {
    id:       'fi-vt4-lahti-south',           // ~approximate
    road:     'E75 / Vt4',
    name:     'Heinola — Lahti (S → N)',
    startLat:  60.981,
    startLng:  25.663,
    endLat:    61.069,
    endLng:    25.661,
    lengthM:   10_000,
    limitKmh:  120,
  },

  // ══ E18 Turku — Helsinki main motorway ════════════════════════════════

  {
    id:       'fi-e18-lohja-east',            // ~approximate
    road:     'E18 / Vt1',
    name:     'Lohja E — Lohjanharju',
    startLat:  60.252,
    startLng:  23.956,
    endLat:    60.236,
    endLng:    24.136,
    lengthM:   12_000,
    limitKmh:  120,
  },
  {
    id:       'fi-e18-lohja-west',            // ~approximate
    road:     'E18 / Vt1',
    name:     'Lohjanharju — Lohja E',
    startLat:  60.236,
    startLng:  24.136,
    endLat:    60.252,
    endLng:    23.956,
    lengthM:   12_000,
    limitKmh:  120,
  },

  // ══ E18 Kotka — Karhula area ═══════════════════════════════════════════

  {
    id:       'fi-e18-kotka-karhula',         // ~approximate
    road:     'E18',
    name:     'Kotka — Karhula',
    startLat:  60.466,
    startLng:  26.945,
    endLat:    60.453,
    endLng:    27.084,
    lengthM:   7_500,
    limitKmh:  100,
  },
  {
    id:       'fi-e18-karhula-kotka',         // ~approximate
    road:     'E18',
    name:     'Karhula — Kotka',
    startLat:  60.453,
    startLng:  27.084,
    endLat:    60.466,
    endLng:    26.945,
    lengthM:   7_500,
    limitKmh:  100,
  },

  // ══ Vt5 / E63 Mikkeli — north ══════════════════════════════════════════

  {
    id:       'fi-vt5-mikkeli-north',         // ~approximate
    road:     'Vt5 / E63',
    name:     'Mikkeli N (N → S)',
    startLat:  61.744,
    startLng:  27.271,
    endLat:    61.689,
    endLng:    27.274,
    lengthM:   7_000,
    limitKmh:  100,
  },
]
