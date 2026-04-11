// ─── Verified speed section database — Bulgaria ────────────────────────
//
// Average-speed enforcement zones in Bulgaria.
// Sources: КАТ, road signs, verified driver reports, community database.
//
// Coordinates: approximate camera sign positions on the carriageway.
// Sections on non-motorway roads (Път І/ІІ) use town-level approximations
// and are marked with // ~ to indicate field verification is recommended.
//
// lengthM = road distance in metres (used for avg speed calculation).
// limitKmh = car speed limit (trucks are typically 80-90 km/h).
//
// To add a section: place start/end at the physical camera sign location,
// set lengthM = road distance (NOT straight-line haversine).
//
// For other countries see: sections_no.ts, sections_se.ts, sections_fi.ts
// Dispatcher:              getSectionsForCountry(code)  ← bottom of this file

import type { SpeedSection } from './sectionTypes'
import { SPEED_SECTIONS_NO } from './sections_no'
import { SPEED_SECTIONS_SE } from './sections_se'
import { SPEED_SECTIONS_FI } from './sections_fi'

export const SPEED_SECTIONS: SpeedSection[] = [

  // ══ АМ „Тракия" (A1) — east → west  (Sofia → Burgas direction) ════════

  {
    id:       'trakiya-vakarel-ihtiman',
    road:     'А1 Тракия',
    name:     'Вакарел — Ихтиман',
    startLat:  42.5315,
    startLng:  23.7548,
    endLat:    42.4312,
    endLng:    23.8215,
    lengthM:   19_000,
    limitKmh:  140,
  },
  {
    id:       'trakiya-vetren-krastina',
    road:     'А1 Тракия',
    name:     'Ветрен — Кръстина',
    startLat:  42.2640,
    startLng:  24.0730,
    endLat:    42.2700,
    endLng:    24.2260,
    lengthM:   13_600,
    limitKmh:  140,
  },
  {
    id:       'trakiya-pazardjik-plovdiv',
    road:     'А1 Тракия',
    name:     'Пазарджик — Пловдив',
    startLat:  42.1913,
    startLng:  24.3448,
    endLat:    42.1491,
    endLng:    24.6718,
    lengthM:   27_000,
    limitKmh:  140,
  },
  {
    id:       'trakiya-chirpan-opulchenets',
    road:     'А1 Тракия',
    name:     'Чирпан — Опълченец',
    startLat:  42.1100,
    startLng:  25.2200,
    endLat:    42.0950,
    endLng:    25.0680,
    lengthM:   13_300,
    limitKmh:  140,
  },
  {
    id:       'trakiya-opulchenets-trilistnik',
    road:     'А1 Тракия',
    name:     'Опълченец — Трилистник',
    startLat:  42.0950,
    startLng:  25.0680,
    endLat:    42.0680,
    endLng:    24.8800,
    lengthM:   22_000,
    limitKmh:  140,
  },
  {
    id:       'trakiya-trilistnik-tsaratsovo',
    road:     'А1 Тракия',
    name:     'Трилистник — Царацово',
    startLat:  42.0680,
    startLng:  24.8800,
    endLat:    42.1180,
    endLng:    24.7200,
    lengthM:   14_400,
    limitKmh:  140,
  },
  {
    id:       'trakiya-tsaratsovo-radinovo',
    road:     'А1 Тракия',
    name:     'Царацово — Радиново',
    startLat:  42.1180,
    startLng:  24.7200,
    endLat:    42.1130,
    endLng:    24.6770,
    lengthM:   4_000,
    limitKmh:  140,
  },
  {
    id:       'trakiya-radinovo-tsalapitsa',
    road:     'А1 Тракия',
    name:     'Радиново — Цалапица',
    startLat:  42.1130,
    startLng:  24.6770,
    endLat:    42.1130,
    endLng:    24.5720,
    lengthM:   10_900,
    limitKmh:  140,
  },
  {
    id:       'trakiya-tsalapitsa-shtarkovo',
    road:     'А1 Тракия',
    name:     'Цалапица — Щърково',
    startLat:  42.1130,
    startLng:  24.5720,
    endLat:    42.0950,
    endLng:    24.2840,
    lengthM:   25_400,
    limitKmh:  140,
  },
  {
    id:       'trakiya-plovdiv-iztok-belozem',
    road:     'А1 Тракия',
    name:     'Пловдив Изток — Белозем',
    startLat:  42.1483,
    startLng:  24.8203,
    endLat:    42.2128,
    endLng:    24.5793,
    lengthM:   25_000,
    limitKmh:  140,
  },
  {
    id:       'trakiya-stara-zagora-nova-zagora',
    road:     'А1 Тракия',
    name:     'Стара Загора — Нова Загора',
    startLat:  42.4241,
    startLng:  25.6374,
    endLat:    42.4897,
    endLng:    26.0018,
    lengthM:   30_000,
    limitKmh:  140,
  },
  {
    id:       'trakiya-nova-zagora-sliven',
    road:     'А1 Тракия',
    name:     'Нова Загора — Сливен',
    startLat:  42.4897,
    startLng:  26.0018,
    endLat:    42.6162,
    endLng:    26.2971,
    lengthM:   36_000,
    limitKmh:  140,
  },
  {
    id:       'trakiya-karnobat-burgas',
    road:     'А1 Тракия',
    name:     'Карнобат — Бургас',
    startLat:  42.6503,
    startLng:  26.9834,
    endLat:    42.4972,
    endLng:    27.4621,
    lengthM:   28_000,
    limitKmh:  140,
  },

  // ══ АМ „Тракия" (A1) — west → east  (Burgas → Sofia direction) ════════

  {
    id:       'trakiya-ihtiman-vakarel',
    road:     'А1 Тракия',
    name:     'Ихтиман — Вакарел',
    startLat:  42.4312,
    startLng:  23.8215,
    endLat:    42.5315,
    endLng:    23.7548,
    lengthM:   19_200,
    limitKmh:  140,
  },

  // ══ АМ „Хемус" (A2) — Sofia → Varna ════════════════════════════════════

  {
    id:       'hemos-gorni-bogrov-churek',
    road:     'АМ Хемус',
    name:     'Горни Богров — Чурек',
    startLat:  42.7410,
    startLng:  23.5340,
    endLat:    42.7980,
    endLng:    23.7570,
    lengthM:   20_200,
    limitKmh:  140,
  },
  {
    id:       'hemos-kaspichan-belokopitovo',
    road:     'АМ Хемус',
    name:     'Каспичан — Белокопитово',
    startLat:  43.3110,
    startLng:  27.0820,
    endLat:    43.2730,
    endLng:    26.8450,
    lengthM:   21_300,
    limitKmh:  140,
  },
  {
    id:       'hemos-ignatiyevo-devnya',
    road:     'АМ Хемус',
    name:     'Игнатиево — Девня',
    startLat:  43.3380,
    startLng:  27.6450,
    endLat:    43.2260,
    endLng:    27.5670,
    lengthM:   17_900,
    limitKmh:  140,
  },

  // ══ АМ „Струма" (A3) — north → south  (Sofia → Kulata) ══════════════

  {
    id:       'struma-tunel-malo-buchino-sofia',
    road:     'АМ Струма',
    name:     'Тунел Мало Бучино — София',
    startLat:  42.5000,
    startLng:  23.2470,
    endLat:    42.5450,
    endLng:    23.2680,
    lengthM:   7_500,
    limitKmh:  140,
  },
  {
    id:       'struma-blagoevgrad-bulgarchevo-pokrovnik',
    road:     'АМ Струма',
    name:     'Благоевград (Булгарчево — Покровник)',
    startLat:  42.0193,
    startLng:  23.1072,
    endLat:    42.0549,
    endLng:    23.0854,
    lengthM:   6_000,
    limitKmh:  140,
  },
  {
    id:       'struma-sandanski-damyanitsa',
    road:     'АМ Струма',
    name:     'Сандански — Дамяница',
    startLat:  41.5631,
    startLng:  23.2794,
    endLat:    41.6192,
    endLng:    23.3141,
    lengthM:   7_500,
    limitKmh:  140,
  },
  {
    id:       'struma-marikostinovo-damyanitsa',
    road:     'АМ Струма',
    name:     'Марикостиново — Дамяница',
    startLat:  41.5220,
    startLng:  23.3020,
    endLat:    41.6192,
    endLng:    23.3141,
    lengthM:   12_200,
    limitKmh:  140,
  },

  // ══ АМ „Струма" (A3) — south → north  (Kulata → Sofia) ══════════════

  {
    id:       'struma-pokrovnik-bulgarchevo',
    road:     'АМ Струма',
    name:     'Покровник — Българчево',
    startLat:  42.0549,
    startLng:  23.0854,
    endLat:    42.0379,
    endLng:    23.0905,
    lengthM:   2_300,
    limitKmh:  140,
  },
  {
    id:       'struma-damyanitsa-sandanski',
    road:     'АМ Струма',
    name:     'Дамяница — Сандански',
    startLat:  41.6192,
    startLng:  23.3141,
    endLat:    41.5631,
    endLng:    23.2794,
    lengthM:   7_300,
    limitKmh:  140,
  },

  // ══ АМ „Марица" (A4) — west → east  (Plovdiv → Turkey) ══════════════

  {
    id:       'maritza-harmanli-lyubimets',
    road:     'А4 Марица',
    name:     'Харманли — Любимец',
    startLat:  41.9330,
    startLng:  25.9001,
    endLat:    41.8341,
    endLng:    26.0874,
    lengthM:   18_000,
    limitKmh:  140,
  },
  {
    id:       'maritza-lyubimets-momkovo',
    road:     'А4 Марица',
    name:     'Любимец — Момково',
    startLat:  41.8341,
    startLng:  26.0874,
    endLat:    41.7791,
    endLng:    26.1923,
    lengthM:   12_000,
    limitKmh:  140,
  },
  {
    id:       'maritza-momkovo-svilengrad',
    road:     'А4 Марица',
    name:     'Момково — Свиленград',
    startLat:  41.7791,
    startLng:  26.1923,
    endLat:    41.7693,
    endLng:    26.3581,
    lengthM:   15_000,
    limitKmh:  140,
  },

  // ══ АМ „Марица" (A4) — east → west  (Turkey → Plovdiv) ══════════════

  {
    id:       'maritza-lyubimets-harmanli',
    road:     'А4 Марица',
    name:     'Любимец — Харманли',
    startLat:  41.8341,
    startLng:  26.0874,
    endLat:    41.9330,
    endLng:    25.9001,
    lengthM:   21_000,
    limitKmh:  140,
  },
  {
    id:       'maritza-momkovo-lyubimets',
    road:     'А4 Марица',
    name:     'Момково — Любимец',
    startLat:  41.7791,
    startLng:  26.1923,
    endLat:    41.8341,
    endLng:    26.0874,
    lengthM:   5_900,
    limitKmh:  140,
  },
  {
    id:       'maritza-svilengrad-momkovo',
    road:     'А4 Марица',
    name:     'Свиленград — Момково',
    startLat:  41.7693,
    startLng:  26.3581,
    endLat:    41.7791,
    endLng:    26.1923,
    lengthM:   9_000,
    limitKmh:  140,
  },

  // ══ АМ „Европа" (A6) — Sofia ring ════════════════════════════════════

  {
    id:       'evropa-chepintsi-iliyansi',
    road:     'АМ Европа',
    name:     'Чепинци — Илиянци',
    startLat:  42.7760,
    startLng:  23.3390,
    endLat:    42.7210,
    endLng:    23.3150,
    lengthM:   10_300,
    limitKmh:  120,
  },

  // ══ Път І-1  (Sofia → Kulata / Sofia → Vidin) ═══════════════════════ ~

  {
    id:       'i1-kocherinovo-slatino',   // ~approximate
    road:     'Път І-1',
    name:     'Кочериново — Слатино',
    startLat:  42.0860,
    startLng:  23.0530,
    endLat:    42.0070,
    endLng:    23.0730,
    lengthM:   10_600,
    limitKmh:  90,
  },
  {
    id:       'i1-sratsimirovo-zheglitsa',  // ~approximate
    road:     'Път І-1',
    name:     'Срацимирово — Жеглица',
    startLat:  43.9120,
    startLng:  22.8260,
    endLat:    43.9360,
    endLng:    22.7760,
    lengthM:   7_500,
    limitKmh:  90,
  },

  // ══ Път І-2  (Sofia → Varna via Shumen) ═════════════════════════════ ~

  {
    id:       'i2-struyno-shumen',          // ~approximate
    road:     'Път І-2',
    name:     'Струйно — Шумен',
    startLat:  43.2900,
    startLng:  27.0200,
    endLat:    43.2710,
    endLng:    26.9400,
    lengthM:   7_700,
    limitKmh:  90,
  },

  // ══ Път І-3  (Botevgrad → Pleven → Ruse) ════════════════════════════ ~

  {
    id:       'i3-telish-dolni-dabnik',     // ~approximate
    road:     'Път І-3',
    name:     'Телиш — Долни Дъбник',
    startLat:  43.3970,
    startLng:  24.1450,
    endLat:    43.3530,
    endLng:    24.2840,
    lengthM:   21_700,
    limitKmh:  90,
  },
  {
    id:       'i3-gorna-studena-peychinovo',  // ~approximate
    road:     'Път І-3',
    name:     'Горна студена — Пейчиново',
    startLat:  43.3580,
    startLng:  25.3960,
    endLat:    43.3920,
    endLng:    25.1480,
    lengthM:   21_200,
    limitKmh:  90,
  },

  // ══ Път І-4  (Botevgrad → Troyan → Lovech area) ═════════════════════ ~

  {
    id:       'i4-sopot-balgarski-izvor',   // ~approximate
    road:     'Път І-4',
    name:     'Сопот — Български Извор',
    startLat:  42.9770,
    startLng:  24.1770,
    endLat:    43.0170,
    endLng:    24.1020,
    lengthM:   9_200,
    limitKmh:  90,
  },
  {
    id:       'i4-sopot-golets',            // ~approximate
    road:     'Път І-4',
    name:     'Сопот — Голец',
    startLat:  42.9770,
    startLng:  24.1770,
    endLat:    43.0840,
    endLng:    24.0650,
    lengthM:   17_900,
    limitKmh:  90,
  },
  {
    id:       'i4-ryahovtsite-bogatovo',    // ~approximate
    road:     'Път І-4',
    name:     'Ряховците — Богатово',
    startLat:  43.1750,
    startLng:  25.1120,
    endLat:    43.2070,
    endLng:    25.2270,
    lengthM:   16_900,
    limitKmh:  90,
  },
  {
    id:       'i4-bogatovo-momin-sbor',     // ~approximate
    road:     'Път І-4',
    name:     'Богатово — Момин сбор',
    startLat:  43.2070,
    startLng:  25.2270,
    endLat:    43.0980,
    endLng:    25.0650,
    lengthM:   23_700,
    limitKmh:  90,
  },
  {
    id:       'i4-prolaz-omurtag',          // ~approximate
    road:     'Път І-4',
    name:     'Пролаз — Омуртаг',
    startLat:  43.0560,
    startLng:  26.2910,
    endLat:    43.1050,
    endLng:    26.4240,
    lengthM:   13_400,
    limitKmh:  90,
  },

  // ══ Път І-5  (Ruse → Stara Zagora) ══════════════════════════════════ ~

  {
    id:       'i5-polski-trambesh-polikraishe',  // ~approximate
    road:     'Път І-5',
    name:     'Полски Тръмбеш — Поликраище',
    startLat:  43.3620,
    startLng:  25.6310,
    endLat:    43.2390,
    endLng:    25.5430,
    lengthM:   21_100,
    limitKmh:  90,
  },
  {
    id:       'i5-obretenk-trastenik',      // ~approximate
    road:     'Път І-5',
    name:     'Обретеник — Тръстеник',
    startLat:  43.4680,
    startLng:  25.0870,
    endLat:    43.4190,
    endLng:    25.0100,
    lengthM:   8_700,
    limitKmh:  90,
  },
  {
    id:       'i5-odylyanik-trastenik',     // ~approximate
    road:     'Път І-5',
    name:     'Одяланик — Тръстеник',
    startLat:  43.4600,
    startLng:  25.0850,
    endLat:    43.4190,
    endLng:    25.0100,
    lengthM:   14_600,
    limitKmh:  90,
  },
  {
    id:       'i5-samodvene-polikraishe',   // ~approximate
    road:     'Път І-5',
    name:     'Самоводене — Поликраище',
    startLat:  43.1970,
    startLng:  25.5490,
    endLat:    43.2390,
    endLng:    25.5430,
    lengthM:   6_500,
    limitKmh:  90,
  },
  {
    id:       'i5-yagoda-kazanlak',         // ~approximate
    road:     'Път І-5',
    name:     'Ягода — Казанлък',
    startLat:  42.5380,
    startLng:  25.3300,
    endLat:    42.6190,
    endLng:    25.3970,
    lengthM:   13_200,
    limitKmh:  90,
  },

  // ══ Път І-6  (Sofia → Pernik → Radomir) ══════════════════════════════ ~

  {
    id:       'i6-radomir-belanitsa',       // ~approximate
    road:     'Път І-6',
    name:     'Радомир — Беланица',
    startLat:  42.5470,
    startLng:  22.9630,
    endLat:    42.5030,
    endLng:    23.0270,
    lengthM:   8_400,
    limitKmh:  90,
  },

  // ══ Път ІІ-55  (near Veliko Tarnovo) ════════════════════════════════ ~

  {
    id:       'ii55-kilifar-vaglevtsi',     // ~approximate
    road:     'Път ІІ-55',
    name:     'Килифарево — Въглевци',
    startLat:  42.9330,
    startLng:  25.5510,
    endLat:    43.0020,
    endLng:    25.4450,
    lengthM:   13_200,
    limitKmh:  90,
  },
]

// ── Country dispatcher ────────────────────────────────────────────────────
// Returns the correct sections array for a given country code.
// Called on every GPS tick — returns a pre-built array reference (no allocation).

export function getSectionsForCountry(code: string): SpeedSection[] {
  switch (code) {
    case 'NO': return SPEED_SECTIONS_NO
    case 'SE': return SPEED_SECTIONS_SE
    case 'FI': return SPEED_SECTIONS_FI
    default:   return SPEED_SECTIONS    // BG and unknown → Bulgarian sections
  }
}
