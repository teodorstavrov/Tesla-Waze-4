// ─── Norwegian ATK (Automatic Traffic Control) sections ───────────────
//
// Average-speed (section) enforcement zones in Norway.
// Sources: Statens vegvesen ATK register, Vegvesen.no, community verification.
//
// Coordinates: approximate camera sign positions on the carriageway.
// Sections marked with // ~ need field verification.
//
// lengthM = road distance in metres (used for avg speed calculation).
// limitKmh = car speed limit (camions often 80 km/h).
//
// Norwegian motorways: 110 km/h max (some 100 or 90 in challenging terrain).
// Tunnels and urban ATK zones: typically 70–80 km/h.

import type { SpeedSection } from './sectionTypes'

export const SPEED_SECTIONS_NO: SpeedSection[] = [

  // ══ E6 Østfold — Svinesund (SE border) → Sarpsborg ═══════════════════

  {
    id:       'no-e6-svinesund-sarpsborg',    // ~approximate
    road:     'E6',
    name:     'Svinesund — Sarpsborg',
    startLat:  59.067,
    startLng:  11.268,
    endLat:    59.258,
    endLng:    11.219,
    lengthM:   23_000,
    limitKmh:  110,
  },

  // ══ E18 Telemark — Langangen → Kjørholt ══════════════════════════════

  {
    id:       'no-e18-langangen-kjørholt',    // ~approximate
    road:     'E18',
    name:     'Langangen — Kjørholt',
    startLat:  59.088,
    startLng:   9.680,
    endLat:    59.172,
    endLng:     9.879,
    lengthM:   18_000,
    limitKmh:  100,
  },
  {
    id:       'no-e18-kjørholt-langangen',    // ~approximate
    road:     'E18',
    name:     'Kjørholt — Langangen',
    startLat:  59.172,
    startLng:   9.879,
    endLat:    59.088,
    endLng:     9.680,
    lengthM:   18_000,
    limitKmh:  100,
  },

  // ══ E18 Vestfold — Stokke → Sandefjord ═══════════════════════════════

  {
    id:       'no-e18-stokke-sandefjord',     // ~approximate
    road:     'E18',
    name:     'Stokke — Sandefjord',
    startLat:  59.220,
    startLng:  10.291,
    endLat:    59.128,
    endLng:    10.220,
    lengthM:   13_000,
    limitKmh:  110,
  },
  {
    id:       'no-e18-sandefjord-stokke',     // ~approximate
    road:     'E18',
    name:     'Sandefjord — Stokke',
    startLat:  59.128,
    startLng:  10.220,
    endLat:    59.220,
    endLng:    10.291,
    lengthM:   13_000,
    limitKmh:  110,
  },

  // ══ E18 Aust-Agder — Arendal → Grimstad ══════════════════════════════

  {
    id:       'no-e18-arendal-grimstad',      // ~approximate
    road:     'E18',
    name:     'Arendal — Grimstad',
    startLat:  58.470,
    startLng:   8.773,
    endLat:    58.349,
    endLng:     8.593,
    lengthM:   22_000,
    limitKmh:  100,
  },
  {
    id:       'no-e18-grimstad-arendal',      // ~approximate
    road:     'E18',
    name:     'Grimstad — Arendal',
    startLat:  58.349,
    startLng:   8.593,
    endLat:    58.470,
    endLng:     8.773,
    lengthM:   22_000,
    limitKmh:  100,
  },

  // ══ E16 Oslo/Ringerike — Sollihøgda ══════════════════════════════════

  {
    id:       'no-e16-sollihøgda-west',       // ~approximate
    road:     'E16',
    name:     'Sollihøgda (W → E)',
    startLat:  59.972,
    startLng:  10.437,
    endLat:    59.960,
    endLng:    10.498,
    lengthM:   5_800,
    limitKmh:  80,
  },
  {
    id:       'no-e16-sollihøgda-east',       // ~approximate
    road:     'E16',
    name:     'Sollihøgda (E → W)',
    startLat:  59.960,
    startLng:  10.498,
    endLat:    59.972,
    endLng:    10.437,
    lengthM:   5_800,
    limitKmh:  80,
  },

  // ══ E6 Trondheim — Ila → Havstad ═════════════════════════════════════

  {
    id:       'no-e6-ila-havstad',            // ~approximate
    road:     'E6',
    name:     'Trondheim Ila — Havstad',
    startLat:  63.427,
    startLng:  10.383,
    endLat:    63.440,
    endLng:    10.421,
    lengthM:   3_200,
    limitKmh:  80,
  },
  {
    id:       'no-e6-havstad-ila',            // ~approximate
    road:     'E6',
    name:     'Trondheim Havstad — Ila',
    startLat:  63.440,
    startLng:  10.421,
    endLat:    63.427,
    endLng:    10.383,
    lengthM:   3_200,
    limitKmh:  80,
  },

  // ══ E39 Stavanger — Eiganestunnelen area ══════════════════════════════

  {
    id:       'no-e39-stavanger-eiganes',     // ~approximate
    road:     'E39',
    name:     'Stavanger Eiganes — Hundvåg',
    startLat:  58.974,
    startLng:   5.722,
    endLat:    58.982,
    endLng:     5.782,
    lengthM:   5_500,
    limitKmh:  80,
  },

  // ══ Rv23 Lier — Linnes → Dagslet (west of Oslo) ═══════════════════════

  {
    id:       'no-rv23-linnes-dagslet',       // ~approximate
    road:     'Rv23',
    name:     'Linnes — Dagslet',
    startLat:  59.774,
    startLng:  10.238,
    endLat:    59.736,
    endLng:    10.335,
    lengthM:   8_000,
    limitKmh:  80,
  },
  {
    id:       'no-rv23-dagslet-linnes',       // ~approximate
    road:     'Rv23',
    name:     'Dagslet — Linnes',
    startLat:  59.736,
    startLng:  10.335,
    endLat:    59.774,
    endLng:    10.238,
    lengthM:   8_000,
    limitKmh:  80,
  },

  // ══ E6 Øyer — Tretten → Øyer (Gudbrandsdalen) ════════════════════════

  {
    id:       'no-e6-tretten-øyer',           // ~approximate
    road:     'E6',
    name:     'Tretten — Øyer',
    startLat:  61.307,
    startLng:  10.298,
    endLat:    61.257,
    endLng:    10.411,
    lengthM:   9_500,
    limitKmh:  90,
  },
]
