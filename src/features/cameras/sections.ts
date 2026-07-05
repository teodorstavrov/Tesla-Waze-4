// ─── Verified speed section database — Bulgaria ────────────────────────
//
// All camera coordinates sourced from the official certified KML:
//   https://www.google.com/maps/d/viewer?mid=1bydr93x-u18Oz3lm7ngmWhVTgsP2Eys
//
// lengthM = road distance estimate (straight-line × 1.15 for motorways,
//           × 1.30 for I-class roads, × 1.35 for II-class roads).
// limitKmh = car speed limit (140 on A-class, 120 on A6, 90 on I/II-class).
//
// For other countries see: sections_no.ts, sections_se.ts, sections_fi.ts
// Dispatcher:              getSectionsForCountry(code)  ← bottom of this file

import type { SpeedSection } from './sectionTypes'
import { SPEED_SECTIONS_NO } from './sections_no'
import { SPEED_SECTIONS_SE } from './sections_se'
import { SPEED_SECTIONS_FI } from './sections_fi'
import { SPEED_SECTIONS_NL } from './sections_nl'

export const SPEED_SECTIONS: SpeedSection[] = [

  // ══ А1 „Тракия" — Sofia → Burgas ════════════════════════════════════════

  {
    id:       'a1-vakarel-ihtiman',
    road:     'А1 Тракия',
    name:     'Вакарел — Ихтиман',
    startLat:  42.550628,
    startLng:  23.702808,
    endLat:    42.426982,
    endLng:    23.854054,
    lengthM:   21_300,
    limitKmh:  140,
  },
  {
    id:       'a1-shtarkovo-tsalapitsa',
    road:     'А1 Тракия',
    name:     'Щърково — Цалапица',
    startLat:  42.295147,
    startLng:  24.232187,
    endLat:    42.205027,
    endLng:    24.508579,
    lengthM:   28_600,
    limitKmh:  140,
  },
  {
    id:       'a1-tsalapitsa-radinovo',
    road:     'А1 Тракия',
    name:     'Цалапица — Радиново',
    startLat:  42.205027,
    startLng:  24.508579,
    endLat:    42.198419,
    endLng:    24.640304,
    lengthM:   12_500,
    limitKmh:  140,
  },
  {
    id:       'a1-radinovo-tsaratsovo',
    road:     'А1 Тракия',
    name:     'Радиново — Царацово',
    startLat:  42.198419,
    startLng:  24.640304,
    endLat:    42.207607,
    endLng:    24.687699,
    lengthM:   4_600,
    limitKmh:  140,
  },
  {
    id:       'a1-tsaratsovo-trilistnik',
    road:     'А1 Тракия',
    name:     'Царацово — Трилистник',
    startLat:  42.207607,
    startLng:  24.687699,
    endLat:    42.216911,
    endLng:    24.859426,
    lengthM:   16_300,
    limitKmh:  140,
  },
  {
    id:       'a1-trilistnik-opulchenets',
    road:     'А1 Тракия',
    name:     'Трилистник — Опълченец',
    startLat:  42.216911,
    startLng:  24.859426,
    endLat:    42.199753,
    endLng:    25.121266,
    lengthM:   24_900,
    limitKmh:  140,
  },
  {
    id:       'a1-opulchenets-chirpan',
    road:     'А1 Тракия',
    name:     'Опълченец — Чирпан',
    startLat:  42.199753,
    startLng:  25.121266,
    endLat:    42.200859,
    endLng:    25.28097,
    lengthM:   15_100,
    limitKmh:  140,
  },
  {
    id:       'a1-krastina-vetren',
    road:     'А1 Тракия',
    name:     'Кръстина — Ветрен',
    startLat:  42.589288,
    startLng:  27.226377,
    endLat:    42.593438,
    endLng:    27.385821,
    lengthM:   15_000,
    limitKmh:  140,
  },

  // ══ А1 „Тракия" — Burgas → Sofia ════════════════════════════════════════

  {
    id:       'a1-ihtiman-vakarel',
    road:     'А1 Тракия',
    name:     'Ихтиман — Вакарел',
    startLat:  42.426982,
    startLng:  23.854054,
    endLat:    42.550628,
    endLng:    23.702808,
    lengthM:   21_300,
    limitKmh:  140,
  },
  {
    id:       'a1-tsalapitsa-shtarkovo',
    road:     'А1 Тракия',
    name:     'Цалапица — Щърково',
    startLat:  42.205027,
    startLng:  24.508579,
    endLat:    42.295147,
    endLng:    24.232187,
    lengthM:   28_600,
    limitKmh:  140,
  },
  {
    id:       'a1-radinovo-tsalapitsa',
    road:     'А1 Тракия',
    name:     'Радиново — Цалапица',
    startLat:  42.198419,
    startLng:  24.640304,
    endLat:    42.205027,
    endLng:    24.508579,
    lengthM:   12_500,
    limitKmh:  140,
  },
  {
    id:       'a1-tsaratsovo-radinovo',
    road:     'А1 Тракия',
    name:     'Царацово — Радиново',
    startLat:  42.207607,
    startLng:  24.687699,
    endLat:    42.198419,
    endLng:    24.640304,
    lengthM:   4_600,
    limitKmh:  140,
  },
  {
    id:       'a1-trilistnik-tsaratsovo',
    road:     'А1 Тракия',
    name:     'Трилистник — Царацово',
    startLat:  42.216911,
    startLng:  24.859426,
    endLat:    42.207607,
    endLng:    24.687699,
    lengthM:   16_300,
    limitKmh:  140,
  },
  {
    id:       'a1-opulchenets-trilistnik',
    road:     'А1 Тракия',
    name:     'Опълченец — Трилистник',
    startLat:  42.199753,
    startLng:  25.121266,
    endLat:    42.216911,
    endLng:    24.859426,
    lengthM:   24_900,
    limitKmh:  140,
  },
  {
    id:       'a1-chirpan-opulchenets',
    road:     'А1 Тракия',
    name:     'Чирпан — Опълченец',
    startLat:  42.200859,
    startLng:  25.28097,
    endLat:    42.199753,
    endLng:    25.121266,
    lengthM:   15_100,
    limitKmh:  140,
  },
  {
    id:       'a1-vetren-krastina',
    road:     'А1 Тракия',
    name:     'Ветрен — Кръстина',
    startLat:  42.593438,
    startLng:  27.385821,
    endLat:    42.589288,
    endLng:    27.226377,
    lengthM:   15_000,
    limitKmh:  140,
  },

  // ══ А2 „Хемус" — Sofia → Varna ══════════════════════════════════════════

  {
    id:       'a2-gorni-bogrov-churek',
    road:     'АМ Хемус',
    name:     'Горни Богров — Чурек',
    startLat:  42.725136,
    startLng:  23.527828,
    endLat:    42.778613,
    endLng:    23.736148,
    lengthM:   20_700,
    limitKmh:  140,
  },
  {
    id:       'a2-belokopitovo-kaspichan',
    road:     'АМ Хемус',
    name:     'Белокопитово — Каспичан',
    startLat:  43.337209,
    startLng:  26.900238,
    endLat:    43.323188,
    endLng:    27.149168,
    lengthM:   23_200,
    limitKmh:  140,
  },
  {
    id:       'a2-devnya-ignatiyevo',
    road:     'АМ Хемус',
    name:     'Девня — Игнатиево',
    startLat:  43.227186,
    startLng:  27.58358,
    endLat:    43.240615,
    endLng:    27.781235,
    lengthM:   18_500,
    limitKmh:  140,
  },
  {
    id:       'a2-ignatiyevo-devnya',
    road:     'АМ Хемус',
    name:     'Игнатиево — Девня',
    startLat:  43.240615,
    startLng:  27.781235,
    endLat:    43.227186,
    endLng:    27.58358,
    lengthM:   18_500,
    limitKmh:  140,
  },

  // ══ А2 „Хемус" — Varna → Sofia ══════════════════════════════════════════

  {
    id:       'a2-churek-gorni-bogrov',
    road:     'АМ Хемус',
    name:     'Чурек — Горни Богров',
    startLat:  42.778613,
    startLng:  23.736148,
    endLat:    42.725136,
    endLng:    23.527828,
    lengthM:   20_700,
    limitKmh:  140,
  },
  {
    id:       'a2-kaspichan-belokopitovo',
    road:     'АМ Хемус',
    name:     'Каспичан — Белокопитово',
    startLat:  43.323188,
    startLng:  27.149168,
    endLat:    43.337209,
    endLng:    26.900238,
    lengthM:   23_200,
    limitKmh:  140,
  },
  {
    id:       'a2-ignatiyevo-devnya',
    road:     'АМ Хемус',
    name:     'Игнатиево — Девня',
    startLat:  43.240615,
    startLng:  27.781235,
    endLat:    43.227186,
    endLng:    27.58358,
    lengthM:   18_500,
    limitKmh:  140,
  },

  // ══ А3 „Струма" — Sofia → Kulata ════════════════════════════════════════

  {
    id:       'a3-sofia-tunel-malo-buchino',
    road:     'АМ Струма',
    name:     'София — Тунел Мало Бучино',
    startLat:  42.71083,
    startLng:  23.222984,
    endLat:    42.677854,
    endLng:    23.152263,
    lengthM:   7_900,
    limitKmh:  140,
  },
  {
    id:       'a3-sandanski-damyanitsa',
    road:     'АМ Струма',
    name:     'Сандански — Дамяница',
    startLat:  41.573293,
    startLng:  23.239612,
    endLat:    41.51461,
    endLng:    23.271485,
    lengthM:   8_100,
    limitKmh:  140,
  },
  {
    id:       'a3-damyanitsa-marikostinovo',
    road:     'АМ Струма',
    name:     'Дамяница — Марикостиново',
    startLat:  41.51461,
    startLng:  23.271485,
    endLat:    41.419111,
    endLng:    23.333972,
    lengthM:   13_600,
    limitKmh:  140,
  },
  {
    id:       'a3-bulgarchevo-pokrovnik',
    road:     'АМ Струма',
    name:     'Българчево — Покровник',
    startLat:  42.011484,
    startLng:  23.044742,
    endLat:    41.991957,
    endLng:    23.053976,
    lengthM:   2_600,
    limitKmh:  140,
  },

  // ══ А3 „Струма" — Kulata → Sofia ════════════════════════════════════════

  {
    id:       'a3-tunel-malo-buchino-sofia',
    road:     'АМ Струма',
    name:     'Тунел Мало Бучино — София',
    startLat:  42.677854,
    startLng:  23.152263,
    endLat:    42.71083,
    endLng:    23.222984,
    lengthM:   7_900,
    limitKmh:  140,
  },
  {
    id:       'a3-damyanitsa-sandanski',
    road:     'АМ Струма',
    name:     'Дамяница — Сандански',
    startLat:  41.51461,
    startLng:  23.271485,
    endLat:    41.573293,
    endLng:    23.239612,
    lengthM:   8_100,
    limitKmh:  140,
  },
  {
    id:       'a3-marikostinovo-damyanitsa',
    road:     'АМ Струма',
    name:     'Марикостиново — Дамяница',
    startLat:  41.419111,
    startLng:  23.333972,
    endLat:    41.51461,
    endLng:    23.271485,
    lengthM:   13_600,
    limitKmh:  140,
  },
  {
    id:       'a3-pokrovnik-bulgarchevo',
    road:     'АМ Струма',
    name:     'Покровник — Българчево',
    startLat:  41.991957,
    startLng:  23.053976,
    endLat:    42.011484,
    endLng:    23.044742,
    lengthM:   2_600,
    limitKmh:  140,
  },

  // ══ А4 „Марица" — Plovdiv → Turkey ══════════════════════════════════════

  {
    id:       'a4-harmanli-lyubimets',
    road:     'А4 Марица',
    name:     'Харманли — Любимец',
    startLat:  41.957748,
    startLng:  25.882524,
    endLat:    41.862537,
    endLng:    26.087463,
    lengthM:   23_000,
    limitKmh:  140,
  },
  {
    id:       'a4-lyubimets-momkovo',
    road:     'А4 Марица',
    name:     'Любимец — Момково',
    startLat:  41.862537,
    startLng:  26.087463,
    endLat:    41.832228,
    endLng:    26.140614,
    lengthM:   6_400,
    limitKmh:  140,
  },
  {
    id:       'a4-momkovo-svilengrad',
    road:     'А4 Марица',
    name:     'Момково — Свиленград',
    startLat:  41.832228,
    startLng:  26.140614,
    endLat:    41.778823,
    endLng:    26.21728,
    lengthM:   10_000,
    limitKmh:  140,
  },

  // ══ А4 „Марица" — Turkey → Plovdiv ══════════════════════════════════════

  {
    id:       'a4-lyubimets-harmanli',
    road:     'А4 Марица',
    name:     'Любимец — Харманли',
    startLat:  41.862537,
    startLng:  26.087463,
    endLat:    41.957748,
    endLng:    25.882524,
    lengthM:   23_000,
    limitKmh:  140,
  },
  {
    id:       'a4-momkovo-lyubimets',
    road:     'А4 Марица',
    name:     'Момково — Любимец',
    startLat:  41.832228,
    startLng:  26.140614,
    endLat:    41.862537,
    endLng:    26.087463,
    lengthM:   6_400,
    limitKmh:  140,
  },
  {
    id:       'a4-svilengrad-momkovo',
    road:     'А4 Марица',
    name:     'Свиленград — Момково',
    startLat:  41.778823,
    startLng:  26.21728,
    endLat:    41.832228,
    endLng:    26.140614,
    lengthM:   10_000,
    limitKmh:  140,
  },

  // ══ АМ „Европа" (А6) ════════════════════════════════════════════════════

  {
    id:       'a6-iliyansi-chepintsi',
    road:     'АМ Европа',
    name:     'Илиянци — Чепинци',
    startLat:  42.765374,
    startLng:  23.296963,
    endLat:    42.719674,
    endLng:    23.400498,
    lengthM:   11_300,
    limitKmh:  120,
  },
  {
    id:       'a6-chepintsi-iliyansi',
    road:     'АМ Европа',
    name:     'Чепинци — Илиянци',
    startLat:  42.719674,
    startLng:  23.400498,
    endLat:    42.765374,
    endLng:    23.296963,
    lengthM:   11_300,
    limitKmh:  120,
  },

  // ══ Път І-1 ══════════════════════════════════════════════════════════════

  {
    id:       'i1-zheglitsa-sratsimirovo',   // ~approximate
    road:     'Път І-1',
    name:     'Жеглица — Срацимирово',
    startLat:  43.87851,
    startLng:  22.789281,
    endLat:    43.820182,
    endLng:    22.757334,
    lengthM:   9_100,
    limitKmh:  90,
  },
  {
    id:       'i1-sratsimirovo-zheglitsa',   // ~approximate
    road:     'Път І-1',
    name:     'Срацимирово — Жеглица',
    startLat:  43.820182,
    startLng:  22.757334,
    endLat:    43.87851,
    endLng:    22.789281,
    lengthM:   9_100,
    limitKmh:  90,
  },
  {
    id:       'i1-slatino-kocherinovo',      // ~approximate
    road:     'Път І-1',
    name:     'Слатино — Кочериново',
    startLat:  42.157969,
    startLng:  23.041098,
    endLat:    42.064083,
    endLng:    23.0385,
    lengthM:   13_600,
    limitKmh:  90,
  },
  {
    id:       'i1-kocherinovo-slatino',      // ~approximate
    road:     'Път І-1',
    name:     'Кочериново — Слатино',
    startLat:  42.064083,
    startLng:  23.0385,
    endLat:    42.157969,
    endLng:    23.041098,
    lengthM:   13_600,
    limitKmh:  90,
  },

  // ══ Път І-2 ══════════════════════════════════════════════════════════════

  {
    id:       'i2-struyno-shumen',           // ~approximate
    road:     'Път І-2',
    name:     'Струйно — Шумен',
    startLat:  43.362035,
    startLng:  26.851199,
    endLat:    43.317481,
    endLng:    26.920131,
    lengthM:   9_700,
    limitKmh:  90,
  },
  {
    id:       'i2-shumen-struyno',           // ~approximate
    road:     'Път І-2',
    name:     'Шумен — Струйно',
    startLat:  43.317481,
    startLng:  26.920131,
    endLat:    43.362035,
    endLng:    26.851199,
    lengthM:   9_700,
    limitKmh:  90,
  },

  // ══ Път І-3 ══════════════════════════════════════════════════════════════

  {
    id:       'i3-dolni-dabnik-telish',      // ~approximate
    road:     'Път І-3',
    name:     'Долни Дъбник — Телиш',
    startLat:  43.416195,
    startLng:  24.470534,
    endLat:    43.326179,
    endLng:    24.272019,
    lengthM:   24_600,
    limitKmh:  90,
  },
  {
    id:       'i3-telish-dolni-dabnik',      // ~approximate
    road:     'Път І-3',
    name:     'Телиш — Долни Дъбник',
    startLat:  43.326179,
    startLng:  24.272019,
    endLat:    43.416195,
    endLng:    24.470534,
    lengthM:   24_600,
    limitKmh:  90,
  },
  {
    id:       'i3-peychinovo-gorna-studena', // ~approximate
    road:     'Път І-3',
    name:     'Пейчиново — Горна Студена',
    startLat:  43.442128,
    startLng:  25.610163,
    endLat:    43.416328,
    endLng:    25.358761,
    lengthM:   26_700,
    limitKmh:  90,
  },
  {
    id:       'i3-gorna-studena-peychinovo', // ~approximate
    road:     'Път І-3',
    name:     'Горна Студена — Пейчиново',
    startLat:  43.416328,
    startLng:  25.358761,
    endLat:    43.442128,
    endLng:    25.610163,
    lengthM:   26_700,
    limitKmh:  90,
  },

  // ══ Път І-4 ══════════════════════════════════════════════════════════════

  {
    id:       'i4-sopot-balgarski-izvor',    // ~approximate
    road:     'Път І-4',
    name:     'Сопот — Български Извор',
    startLat:  43.034242,
    startLng:  24.38194,
    endLat:    43.038369,
    endLng:    24.273892,
    lengthM:   11_400,
    limitKmh:  90,
  },
  {
    id:       'i4-balgarski-izvor-sopot',    // ~approximate
    road:     'Път І-4',
    name:     'Български Извор — Сопот',
    startLat:  43.038369,
    startLng:  24.273892,
    endLat:    43.034242,
    endLng:    24.38194,
    lengthM:   11_400,
    limitKmh:  90,
  },
  {
    id:       'i4-sopot-golets',             // ~approximate
    road:     'Път І-4',
    name:     'Сопот — Голец',
    startLat:  43.034242,
    startLng:  24.38194,
    endLat:    43.042505,
    endLng:    24.596227,
    lengthM:   22_700,
    limitKmh:  90,
  },
  {
    id:       'i4-golets-sopot',             // ~approximate
    road:     'Път І-4',
    name:     'Голец — Сопот',
    startLat:  43.042505,
    startLng:  24.596227,
    endLat:    43.034242,
    endLng:    24.38194,
    lengthM:   22_700,
    limitKmh:  90,
  },
  {
    id:       'i4-ryahovtsite-bogatovo',     // ~approximate
    road:     'Път І-4',
    name:     'Ряховците — Богатово',
    startLat:  43.033159,
    startLng:  25.010429,
    endLat:    43.042734,
    endLng:    25.215309,
    lengthM:   21_700,
    limitKmh:  90,
  },
  {
    id:       'i4-bogatovo-ryahovtsite',     // ~approximate
    road:     'Път І-4',
    name:     'Богатово — Ряховците',
    startLat:  43.042734,
    startLng:  25.215309,
    endLat:    43.033159,
    endLng:    25.010429,
    lengthM:   21_700,
    limitKmh:  90,
  },
  {
    id:       'i4-bogatovo-momin-sbor',      // ~approximate
    road:     'Път І-4',
    name:     'Богатово — Момин Сбор',
    startLat:  43.042734,
    startLng:  25.215309,
    endLat:    43.088946,
    endLng:    25.485926,
    lengthM:   29_300,
    limitKmh:  90,
  },
  {
    id:       'i4-momin-sbor-bogatovo',      // ~approximate
    road:     'Път І-4',
    name:     'Момин Сбор — Богатово',
    startLat:  43.088946,
    startLng:  25.485926,
    endLat:    43.042734,
    endLng:    25.215309,
    lengthM:   29_300,
    limitKmh:  90,
  },
  {
    id:       'i4-omurtag-prolaz',           // ~approximate
    road:     'Път І-4',
    name:     'Омуртаг — Пролаз',
    startLat:  43.118197,
    startLng:  26.415056,
    endLat:    43.196646,
    endLng:    26.502398,
    lengthM:   14_600,
    limitKmh:  90,
  },
  {
    id:       'i4-prolaz-omurtag',           // ~approximate
    road:     'Път І-4',
    name:     'Пролаз — Омуртаг',
    startLat:  43.196646,
    startLng:  26.502398,
    endLat:    43.118197,
    endLng:    26.415056,
    lengthM:   14_600,
    limitKmh:  90,
  },

  // ══ Път І-5 ══════════════════════════════════════════════════════════════

  {
    id:       'i5-polski-trambesh-polikraishe',  // ~approximate
    road:     'Път І-5',
    name:     'Полски Тръмбеш — Поликраище',
    startLat:  43.371964,
    startLng:  25.644339,
    endLat:    43.189637,
    endLng:    25.621892,
    lengthM:   26_500,
    limitKmh:  90,
  },
  {
    id:       'i5-polikraishe-polski-trambesh',  // ~approximate
    road:     'Път І-5',
    name:     'Поликраище — Полски Тръмбеш',
    startLat:  43.189637,
    startLng:  25.621892,
    endLat:    43.371964,
    endLng:    25.644339,
    lengthM:   26_500,
    limitKmh:  90,
  },
  {
    id:       'i5-obretenk-trastenik',       // ~approximate
    road:     'Път І-5',
    name:     'Обретеник — Тръстеник',
    startLat:  43.57196,
    startLng:  25.822121,
    endLat:    43.639798,
    endLng:    25.872558,
    lengthM:   11_100,
    limitKmh:  90,
  },
  {
    id:       'i5-trastenik-obretenk',       // ~approximate
    road:     'Път І-5',
    name:     'Тръстеник — Обретеник',
    startLat:  43.639798,
    startLng:  25.872558,
    endLat:    43.57196,
    endLng:    25.822121,
    lengthM:   11_100,
    limitKmh:  90,
  },
  {
    id:       'i5-odylyanik-trastenik',      // ~approximate
    road:     'Път І-5',
    name:     'Одяланик — Тръстеник',
    startLat:  43.756638,
    startLng:  25.906651,
    endLat:    43.639798,
    endLng:    25.872558,
    lengthM:   17_300,
    limitKmh:  90,
  },
  {
    id:       'i5-trastenik-odylyanik',      // ~approximate
    road:     'Път І-5',
    name:     'Тръстеник — Одяланик',
    startLat:  43.639798,
    startLng:  25.872558,
    endLat:    43.756638,
    endLng:    25.906651,
    lengthM:   17_300,
    limitKmh:  90,
  },
  {
    id:       'i5-polikraishe-samodvene',    // ~approximate
    road:     'Път І-5',
    name:     'Поликраище — Самоводяне',
    startLat:  43.189637,
    startLng:  25.621892,
    endLat:    43.134324,
    endLng:    25.613217,
    lengthM:   8_000,
    limitKmh:  90,
  },
  {
    id:       'i5-samodvene-polikraishe',    // ~approximate
    road:     'Път І-5',
    name:     'Самоводяне — Поликраище',
    startLat:  43.134324,
    startLng:  25.613217,
    endLat:    43.189637,
    endLng:    25.621892,
    lengthM:   8_000,
    limitKmh:  90,
  },
  {
    id:       'i5-kazanlak-yagoda',          // ~approximate
    road:     'Път І-5',
    name:     'Казанлък — Ягода',
    startLat:  42.61357,
    startLng:  25.43539,
    endLat:    42.547573,
    endLng:    25.559393,
    lengthM:   16_300,
    limitKmh:  90,
  },
  {
    id:       'i5-yagoda-kazanlak',          // ~approximate
    road:     'Път І-5',
    name:     'Ягода — Казанлък',
    startLat:  42.547573,
    startLng:  25.559393,
    endLat:    42.61357,
    endLng:    25.43539,
    lengthM:   16_300,
    limitKmh:  90,
  },

  // ══ Път І-6 ══════════════════════════════════════════════════════════════

  {
    id:       'i6-belanitsa-radomir',        // ~approximate
    road:     'Път І-6',
    name:     'Беланица — Радомир',
    startLat:  42.487678,
    startLng:  22.927248,
    endLat:    42.554996,
    endLng:    22.965185,
    lengthM:   10_500,
    limitKmh:  90,
  },
  {
    id:       'i6-radomir-belanitsa',        // ~approximate
    road:     'Път І-6',
    name:     'Радомир — Беланица',
    startLat:  42.554996,
    startLng:  22.965185,
    endLat:    42.487678,
    endLng:    22.927248,
    lengthM:   10_500,
    limitKmh:  90,
  },

  // ══ Път ІІ-55 ════════════════════════════════════════════════════════════

  {
    id:       'ii55-kilifar-vaglevtsi',      // ~approximate
    road:     'Път ІІ-55',
    name:     'Килифарево — Въглевци',
    startLat:  42.999615,
    startLng:  25.614789,
    endLat:    42.906826,
    endLng:    25.649435,
    lengthM:   14_400,
    limitKmh:  90,
  },
  {
    id:       'ii55-vaglevtsi-kilifar',      // ~approximate
    road:     'Път ІІ-55',
    name:     'Въглевци — Килифарево',
    startLat:  42.906826,
    startLng:  25.649435,
    endLat:    42.999615,
    endLng:    25.614789,
    lengthM:   14_400,
    limitKmh:  90,
  },
]

// ── Country dispatcher ────────────────────────────────────────────────────
// Returns the correct sections array for a given country code.
// Called on every GPS tick — returns a pre-built array reference (no allocation).

const SPEED_SECTIONS_BE: SpeedSection[] = []   // no verified official BE dataset yet

export function getSectionsForCountry(code: string): SpeedSection[] {
  switch (code) {
    case 'NO': return SPEED_SECTIONS_NO
    case 'SE': return SPEED_SECTIONS_SE
    case 'FI': return SPEED_SECTIONS_FI
    case 'NL': return SPEED_SECTIONS_NL
    case 'BE': return SPEED_SECTIONS_BE
    default:   return SPEED_SECTIONS    // BG and unknown → Bulgarian sections
  }
}
