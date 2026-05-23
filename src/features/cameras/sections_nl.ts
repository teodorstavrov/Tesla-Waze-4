// ─── Netherlands Trajectcontrole — Official verified sections ──────────────
//
// Source: Openbaar Ministerie (OM) + CJIB, Q1 2025.
// Only sections confirmed active by OM/CJIB — no community data.
//
// Direction notes:
//   A7  Hoorn → Purmerend : southbound only (toward Amsterdam)
//   A12 Zoetermeer → Nootdorp : westbound only (toward Den Haag)
//   All other sections: both directions.
//
// Dynamic speed limits (A2/A4/A10): enforced limit shown.
//   A2 Holendrecht–Maarssen : 100 km/h (max enforced; matrix sign 100/130)
//   A4 Hoofddorp area       : 130 km/h
//   A4 Leidschendam area    : 100 km/h
//   A10 Ring West           : 80 km/h
//
// Parallel carriageway on A12 Galecopperbrug has separate enforcement (80 km/h).
// N2 Maastricht is the surface route through the city (70 km/h).
// Enforcement is 24/7 with ~100% detection probability (OM statement).
//
// Sections marked // ~ have GPS coordinates that are approximate.

import type { SpeedSection } from './sectionTypes'

export const SPEED_SECTIONS_NL: SpeedSection[] = [

  // ══ A2 Amsterdam–Utrecht (Holendrecht–Maarssen) ════════════════════════════
  // Longest Dutch trajectcontrole: ~15.2 km, 100 km/h (dynamic matrix 100/130)

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

  // ══ A2 tunnel Maastricht ════════════════════════════════════════════════════
  // Underground tunnel through Maastricht, ~2.3 km, 100 km/h

  {
    id:       'nl-a2-maastricht-tunnel-n',
    road:     'A2',
    name:     'Maastricht tunnel Noord → Zuid',
    startLat:  50.8618,
    startLng:   5.6878,
    endLat:    50.8394,
    endLng:     5.6832,
    lengthM:   2_300,
    limitKmh:  100,
  },
  {
    id:       'nl-a2-maastricht-tunnel-z',
    road:     'A2',
    name:     'Maastricht tunnel Zuid → Noord',
    startLat:  50.8394,
    startLng:   5.6832,
    endLat:    50.8618,
    endLng:     5.6878,
    lengthM:   2_300,
    limitKmh:  100,
  },

  // ══ N2 Maastricht (surface road alongside A2 tunnel) ══════════════════════
  // Maasboulevard through city centre, ~2.3 km, 70 km/h

  {
    id:       'nl-n2-maastricht-n',             // ~
    road:     'N2',
    name:     'Maastricht Maasboulevard N → Z',
    startLat:  50.8618,
    startLng:   5.6905,
    endLat:    50.8394,
    endLng:     5.6886,
    lengthM:   2_300,
    limitKmh:  70,
  },
  {
    id:       'nl-n2-maastricht-z',             // ~
    road:     'N2',
    name:     'Maastricht Maasboulevard Z → N',
    startLat:  50.8394,
    startLng:   5.6886,
    endLat:    50.8618,
    endLng:     5.6905,
    lengthM:   2_300,
    limitKmh:  70,
  },

  // ══ A4 Leidschendam ↔ Zoeterwoude ══════════════════════════════════════════
  // South of Knooppunt Prins Clausplein, ~5 km, 100 km/h

  {
    id:       'nl-a4-leidschendam-zoeterwoude',
    road:     'A4',
    name:     'Leidschendam → Zoeterwoude',
    startLat:  52.0638,
    startLng:   4.4108,
    endLat:    52.0748,
    endLng:     4.4742,
    lengthM:   5_000,
    limitKmh:  100,
  },
  {
    id:       'nl-a4-zoeterwoude-leidschendam',
    road:     'A4',
    name:     'Zoeterwoude → Leidschendam',
    startLat:  52.0748,
    startLng:   4.4742,
    endLat:    52.0638,
    endLng:     4.4108,
    lengthM:   5_000,
    limitKmh:  100,
  },

  // ══ A4 Hoofddorp ↔ Nieuw Vennep ════════════════════════════════════════════
  // Haarlemmermeer, ~3.5 km, 130 km/h

  {
    id:       'nl-a4-hoofddorp-nieuwvennep',
    road:     'A4',
    name:     'Hoofddorp → Nieuw Vennep',
    startLat:  52.2802,
    startLng:   4.6172,
    endLat:    52.2512,
    endLng:     4.6302,
    lengthM:   3_500,
    limitKmh:  130,
  },
  {
    id:       'nl-a4-nieuwvennep-hoofddorp',
    road:     'A4',
    name:     'Nieuw Vennep → Hoofddorp',
    startLat:  52.2512,
    startLng:   4.6302,
    endLat:    52.2802,
    endLng:     4.6172,
    lengthM:   3_500,
    limitKmh:  130,
  },

  // ══ A7 Hoorn → Purmerend (southbound only) ═════════════════════════════════
  // One direction: toward Amsterdam, ~9.1 km, 100 km/h

  {
    id:       'nl-a7-hoorn-purmerend',
    road:     'A7',
    name:     'Hoorn → Purmerend',
    startLat:  52.6581,
    startLng:   5.0618,
    endLat:    52.5198,
    endLng:     4.9796,
    lengthM:   9_100,
    limitKmh:  100,
  },

  // ══ A10 Ring West Amsterdam — Nieuwe Meer ↔ Coentunnel ════════════════════
  // Western ring road, ~4.8 km, 80 km/h

  {
    id:       'nl-a10-nieuweemeer-coentunnel',
    road:     'A10',
    name:     'Nieuwe Meer → Coentunnel',
    startLat:  52.3472,
    startLng:   4.8445,
    endLat:    52.3870,
    endLng:     4.8278,
    lengthM:   4_800,
    limitKmh:  80,
  },
  {
    id:       'nl-a10-coentunnel-nieuweemeer',
    road:     'A10',
    name:     'Coentunnel → Nieuwe Meer',
    startLat:  52.3870,
    startLng:   4.8278,
    endLat:    52.3472,
    endLng:     4.8445,
    lengthM:   4_800,
    limitKmh:  80,
  },

  // ══ A12 Zoetermeer → Nootdorp (westbound only) ════════════════════════════
  // One direction: toward Den Haag, ~3 km, 130 km/h

  {
    id:       'nl-a12-zoetermeer-nootdorp',
    road:     'A12',
    name:     'Zoetermeer → Nootdorp',
    startLat:  52.0501,
    startLng:   4.4942,
    endLat:    52.0472,
    endLng:     4.4512,
    lengthM:   3_000,
    limitKmh:  130,
  },

  // ══ A12 Utrecht Galecopperbrug — main carriageway ═════════════════════════
  // Knooppunt Lunetten ↔ Oudenrijn, ~3.5 km, 100 km/h

  {
    id:       'nl-a12-lunetten-oudenrijn-main',
    road:     'A12',
    name:     'Galecopperbrug Lunetten → Oudenrijn',
    startLat:  52.0478,
    startLng:   5.1482,
    endLat:    52.0692,
    endLng:     5.0852,
    lengthM:   3_500,
    limitKmh:  100,
  },
  {
    id:       'nl-a12-oudenrijn-lunetten-main',
    road:     'A12',
    name:     'Galecopperbrug Oudenrijn → Lunetten',
    startLat:  52.0692,
    startLng:   5.0852,
    endLat:    52.0478,
    endLng:     5.1482,
    lengthM:   3_500,
    limitKmh:  100,
  },

  // ══ A12 Utrecht Galecopperbrug — parallel carriageway (plusbaan) ═══════════
  // Same section, separate enforcement, 80 km/h

  {
    id:       'nl-a12-lunetten-oudenrijn-par',
    road:     'A12',
    name:     'Galecopperbrug Lunetten → Oudenrijn (parallel)',
    startLat:  52.0478,
    startLng:   5.1482,
    endLat:    52.0692,
    endLng:     5.0852,
    lengthM:   3_500,
    limitKmh:  80,
  },
  {
    id:       'nl-a12-oudenrijn-lunetten-par',
    road:     'A12',
    name:     'Galecopperbrug Oudenrijn → Lunetten (parallel)',
    startLat:  52.0692,
    startLng:   5.0852,
    endLat:    52.0478,
    endLng:     5.1482,
    lengthM:   3_500,
    limitKmh:  80,
  },

  // ══ A13 Overschie — Berkel en Rodenrijs ↔ Kleinpolderplein ═══════════════
  // Approach to Rotterdam, ~5.6 km, 80 km/h

  {
    id:       'nl-a13-berkel-kleinpolder-z',
    road:     'A13',
    name:     'Berkel en Rodenrijs → Kleinpolderplein',
    startLat:  51.9932,
    startLng:   4.4768,
    endLat:    51.9612,
    endLng:     4.4352,
    lengthM:   5_600,
    limitKmh:  80,
  },
  {
    id:       'nl-a13-kleinpolder-berkel-n',
    road:     'A13',
    name:     'Kleinpolderplein → Berkel en Rodenrijs',
    startLat:  51.9612,
    startLng:   4.4352,
    endLat:    51.9932,
    endLng:     4.4768,
    lengthM:   5_600,
    limitKmh:  80,
  },

  // ══ A20 Rotterdam — Kleinpolderplein ↔ Terbregseplein ════════════════════
  // ~3.5 km, 100 km/h

  {
    id:       'nl-a20-kleinpolder-terbregseplein',
    road:     'A20',
    name:     'Kleinpolderplein → Terbregseplein',
    startLat:  51.9612,
    startLng:   4.4352,
    endLat:    51.9402,
    endLng:     4.5162,
    lengthM:   3_500,
    limitKmh:  100,
  },
  {
    id:       'nl-a20-terbregseplein-kleinpolder',
    road:     'A20',
    name:     'Terbregseplein → Kleinpolderplein',
    startLat:  51.9402,
    startLng:   4.5162,
    endLat:    51.9612,
    endLng:     4.4352,
    lengthM:   3_500,
    limitKmh:  100,
  },

  // ══ N62 Westerscheldetunnel ════════════════════════════════════════════════
  // Longest tunnel in the Netherlands, ~6.6 km, 100 km/h

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
    id:       'nl-n62-westerschelde-z',
    road:     'N62',
    name:     'Westerscheldetunnel Zuid → Noord',
    startLat:  51.3405,
    startLng:   3.8384,
    endLat:    51.3924,
    endLng:     3.7822,
    lengthM:   6_600,
    limitKmh:  100,
  },

  // ══ N9 Burgervlotbrug ↔ Sint Maartensvlotbrug (Noord-Holland) ═════════════

  {
    id:       'nl-n9-burgervlotbrug-n',         // ~
    road:     'N9',
    name:     'N9 Sint Maartensvlotbrug → Burgervlotbrug',
    startLat:  52.7922,
    startLng:   4.7832,
    endLat:    52.8212,
    endLng:     4.7452,
    lengthM:   4_000,
    limitKmh:  80,
  },
  {
    id:       'nl-n9-burgervlotbrug-z',         // ~
    road:     'N9',
    name:     'N9 Burgervlotbrug → Sint Maartensvlotbrug',
    startLat:  52.8212,
    startLng:   4.7452,
    endLat:    52.7922,
    endLng:     4.7832,
    lengthM:   4_000,
    limitKmh:  80,
  },

  // ══ N11 Alphen aan den Rijn ↔ Zoeterwoude-Rijndijk ════════════════════════

  {
    id:       'nl-n11-alphen-zoeterwoude',      // ~
    road:     'N11',
    name:     'N11 Alphen a/d Rijn → Zoeterwoude-Rijndijk',
    startLat:  52.1322,
    startLng:   4.6612,
    endLat:    52.0988,
    endLng:     4.5462,
    lengthM:   8_000,
    limitKmh:  80,
  },
  {
    id:       'nl-n11-zoeterwoude-alphen',      // ~
    road:     'N11',
    name:     'N11 Zoeterwoude-Rijndijk → Alphen a/d Rijn',
    startLat:  52.0988,
    startLng:   4.5462,
    endLat:    52.1322,
    endLng:     4.6612,
    lengthM:   8_000,
    limitKmh:  80,
  },

  // ══ N201 Uithoorn ══════════════════════════════════════════════════════════

  {
    id:       'nl-n201-uithoorn-e',             // ~
    road:     'N201',
    name:     'N201 Uithoorn Oost',
    startLat:  52.2342,
    startLng:   4.8312,
    endLat:    52.2532,
    endLng:     4.7692,
    lengthM:   5_000,
    limitKmh:  80,
  },
  {
    id:       'nl-n201-uithoorn-w',             // ~
    road:     'N201',
    name:     'N201 Uithoorn West',
    startLat:  52.2532,
    startLng:   4.7692,
    endLat:    52.2342,
    endLng:     4.8312,
    lengthM:   5_000,
    limitKmh:  80,
  },

  // ══ N205 N207 ↔ N232 (Haarlemmermeer) ══════════════════════════════════════

  {
    id:       'nl-n205-n207-n232-n',            // ~
    road:     'N205',
    name:     'N205 N207 → N232',
    startLat:  52.2202,
    startLng:   4.6042,
    endLat:    52.2682,
    endLng:     4.5672,
    lengthM:   6_000,
    limitKmh:  80,
  },
  {
    id:       'nl-n205-n232-n207-z',            // ~
    road:     'N205',
    name:     'N205 N232 → N207',
    startLat:  52.2682,
    startLng:   4.5672,
    endLat:    52.2202,
    endLng:     4.6042,
    lengthM:   6_000,
    limitKmh:  80,
  },

  // ══ N230 Utrecht Zuilense Ring ═════════════════════════════════════════════

  {
    id:       'nl-n230-zuilen-e',               // ~
    road:     'N230',
    name:     'N230 Zuilense Ring Oost',
    startLat:  52.1172,
    startLng:   5.0622,
    endLat:    52.0972,
    endLng:     5.0872,
    lengthM:   3_500,
    limitKmh:  80,
  },
  {
    id:       'nl-n230-zuilen-w',               // ~
    road:     'N230',
    name:     'N230 Zuilense Ring West',
    startLat:  52.0972,
    startLng:   5.0872,
    endLat:    52.1172,
    endLng:     5.0622,
    lengthM:   3_500,
    limitKmh:  80,
  },

  // ══ N253 Rondweg Sluis (Zeeland) ═══════════════════════════════════════════

  {
    id:       'nl-n253-sluis-e',                // ~
    road:     'N253',
    name:     'N253 Rondweg Sluis Oost',
    startLat:  51.2952,
    startLng:   3.5772,
    endLat:    51.3132,
    endLng:     3.6012,
    lengthM:   2_500,
    limitKmh:  80,
  },
  {
    id:       'nl-n253-sluis-w',                // ~
    road:     'N253',
    name:     'N253 Rondweg Sluis West',
    startLat:  51.3132,
    startLng:   3.6012,
    endLat:    51.2952,
    endLng:     3.5772,
    lengthM:   2_500,
    limitKmh:  80,
  },

  // ══ N256 Zeelandbrug (longest bridge in Netherlands: 5.02 km) ══════════════

  {
    id:       'nl-n256-zeelandbrug-n',
    road:     'N256',
    name:     'Zeelandbrug Noord → Zuid',
    startLat:  51.6592,
    startLng:   3.8702,
    endLat:    51.6108,
    endLng:     3.8492,
    lengthM:   5_020,
    limitKmh:  80,
  },
  {
    id:       'nl-n256-zeelandbrug-z',
    road:     'N256',
    name:     'Zeelandbrug Zuid → Noord',
    startLat:  51.6108,
    startLng:   3.8492,
    endLat:    51.6592,
    endLng:     3.8702,
    lengthM:   5_020,
    limitKmh:  80,
  },

  // ══ N260 Tilburg (Noord-Brabant) ═══════════════════════════════════════════

  {
    id:       'nl-n260-tilburg-e',              // ~
    road:     'N260',
    name:     'N260 Tilburg Oost',
    startLat:  51.5612,
    startLng:   4.9462,
    endLat:    51.5142,
    endLng:     5.0182,
    lengthM:   8_000,
    limitKmh:  80,
  },
  {
    id:       'nl-n260-tilburg-w',              // ~
    road:     'N260',
    name:     'N260 Tilburg West',
    startLat:  51.5142,
    startLng:   5.0182,
    endLat:    51.5612,
    endLng:     4.9462,
    lengthM:   8_000,
    limitKmh:  80,
  },

  // ══ N270 Venray ↔ Ysselsteyn (Noord-Limburg) ══════════════════════════════

  {
    id:       'nl-n270-venray-ysselsteyn',      // ~
    road:     'N270',
    name:     'N270 Venray → Ysselsteyn',
    startLat:  51.5242,
    startLng:   5.9772,
    endLat:    51.4682,
    endLng:     5.9842,
    lengthM:   6_200,
    limitKmh:  80,
  },
  {
    id:       'nl-n270-ysselsteyn-venray',      // ~
    road:     'N270',
    name:     'N270 Ysselsteyn → Venray',
    startLat:  51.4682,
    startLng:   5.9842,
    endLat:    51.5242,
    endLng:     5.9772,
    lengthM:   6_200,
    limitKmh:  80,
  },

  // ══ N275 Blerick ↔ Nederweert (Limburg) ═══════════════════════════════════
  // Long section through Limburg, ~32 km, 80 km/h

  {
    id:       'nl-n275-blerick-nederweert',     // ~
    road:     'N275',
    name:     'N275 Blerick → Nederweert',
    startLat:  51.3682,
    startLng:   6.1522,
    endLat:    51.2842,
    endLng:     5.7422,
    lengthM:   32_000,
    limitKmh:  80,
  },
  {
    id:       'nl-n275-nederweert-blerick',     // ~
    road:     'N275',
    name:     'N275 Nederweert → Blerick',
    startLat:  51.2842,
    startLng:   5.7422,
    endLat:    51.3682,
    endLng:     6.1522,
    lengthM:   32_000,
    limitKmh:  80,
  },

  // ══ N277 Ysselsteyn ↔ Vredepeel (Noord-Limburg / Noord-Brabant) ════════════

  {
    id:       'nl-n277-ysselsteyn-vredepeel',   // ~
    road:     'N277',
    name:     'N277 Ysselsteyn → Vredepeel',
    startLat:  51.4682,
    startLng:   5.9842,
    endLat:    51.5382,
    endLng:     5.8582,
    lengthM:   11_000,
    limitKmh:  80,
  },
  {
    id:       'nl-n277-vredepeel-ysselsteyn',   // ~
    road:     'N277',
    name:     'N277 Vredepeel → Ysselsteyn',
    startLat:  51.5382,
    startLng:   5.8582,
    endLat:    51.4682,
    endLng:     5.9842,
    lengthM:   11_000,
    limitKmh:  80,
  },

  // ══ N325 Arnhem Pleyroute ══════════════════════════════════════════════════

  {
    id:       'nl-n325-arnhem-pleyroute-n',     // ~
    road:     'N325',
    name:     'N325 Arnhem Pleyroute Noord',
    startLat:  51.9842,
    startLng:   5.9452,
    endLat:    51.9502,
    endLng:     5.9852,
    lengthM:   4_500,
    limitKmh:  80,
  },
  {
    id:       'nl-n325-arnhem-pleyroute-z',     // ~
    road:     'N325',
    name:     'N325 Arnhem Pleyroute Zuid',
    startLat:  51.9502,
    startLng:   5.9852,
    endLat:    51.9842,
    endLng:     5.9452,
    lengthM:   4_500,
    limitKmh:  80,
  },

  // ══ N333 Steenwijk ↔ Blokzijl (Overijssel) ════════════════════════════════

  {
    id:       'nl-n333-steenwijk-blokzijl',     // ~
    road:     'N333',
    name:     'N333 Steenwijk → Blokzijl',
    startLat:  52.7892,
    startLng:   6.1202,
    endLat:    52.7242,
    endLng:     5.9682,
    lengthM:   12_000,
    limitKmh:  80,
  },
  {
    id:       'nl-n333-blokzijl-steenwijk',     // ~
    road:     'N333',
    name:     'N333 Blokzijl → Steenwijk',
    startLat:  52.7242,
    startLng:   5.9682,
    endLat:    52.7892,
    endLng:     6.1202,
    lengthM:   12_000,
    limitKmh:  80,
  },

  // ══ N351 Wolvega ↔ Oosterwolde (Friesland) ════════════════════════════════

  {
    id:       'nl-n351-wolvega-oosterwolde',    // ~
    road:     'N351',
    name:     'N351 Wolvega → Oosterwolde',
    startLat:  52.8782,
    startLng:   6.0032,
    endLat:    52.9932,
    endLng:     6.2852,
    lengthM:   17_000,
    limitKmh:  80,
  },
  {
    id:       'nl-n351-oosterwolde-wolvega',    // ~
    road:     'N351',
    name:     'N351 Oosterwolde → Wolvega',
    startLat:  52.9932,
    startLng:   6.2852,
    endLat:    52.8782,
    endLng:     6.0032,
    lengthM:   17_000,
    limitKmh:  80,
  },

  // ══ N381 Drachten ↔ Donkerbroek (Friesland) ═══════════════════════════════

  {
    id:       'nl-n381-drachten-donkerbroek',   // ~
    road:     'N381',
    name:     'N381 Drachten → Donkerbroek',
    startLat:  53.1122,
    startLng:   6.0992,
    endLat:    52.9802,
    endLng:     6.2682,
    lengthM:   18_000,
    limitKmh:  80,
  },
  {
    id:       'nl-n381-donkerbroek-drachten',   // ~
    road:     'N381',
    name:     'N381 Donkerbroek → Drachten',
    startLat:  52.9802,
    startLng:   6.2682,
    endLat:    53.1122,
    endLng:     6.0992,
    lengthM:   18_000,
    limitKmh:  80,
  },

  // ══ N414 Eembrugge ↔ Bunschoten (Utrecht) ════════════════════════════════

  {
    id:       'nl-n414-eembrugge-bunschoten',   // ~
    road:     'N414',
    name:     'N414 Eembrugge → Bunschoten',
    startLat:  52.2132,
    startLng:   5.3102,
    endLat:    52.2402,
    endLng:     5.3882,
    lengthM:   6_000,
    limitKmh:  80,
  },
  {
    id:       'nl-n414-bunschoten-eembrugge',   // ~
    road:     'N414',
    name:     'N414 Bunschoten → Eembrugge',
    startLat:  52.2402,
    startLng:   5.3882,
    endLat:    52.2132,
    endLng:     5.3102,
    lengthM:   6_000,
    limitKmh:  80,
  },

  // ══ N564 Weert ↔ Belgische grens (Limburg) ════════════════════════════════

  {
    id:       'nl-n564-weert-belgie',           // ~
    road:     'N564',
    name:     'N564 Weert → Belgische grens',
    startLat:  51.2522,
    startLng:   5.7082,
    endLat:    51.1592,
    endLng:     5.6222,
    lengthM:   12_000,
    limitKmh:  80,
  },
  {
    id:       'nl-n564-belgie-weert',           // ~
    road:     'N564',
    name:     'N564 Belgische grens → Weert',
    startLat:  51.1592,
    startLng:   5.6222,
    endLat:    51.2522,
    endLng:     5.7082,
    lengthM:   12_000,
    limitKmh:  80,
  },

  // ══ N639 Chaam ↔ Baarle-Nassau (Noord-Brabant) ════════════════════════════

  {
    id:       'nl-n639-chaam-baarle',           // ~
    road:     'N639',
    name:     'N639 Chaam → Baarle-Nassau',
    startLat:  51.5162,
    startLng:   4.8582,
    endLat:    51.4422,
    endLng:     4.9332,
    lengthM:   12_000,
    limitKmh:  80,
  },
  {
    id:       'nl-n639-baarle-chaam',           // ~
    road:     'N639',
    name:     'N639 Baarle-Nassau → Chaam',
    startLat:  51.4422,
    startLng:   4.9332,
    endLat:    51.5162,
    endLng:     4.8582,
    lengthM:   12_000,
    limitKmh:  80,
  },

  // ══ N706 Vogelweg — A27 ↔ Lelystad Airport (Flevoland) ════════════════════

  {
    id:       'nl-n706-a27-lelystad-airport',   // ~
    road:     'N706',
    name:     'N706 Vogelweg A27 → Lelystad Airport',
    startLat:  52.5172,
    startLng:   5.4792,
    endLat:    52.4592,
    endLng:     5.5252,
    lengthM:   8_000,
    limitKmh:  80,
  },
  {
    id:       'nl-n706-lelystad-airport-a27',   // ~
    road:     'N706',
    name:     'N706 Vogelweg Lelystad Airport → A27',
    startLat:  52.4592,
    startLng:   5.5252,
    endLat:    52.5172,
    endLng:     5.4792,
    lengthM:   8_000,
    limitKmh:  80,
  },

  // ══ N787 Brummen ↔ Eerbeek (Gelderland) ═══════════════════════════════════

  {
    id:       'nl-n787-brummen-eerbeek',        // ~
    road:     'N787',
    name:     'N787 Brummen → Eerbeek',
    startLat:  52.0912,
    startLng:   6.1592,
    endLat:    52.0882,
    endLng:     6.0672,
    lengthM:   7_000,
    limitKmh:  80,
  },
  {
    id:       'nl-n787-eerbeek-brummen',        // ~
    road:     'N787',
    name:     'N787 Eerbeek → Brummen',
    startLat:  52.0882,
    startLng:   6.0672,
    endLat:    52.0912,
    endLng:     6.1592,
    lengthM:   7_000,
    limitKmh:  80,
  },
]
