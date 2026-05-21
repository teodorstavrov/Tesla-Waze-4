// ─── Netherlands Trajectcontrole sections ─────────────────────────────────
//
// Average-speed (section) enforcement (trajectcontrole) zones in the Netherlands.
// Sources: IBOB/ANPR register, RDW official list Q1-2025, flitsers.nl, ibop.nl
//
// Sections marked // ~ have approximate coordinates (GPS-verified data pending).
// lengthM = road distance in metres (used for avg speed calculation).
// limitKmh = passenger car (personenauto) speed limit.
//
// Most N-roads enforce 80 km/h; motorways 100–130 km/h.
// Tunnels (Westerscheldetunnel/Coentunnel area): 100 km/h max.

import type { SpeedSection } from './sectionTypes'

export const SPEED_SECTIONS_NL: SpeedSection[] = [

  // ══ A2 Amsterdam–Utrecht (Holendrecht–Maarssen) ════════════════════════════
  // Longest Dutch trajectcontrole, ~15 km, 100 km/h

  {
    id:       'nl-a2-holendrecht-maarssen',
    road:     'A2',
    name:     'Holendrecht → Maarssen',
    startLat:  52.2924,
    startLng:   4.9556,
    endLat:    52.1335,
    endLng:     5.0218,
    lengthM:   15_200,
    limitKmh:  100,
  },
  {
    id:       'nl-a2-maarssen-holendrecht',
    road:     'A2',
    name:     'Maarssen → Holendrecht',
    startLat:  52.1335,
    startLng:   5.0218,
    endLat:    52.2924,
    endLng:     4.9556,
    lengthM:   15_200,
    limitKmh:  100,
  },

  // ══ A2 Maastricht city bypass ══════════════════════════════════════════════

  {
    id:       'nl-a2-maastricht-n',             // ~
    road:     'A2',
    name:     'Maastricht Noord → Zuid',
    startLat:  50.8617,
    startLng:   5.6887,
    endLat:    50.8401,
    endLng:     5.6826,
    lengthM:   2_500,
    limitKmh:  100,
  },
  {
    id:       'nl-a2-maastricht-s',             // ~
    road:     'A2',
    name:     'Maastricht Zuid → Noord',
    startLat:  50.8401,
    startLng:   5.6826,
    endLat:    50.8617,
    endLng:     5.6887,
    lengthM:   2_500,
    limitKmh:  100,
  },

  // ══ N2 Maastricht (local road parallel to A2) ══════════════════════════════

  {
    id:       'nl-n2-maastricht-n',             // ~
    road:     'N2',
    name:     'Maastricht N2 Noord → Zuid',
    startLat:  50.8502,
    startLng:   5.6951,
    endLat:    50.8263,
    endLng:     5.6900,
    lengthM:   2_500,
    limitKmh:  80,
  },
  {
    id:       'nl-n2-maastricht-s',             // ~
    road:     'N2',
    name:     'Maastricht N2 Zuid → Noord',
    startLat:  50.8263,
    startLng:   5.6900,
    endLat:    50.8502,
    endLng:     5.6951,
    lengthM:   2_500,
    limitKmh:  80,
  },

  // ══ A4 Hoofddorp–Nieuw Vennep ══════════════════════════════════════════════

  {
    id:       'nl-a4-hoofddorp-nieuwvennep-s',  // ~
    road:     'A4',
    name:     'Hoofddorp → Nieuw Vennep',
    startLat:  52.2810,
    startLng:   4.6175,
    endLat:    52.2590,
    endLng:     4.6328,
    lengthM:   2_500,
    limitKmh:  130,
  },
  {
    id:       'nl-a4-nieuwvennep-hoofddorp-n',  // ~
    road:     'A4',
    name:     'Nieuw Vennep → Hoofddorp',
    startLat:  52.2590,
    startLng:   4.6328,
    endLat:    52.2810,
    endLng:     4.6175,
    lengthM:   2_500,
    limitKmh:  130,
  },

  // ══ A4 Hoofddorp south (extended) ══════════════════════════════════════════

  {
    id:       'nl-a4-nieuwvennep-lisse-s',      // ~
    road:     'A4',
    name:     'Nieuw Vennep → Lisse richting',
    startLat:  52.2590,
    startLng:   4.6328,
    endLat:    52.2083,
    endLng:     4.6484,
    lengthM:   4_800,
    limitKmh:  130,
  },
  {
    id:       'nl-a4-lisse-nieuwvennep-n',      // ~
    road:     'A4',
    name:     'Lisse richting → Nieuw Vennep',
    startLat:  52.2083,
    startLng:   4.6484,
    endLat:    52.2590,
    endLng:     4.6328,
    lengthM:   4_800,
    limitKmh:  130,
  },

  // ══ A4 Zoeterwoude–Leidschendam ════════════════════════════════════════════

  {
    id:       'nl-a4-zoeterwoude-leidschendam',  // ~
    road:     'A4',
    name:     'Zoeterwoude → Leidschendam',
    startLat:  52.0755,
    startLng:   4.4738,
    endLat:    52.0640,
    endLng:     4.3820,
    lengthM:   4_800,
    limitKmh:  100,
  },
  {
    id:       'nl-a4-leidschendam-zoeterwoude',  // ~
    road:     'A4',
    name:     'Leidschendam → Zoeterwoude',
    startLat:  52.0640,
    startLng:   4.3820,
    endLat:    52.0755,
    endLng:     4.4738,
    lengthM:   4_800,
    limitKmh:  100,
  },

  // ══ A7 Hoorn–Purmerend ═════════════════════════════════════════════════════

  {
    id:       'nl-a7-hoorn-purmerend',
    road:     'A7',
    name:     'Hoorn → Purmerend',
    startLat:  52.6584,
    startLng:   5.0614,
    endLat:    52.5198,
    endLng:     4.9796,
    lengthM:   9_100,
    limitKmh:  100,
  },
  {
    id:       'nl-a7-purmerend-hoorn',
    road:     'A7',
    name:     'Purmerend → Hoorn',
    startLat:  52.5198,
    startLng:   4.9796,
    endLat:    52.6584,
    endLng:     5.0614,
    lengthM:   9_100,
    limitKmh:  100,
  },

  // ══ A10 Ring Amsterdam West – north section (Coentunnel–Nieuwe Meer) ═══════

  {
    id:       'nl-a10-coentunnel-nieuwe-meer-s',
    road:     'A10',
    name:     'Coentunnel → Nieuwe Meer',
    startLat:  52.3870,
    startLng:   4.8278,
    endLat:    52.3472,
    endLng:     4.8445,
    lengthM:   4_800,
    limitKmh:  80,
  },
  {
    id:       'nl-a10-nieuwe-meer-coentunnel-n',
    road:     'A10',
    name:     'Nieuwe Meer → Coentunnel',
    startLat:  52.3472,
    startLng:   4.8445,
    endLat:    52.3870,
    endLng:     4.8278,
    lengthM:   4_800,
    limitKmh:  80,
  },

  // ══ A10 Ring Amsterdam West – south section ════════════════════════════════

  {
    id:       'nl-a10-nieuwe-meer-south',        // ~
    road:     'A10',
    name:     'Nieuwe Meer → A10 Zuid',
    startLat:  52.3472,
    startLng:   4.8445,
    endLat:    52.3176,
    endLng:     4.8540,
    lengthM:   4_000,
    limitKmh:  80,
  },
  {
    id:       'nl-a10-south-nieuwe-meer',        // ~
    road:     'A10',
    name:     'A10 Zuid → Nieuwe Meer',
    startLat:  52.3176,
    startLng:   4.8540,
    endLat:    52.3472,
    endLng:     4.8445,
    lengthM:   4_000,
    limitKmh:  80,
  },

  // ══ A12 Prins Clausplein–Den Haag Centrum ══════════════════════════════════

  {
    id:       'nl-a12-prinsclausplein-denhaaag',  // ~
    road:     'A12',
    name:     'Prins Clausplein → Den Haag C.',
    startLat:  52.0635,
    startLng:   4.4095,
    endLat:    52.0893,
    endLng:     4.3437,
    lengthM:   2_200,
    limitKmh:  100,
  },
  {
    id:       'nl-a12-denhaag-prinsclausplein',  // ~
    road:     'A12',
    name:     'Den Haag C. → Prins Clausplein',
    startLat:  52.0893,
    startLng:   4.3437,
    endLat:    52.0635,
    endLng:     4.4095,
    lengthM:   2_200,
    limitKmh:  100,
  },

  // ══ A12 Zoetermeer–Nootdorp ════════════════════════════════════════════════

  {
    id:       'nl-a12-zoetermeer-nootdorp',      // ~
    road:     'A12',
    name:     'Zoetermeer → Nootdorp',
    startLat:  52.0489,
    startLng:   4.4920,
    endLat:    52.0450,
    endLng:     4.4453,
    lengthM:   2_400,
    limitKmh:  130,
  },
  {
    id:       'nl-a12-nootdorp-zoetermeer',      // ~
    road:     'A12',
    name:     'Nootdorp → Zoetermeer',
    startLat:  52.0450,
    startLng:   4.4453,
    endLat:    52.0489,
    endLng:     4.4920,
    lengthM:   2_400,
    limitKmh:  130,
  },

  // ══ A12 Lunetten–Oudenrijn Utrecht (main carriageway) ══════════════════════

  {
    id:       'nl-a12-lunetten-oudenrijn',
    road:     'A12',
    name:     'Lunetten → Oudenrijn',
    startLat:  52.0475,
    startLng:   5.1482,
    endLat:    52.0696,
    endLng:     5.0848,
    lengthM:   3_300,
    limitKmh:  100,
  },
  {
    id:       'nl-a12-oudenrijn-lunetten',
    road:     'A12',
    name:     'Oudenrijn → Lunetten',
    startLat:  52.0696,
    startLng:   5.0848,
    endLat:    52.0475,
    endLng:     5.1482,
    lengthM:   3_300,
    limitKmh:  100,
  },

  // ══ A12 Lunetten–Oudenrijn Utrecht (parallel / HOV carriageway) ═══════════

  {
    id:       'nl-a12-lunetten-oudenrijn-par',
    road:     'A12',
    name:     'Lunetten → Oudenrijn (parallel)',
    startLat:  52.0475,
    startLng:   5.1482,
    endLat:    52.0696,
    endLng:     5.0848,
    lengthM:   3_300,
    limitKmh:  80,
  },
  {
    id:       'nl-a12-oudenrijn-lunetten-par',
    road:     'A12',
    name:     'Oudenrijn → Lunetten (parallel)',
    startLat:  52.0696,
    startLng:   5.0848,
    endLat:    52.0475,
    endLng:     5.1482,
    lengthM:   3_300,
    limitKmh:  80,
  },

  // ══ A13 Kleinpolderplein–Rotterdam Airport ══════════════════════════════════

  {
    id:       'nl-a13-kleinpolder-airport-n',
    road:     'A13',
    name:     'Kleinpolderplein → Rotterdam Airport',
    startLat:  51.9611,
    startLng:   4.4352,
    endLat:    51.9566,
    endLng:     4.4753,
    lengthM:   1_700,
    limitKmh:  80,
  },
  {
    id:       'nl-a13-airport-kleinpolder-s',
    road:     'A13',
    name:     'Rotterdam Airport → Kleinpolderplein',
    startLat:  51.9566,
    startLng:   4.4753,
    endLat:    51.9611,
    endLng:     4.4352,
    lengthM:   1_700,
    limitKmh:  80,
  },

  // ══ A20 Kleinpolderplein–Terbregseplein Rotterdam ══════════════════════════

  {
    id:       'nl-a20-kleinpolder-terbregseplein-e',
    road:     'A20',
    name:     'Kleinpolderplein → Terbregseplein',
    startLat:  51.9611,
    startLng:   4.4352,
    endLat:    51.9402,
    endLng:     4.5162,
    lengthM:   3_500,
    limitKmh:  100,
  },
  {
    id:       'nl-a20-terbregseplein-kleinpolder-w',
    road:     'A20',
    name:     'Terbregseplein → Kleinpolderplein',
    startLat:  51.9402,
    startLng:   4.5162,
    endLat:    51.9611,
    endLng:     4.4352,
    lengthM:   3_500,
    limitKmh:  100,
  },

  // ══ A58 Bergen op Zoom–Roosendaal ══════════════════════════════════════════

  {
    id:       'nl-a58-bergenopzoom-roosendaal-e',
    road:     'A58',
    name:     'Bergen op Zoom → Roosendaal',
    startLat:  51.5124,
    startLng:   4.2832,
    endLat:    51.4966,
    endLng:     4.4559,
    lengthM:   4_700,
    limitKmh:  130,
  },
  {
    id:       'nl-a58-roosendaal-bergenopzoom-w',
    road:     'A58',
    name:     'Roosendaal → Bergen op Zoom',
    startLat:  51.4966,
    startLng:   4.4559,
    endLat:    51.5124,
    endLng:     4.2832,
    lengthM:   4_700,
    limitKmh:  130,
  },

  // ══ N62 Westerscheldetunnel ════════════════════════════════════════════════
  // ~6.6 km tunnel under the Western Scheldt, 100 km/h

  {
    id:       'nl-n62-westerschelde-n',
    road:     'N62',
    name:     'Westerscheldetunnel Noord → Zuid',
    startLat:  51.3924,
    startLng:   3.7822,
    endLat:    51.3405,
    endLng:     3.8384,
    lengthM:   6_600,
    limitKmh:  100,
  },
  {
    id:       'nl-n62-westerschelde-s',
    road:     'N62',
    name:     'Westerscheldetunnel Zuid → Noord',
    startLat:  51.3405,
    startLng:   3.8384,
    endLat:    51.3924,
    endLng:     3.7822,
    lengthM:   6_600,
    limitKmh:  100,
  },

  // ══ N9 Noord-Holland ═══════════════════════════════════════════════════════

  {
    id:       'nl-n9-schagen-alkmaar-s',        // ~
    road:     'N9',
    name:     'N9 Schagen → Alkmaar',
    startLat:  52.7182,
    startLng:   4.8008,
    endLat:    52.6842,
    endLng:     4.7738,
    lengthM:   4_500,
    limitKmh:  80,
  },
  {
    id:       'nl-n9-alkmaar-schagen-n',        // ~
    road:     'N9',
    name:     'N9 Alkmaar → Schagen',
    startLat:  52.6842,
    startLng:   4.7738,
    endLat:    52.7182,
    endLng:     4.8008,
    lengthM:   4_500,
    limitKmh:  80,
  },

  // ══ N11 Zuid-Holland (Alphen a/d Rijn–A12) ═════════════════════════════════

  {
    id:       'nl-n11-alphen-a12-w',            // ~
    road:     'N11',
    name:     'N11 Alphen a/d Rijn → A12',
    startLat:  52.1325,
    startLng:   4.6368,
    endLat:    52.0780,
    endLng:     4.4920,
    lengthM:   7_000,
    limitKmh:  80,
  },
  {
    id:       'nl-n11-a12-alphen-e',            // ~
    road:     'N11',
    name:     'N11 A12 → Alphen a/d Rijn',
    startLat:  52.0780,
    startLng:   4.4920,
    endLat:    52.1325,
    endLng:     4.6368,
    lengthM:   7_000,
    limitKmh:  80,
  },

  // ══ N201 Noord-Holland / Utrecht (Amstelveen–Aalsmeer) ════════════════════

  {
    id:       'nl-n201-amstelveen-aalsmeer',    // ~
    road:     'N201',
    name:     'N201 Amstelveen → Aalsmeer',
    startLat:  52.3278,
    startLng:   4.7540,
    endLat:    52.2692,
    endLng:     4.7489,
    lengthM:   4_000,
    limitKmh:  80,
  },
  {
    id:       'nl-n201-aalsmeer-amstelveen',    // ~
    road:     'N201',
    name:     'N201 Aalsmeer → Amstelveen',
    startLat:  52.2692,
    startLng:   4.7489,
    endLat:    52.3278,
    endLng:     4.7540,
    lengthM:   4_000,
    limitKmh:  80,
  },

  // ══ N205 Haarlemmermeer ════════════════════════════════════════════════════

  {
    id:       'nl-n205-haarlem-hoofddorp',      // ~
    road:     'N205',
    name:     'N205 Haarlem → Hoofddorp',
    startLat:  52.3058,
    startLng:   4.6618,
    endLat:    52.2744,
    endLng:     4.6238,
    lengthM:   4_000,
    limitKmh:  80,
  },
  {
    id:       'nl-n205-hoofddorp-haarlem',      // ~
    road:     'N205',
    name:     'N205 Hoofddorp → Haarlem',
    startLat:  52.2744,
    startLng:   4.6238,
    endLat:    52.3058,
    endLng:     4.6618,
    lengthM:   4_000,
    limitKmh:  80,
  },

  // ══ N230 Utrecht (Zeist–Doorn) ═════════════════════════════════════════════

  {
    id:       'nl-n230-zeist-doorn',            // ~
    road:     'N230',
    name:     'N230 Zeist → Doorn',
    startLat:  52.1960,
    startLng:   5.2228,
    endLat:    52.1580,
    endLng:     5.2778,
    lengthM:   5_000,
    limitKmh:  80,
  },
  {
    id:       'nl-n230-doorn-zeist',            // ~
    road:     'N230',
    name:     'N230 Doorn → Zeist',
    startLat:  52.1580,
    startLng:   5.2778,
    endLat:    52.1960,
    endLng:     5.2228,
    lengthM:   5_000,
    limitKmh:  80,
  },

  // ══ N253 Zeeland (Schouwen-Duiveland) ════════════════════════════════════

  {
    id:       'nl-n253-schouwen-e',             // ~
    road:     'N253',
    name:     'N253 Schouwen-Duiveland O',
    startLat:  51.7026,
    startLng:   3.8362,
    endLat:    51.6798,
    endLng:     3.8832,
    lengthM:   4_500,
    limitKmh:  80,
  },
  {
    id:       'nl-n253-schouwen-w',             // ~
    road:     'N253',
    name:     'N253 Schouwen-Duiveland W',
    startLat:  51.6798,
    startLng:   3.8832,
    endLat:    51.7026,
    endLng:     3.8362,
    lengthM:   4_500,
    limitKmh:  80,
  },

  // ══ N256 Zeeland (Grevelingendam area) ════════════════════════════════════

  {
    id:       'nl-n256-grevelingen-n',          // ~
    road:     'N256',
    name:     'N256 Grevelingendam N',
    startLat:  51.6505,
    startLng:   4.0325,
    endLat:    51.6085,
    endLng:     4.0818,
    lengthM:   5_000,
    limitKmh:  80,
  },
  {
    id:       'nl-n256-grevelingen-z',          // ~
    road:     'N256',
    name:     'N256 Grevelingendam Z',
    startLat:  51.6085,
    startLng:   4.0818,
    endLat:    51.6505,
    endLng:     4.0325,
    lengthM:   5_000,
    limitKmh:  80,
  },

  // ══ N260 Noord-Brabant (Breda–Oosterhout) ═════════════════════════════════

  {
    id:       'nl-n260-breda-oosterhout',       // ~
    road:     'N260',
    name:     'N260 Breda → Oosterhout',
    startLat:  51.5648,
    startLng:   4.8739,
    endLat:    51.5195,
    endLng:     4.9389,
    lengthM:   5_000,
    limitKmh:  80,
  },
  {
    id:       'nl-n260-oosterhout-breda',       // ~
    road:     'N260',
    name:     'N260 Oosterhout → Breda',
    startLat:  51.5195,
    startLng:   4.9389,
    endLat:    51.5648,
    endLng:     4.8739,
    lengthM:   5_000,
    limitKmh:  80,
  },

  // ══ N270 Noord-Brabant (Helmond–Deurne) ═══════════════════════════════════

  {
    id:       'nl-n270-helmond-deurne',         // ~
    road:     'N270',
    name:     'N270 Helmond → Deurne',
    startLat:  51.4815,
    startLng:   5.6529,
    endLat:    51.4398,
    endLng:     5.7129,
    lengthM:   5_000,
    limitKmh:  80,
  },
  {
    id:       'nl-n270-deurne-helmond',         // ~
    road:     'N270',
    name:     'N270 Deurne → Helmond',
    startLat:  51.4398,
    startLng:   5.7129,
    endLat:    51.4815,
    endLng:     5.6529,
    lengthM:   5_000,
    limitKmh:  80,
  },

  // ══ N275 Limburg (Venlo–Panningen) ════════════════════════════════════════

  {
    id:       'nl-n275-venlo-panningen',        // ~
    road:     'N275',
    name:     'N275 Venlo → Panningen',
    startLat:  51.3802,
    startLng:   6.0560,
    endLat:    51.3238,
    endLng:     6.0788,
    lengthM:   5_000,
    limitKmh:  80,
  },
  {
    id:       'nl-n275-panningen-venlo',        // ~
    road:     'N275',
    name:     'N275 Panningen → Venlo',
    startLat:  51.3238,
    startLng:   6.0788,
    endLat:    51.3802,
    endLng:     6.0560,
    lengthM:   5_000,
    limitKmh:  80,
  },

  // ══ N277 Limburg (Sittard–Geleen) ═════════════════════════════════════════

  {
    id:       'nl-n277-sittard-geleen',         // ~
    road:     'N277',
    name:     'N277 Sittard → Geleen',
    startLat:  51.0032,
    startLng:   5.8729,
    endLat:    50.9598,
    endLng:     5.8422,
    lengthM:   5_000,
    limitKmh:  80,
  },
  {
    id:       'nl-n277-geleen-sittard',         // ~
    road:     'N277',
    name:     'N277 Geleen → Sittard',
    startLat:  50.9598,
    startLng:   5.8422,
    endLat:    51.0032,
    endLng:     5.8729,
    lengthM:   5_000,
    limitKmh:  80,
  },

  // ══ N325 Gelderland (Arnhem–Huissen) ══════════════════════════════════════

  {
    id:       'nl-n325-arnhem-huissen',         // ~
    road:     'N325',
    name:     'N325 Arnhem → Huissen',
    startLat:  51.8502,
    startLng:   5.9218,
    endLat:    51.8978,
    endLng:     5.9785,
    lengthM:   5_000,
    limitKmh:  80,
  },
  {
    id:       'nl-n325-huissen-arnhem',         // ~
    road:     'N325',
    name:     'N325 Huissen → Arnhem',
    startLat:  51.8978,
    startLng:   5.9785,
    endLat:    51.8502,
    endLng:     5.9218,
    lengthM:   5_000,
    limitKmh:  80,
  },

  // ══ N333 Friesland (Drachten area) ════════════════════════════════════════

  {
    id:       'nl-n333-drachten-e',             // ~
    road:     'N333',
    name:     'N333 Drachten Oost',
    startLat:  53.0382,
    startLng:   6.0912,
    endLat:    52.9865,
    endLng:     6.0542,
    lengthM:   5_000,
    limitKmh:  80,
  },
  {
    id:       'nl-n333-drachten-w',             // ~
    road:     'N333',
    name:     'N333 Drachten West',
    startLat:  52.9865,
    startLng:   6.0542,
    endLat:    53.0382,
    endLng:     6.0912,
    lengthM:   5_000,
    limitKmh:  80,
  },

  // ══ N351 Friesland (Sneek area) ═══════════════════════════════════════════

  {
    id:       'nl-n351-sneek-n',                // ~
    road:     'N351',
    name:     'N351 Sneek richting',
    startLat:  53.0729,
    startLng:   5.9082,
    endLat:    53.0252,
    endLng:     5.8445,
    lengthM:   5_000,
    limitKmh:  80,
  },
  {
    id:       'nl-n351-sneek-z',                // ~
    road:     'N351',
    name:     'N351 Sneek terug',
    startLat:  53.0252,
    startLng:   5.8445,
    endLat:    53.0729,
    endLng:     5.9082,
    lengthM:   5_000,
    limitKmh:  80,
  },

  // ══ N381 Drenthe (Hoogeveen–Emmen) ════════════════════════════════════════

  {
    id:       'nl-n381-hoogeveen-emmen',        // ~
    road:     'N381',
    name:     'N381 Hoogeveen → Emmen',
    startLat:  52.7245,
    startLng:   6.6014,
    endLat:    52.6750,
    endLng:     6.6449,
    lengthM:   5_000,
    limitKmh:  80,
  },
  {
    id:       'nl-n381-emmen-hoogeveen',        // ~
    road:     'N381',
    name:     'N381 Emmen → Hoogeveen',
    startLat:  52.6750,
    startLng:   6.6449,
    endLat:    52.7245,
    endLng:     6.6014,
    lengthM:   5_000,
    limitKmh:  80,
  },

  // ══ N414 Utrecht (Bunschoten–Baarn) ════════════════════════════════════════

  {
    id:       'nl-n414-bunschoten-baarn',       // ~
    road:     'N414',
    name:     'N414 Bunschoten → Baarn',
    startLat:  52.2381,
    startLng:   5.3842,
    endLat:    52.2141,
    endLng:     5.2908,
    lengthM:   5_000,
    limitKmh:  80,
  },
  {
    id:       'nl-n414-baarn-bunschoten',       // ~
    road:     'N414',
    name:     'N414 Baarn → Bunschoten',
    startLat:  52.2141,
    startLng:   5.2908,
    endLat:    52.2381,
    endLng:     5.3842,
    lengthM:   5_000,
    limitKmh:  80,
  },

  // ══ N564 Noord-Brabant (Best–Eindhoven) ═══════════════════════════════════

  {
    id:       'nl-n564-best-eindhoven',         // ~
    road:     'N564',
    name:     'N564 Best → Eindhoven',
    startLat:  51.4912,
    startLng:   5.0775,
    endLat:    51.4478,
    endLng:     5.0452,
    lengthM:   5_000,
    limitKmh:  80,
  },
  {
    id:       'nl-n564-eindhoven-best',         // ~
    road:     'N564',
    name:     'N564 Eindhoven → Best',
    startLat:  51.4478,
    startLng:   5.0452,
    endLat:    51.4912,
    endLng:     5.0775,
    lengthM:   5_000,
    limitKmh:  80,
  },

  // ══ N639 Zeeland/Noord-Brabant (Bergen op Zoom area) ══════════════════════

  {
    id:       'nl-n639-bergenopzoom-w',         // ~
    road:     'N639',
    name:     'N639 Bergen op Zoom W',
    startLat:  51.5178,
    startLng:   4.2072,
    endLat:    51.4748,
    endLng:     4.1685,
    lengthM:   5_000,
    limitKmh:  80,
  },
  {
    id:       'nl-n639-bergenopzoom-o',         // ~
    road:     'N639',
    name:     'N639 Bergen op Zoom O',
    startLat:  51.4748,
    startLng:   4.1685,
    endLat:    51.5178,
    endLng:     4.2072,
    lengthM:   5_000,
    limitKmh:  80,
  },

  // ══ N706 Flevoland / Gelderland (Harderwijk / Veluwe) ══════════════════════

  {
    id:       'nl-n706-harderwijk-veluwe',      // ~
    road:     'N706',
    name:     'N706 Harderwijk → Veluwe',
    startLat:  52.3572,
    startLng:   5.6182,
    endLat:    52.3132,
    endLng:     5.5745,
    lengthM:   5_000,
    limitKmh:  80,
  },
  {
    id:       'nl-n706-veluwe-harderwijk',      // ~
    road:     'N706',
    name:     'N706 Veluwe → Harderwijk',
    startLat:  52.3132,
    startLng:   5.5745,
    endLat:    52.3572,
    endLng:     5.6182,
    lengthM:   5_000,
    limitKmh:  80,
  },

  // ══ N787 Overijssel (Zwolle area) ═════════════════════════════════════════

  {
    id:       'nl-n787-zwolle-o',               // ~
    road:     'N787',
    name:     'N787 Zwolle Oost',
    startLat:  52.5802,
    startLng:   6.3322,
    endLat:    52.5295,
    endLng:     6.2938,
    lengthM:   5_000,
    limitKmh:  80,
  },
  {
    id:       'nl-n787-zwolle-w',               // ~
    road:     'N787',
    name:     'N787 Zwolle West',
    startLat:  52.5295,
    startLng:   6.2938,
    endLat:    52.5802,
    endLng:     6.3322,
    lengthM:   5_000,
    limitKmh:  80,
  },
]
