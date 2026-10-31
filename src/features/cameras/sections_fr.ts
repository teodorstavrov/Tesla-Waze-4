// ─── French radar tronçons (average-speed camera sections) ──────────────
//
// Average-speed enforcement zones (radars de tronçon) in France.
// Sources: Sécurité Routière, Radars-auto.com, SANEF, community reports.
//
// Coordinates: approximate camera sign positions on the carriageway.
// Sections marked with // ~ need field verification.
//
// lengthM = road distance in metres (used for avg speed calculation).
// limitKmh = car speed limit (130 on autoroutes, 110 on divided roads).

import type { SpeedSection } from './sectionTypes'

export const SPEED_SECTIONS_FR: SpeedSection[] = [

  // ══ A2 Valenciennes — Nord (59) ════════════════════════════════════════

  {
    id:       'fr-a2-thiant-herin',
    road:     'A2',
    name:     'Thiant → Hérin',
    startLat:  50.320,
    startLng:   3.462,
    endLat:    50.388,
    endLng:    3.385,
    lengthM:   11_000,
    limitKmh:  130,
  },
  {
    id:       'fr-a2-herin-thiant',
    road:     'A2',
    name:     'Hérin → Thiant',
    startLat:  50.388,
    startLng:   3.385,
    endLat:    50.320,
    endLng:    3.462,
    lengthM:   11_000,
    limitKmh:  130,
  },

  // ══ A16 Boulogne-sur-Mer — Pas-de-Calais (62) ════════════════════════

  {
    id:       'fr-a16-boulogne-marquise',
    road:     'A16',
    name:     'Boulogne-sur-Mer → Marquise',
    startLat:  50.722,
    startLng:   1.618,
    endLat:    50.822,
    endLng:    1.697,
    lengthM:   13_500,
    limitKmh:  130,
  },
  {
    id:       'fr-a16-marquise-boulogne',
    road:     'A16',
    name:     'Marquise → Boulogne-sur-Mer',
    startLat:  50.822,
    startLng:   1.697,
    endLat:    50.722,
    endLng:    1.618,
    lengthM:   13_500,
    limitKmh:  130,
  },

  // ══ A25 Lille — Nord (59) ══════════════════════════════════════════════

  {
    id:       'fr-a25-houplines-armentieres',
    road:     'A25',
    name:     'Houplines → Armentières',  // ~
    startLat:  50.713,
    startLng:   2.901,
    endLat:    50.726,
    endLng:    2.862,
    lengthM:   4_500,
    limitKmh:  110,
  },
  {
    id:       'fr-a25-armentieres-houplines',
    road:     'A25',
    name:     'Armentières → Houplines',  // ~
    startLat:  50.726,
    startLng:   2.862,
    endLat:    50.713,
    endLng:    2.901,
    lengthM:   4_500,
    limitKmh:  110,
  },

  // ══ A7 Chanas — Isère (38) ════════════════════════════════════════════

  {
    id:       'fr-a7-chanas-pdr',
    road:     'A7',
    name:     'Chanas → Péage-de-Roussillon',
    startLat:  45.268,
    startLng:   4.796,
    endLat:    45.371,
    endLng:    4.799,
    lengthM:   11_500,
    limitKmh:  130,
  },
  {
    id:       'fr-a7-pdr-chanas',
    road:     'A7',
    name:     'Péage-de-Roussillon → Chanas',
    startLat:  45.371,
    startLng:   4.799,
    endLat:    45.268,
    endLng:    4.796,
    lengthM:   11_500,
    limitKmh:  130,
  },

  // ══ A48 Voreppe — Isère (38) ══════════════════════════════════════════

  {
    id:       'fr-a48-voreppe-st-egreve',
    road:     'A48',
    name:     'Voreppe → Saint-Égrève',
    startLat:  45.296,
    startLng:   5.619,
    endLat:    45.350,
    endLng:    5.605,
    lengthM:   8_500,
    limitKmh:  110,
  },
  {
    id:       'fr-a48-st-egreve-voreppe',
    road:     'A48',
    name:     'Saint-Égrève → Voreppe',
    startLat:  45.350,
    startLng:   5.605,
    endLat:    45.296,
    endLng:    5.619,
    lengthM:   8_500,
    limitKmh:  110,
  },

  // ══ A51 Saint-Cannat — Bouches-du-Rhône (13) ══════════════════════════

  {
    id:       'fr-a51-st-cannat-pertuis',
    road:     'A51',
    name:     'Saint-Cannat → Pertuis',
    startLat:  43.629,
    startLng:   5.500,
    endLat:    43.695,
    endLng:    5.507,
    lengthM:   8_000,
    limitKmh:  110,
  },
  {
    id:       'fr-a51-pertuis-st-cannat',
    road:     'A51',
    name:     'Pertuis → Saint-Cannat',
    startLat:  43.695,
    startLng:   5.507,
    endLat:    43.629,
    endLng:    5.500,
    lengthM:   8_000,
    limitKmh:  110,
  },

  // ══ A71 Clermont-Ferrand — Puy-de-Dôme (63) ═══════════════════════════

  {
    id:       'fr-a71-clermont-gerzat',
    road:     'A71',
    name:     'Clermont-Ferrand → Gerzat',
    startLat:  45.813,
    startLng:   3.120,
    endLat:    45.867,
    endLng:    3.076,
    lengthM:   8_000,
    limitKmh:  130,
  },
  {
    id:       'fr-a71-gerzat-clermont',
    road:     'A71',
    name:     'Gerzat → Clermont-Ferrand',
    startLat:  45.867,
    startLng:   3.076,
    endLat:    45.813,
    endLng:    3.120,
    lengthM:   8_000,
    limitKmh:  130,
  },
]
