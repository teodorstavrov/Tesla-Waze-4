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

  // ══ АМ „Тракия" (A1) — Sofia → Burgas ════════════════════════════════

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
    startLat:  42.6400,
    startLng:  27.1700,
    endLat:    42.5550,
    endLng:    27.3350,
    lengthM:   13_600,
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

  // ══ АМ „Тракия" (A1) — Burgas → Sofia ════════════════════════════════

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
  {
    id:       'trakiya-shtarkovo-tsalapitsa',
    road:     'А1 Тракия',
    name:     'Щърково — Цалапица',
    startLat:  42.0950,
    startLng:  24.2840,
    endLat:    42.1130,
    endLng:    24.5720,
    lengthM:   25_400,
    limitKmh:  140,
  },
  {
    id:       'trakiya-tsalapitsa-radinovo',
    road:     'А1 Тракия',
    name:     'Цалапица — Радиново',
    startLat:  42.1130,
    startLng:  24.5720,
    endLat:    42.1130,
    endLng:    24.6770,
    lengthM:   10_900,
    limitKmh:  140,
  },
  {
    id:       'trakiya-radinovo-tsaratsovo',
    road:     'А1 Тракия',
    name:     'Радиново — Царацово',
    startLat:  42.1130,
    startLng:  24.6770,
    endLat:    42.1180,
    endLng:    24.7200,
    lengthM:   4_000,
    limitKmh:  140,
  },
  {
    id:       'trakiya-tsaratsovo-trilistnik',
    road:     'А1 Тракия',
    name:     'Царацово — Трилистник',
    startLat:  42.1180,
    startLng:  24.7200,
    endLat:    42.0680,
    endLng:    24.8800,
    lengthM:   14_400,
    limitKmh:  140,
  },
  {
    id:       'trakiya-trilistnik-opulchenets',
    road:     'А1 Тракия',
    name:     'Трилистник — Опълченец',
    startLat:  42.0680,
    startLng:  24.8800,
    endLat:    42.0950,
    endLng:    25.0680,
    lengthM:   22_000,
    limitKmh:  140,
  },
  {
    id:       'trakiya-opulchenets-chirpan',
    road:     'А1 Тракия',
    name:     'Опълченец — Чирпан',
    startLat:  42.0950,
    startLng:  25.0680,
    endLat:    42.1100,
    endLng:    25.2200,
    lengthM:   13_300,
    limitKmh:  140,
  },
  {
    id:       'trakiya-krastina-vetren',
    road:     'А1 Тракия',
    name:     'Кръстина — Ветрен',
    startLat:  42.5550,
    startLng:  27.3350,
    endLat:    42.6400,
    endLng:    27.1700,
    lengthM:   13_600,
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

  // ══ АМ „Хемус" (A2) — Varna → Sofia ════════════════════════════════════

  {
    id:       'hemos-churek-gorni-bogrov',
    road:     'АМ Хемус',
    name:     'Чурек — Горни Богров',
    startLat:  42.7980,
    startLng:  23.7570,
    endLat:    42.7410,
    endLng:    23.5340,
    lengthM:   20_200,
    limitKmh:  140,
  },
  {
    id:       'hemos-belokopitovo-kaspichan',
    road:     'АМ Хемус',
    name:     'Белокопитово — Каспичан',
    startLat:  43.2730,
    startLng:  26.8450,
    endLat:    43.3110,
    endLng:    27.0820,
    lengthM:   21_300,
    limitKmh:  140,
  },
  {
    id:       'hemos-devnya-ignatiyevo',
    road:     'АМ Хемус',
    name:     'Девня — Игнатиево',
    startLat:  43.2260,
    startLng:  27.5670,
    endLat:    43.3380,
    endLng:    27.6450,
    lengthM:   17_900,
    limitKmh:  140,
  },

  // ══ АМ „Струма" (A3) — Sofia → Kulata ══════════════════════════════════

  {
    id:       'struma-sofia-tunel-malo-buchino',
    road:     'АМ Струма',
    name:     'София — Тунел Мало Бучино',
    startLat:  42.5450,
    startLng:  23.2680,
    endLat:    42.5000,
    endLng:    23.2470,
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

  // ══ АМ „Струма" (A3) — Kulata → Sofia ══════════════════════════════════

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
  {
    id:       'struma-damyanitsa-marikostinovo',
    road:     'АМ Струма',
    name:     'Дамяница — Марикостиново',
    startLat:  41.6192,
    startLng:  23.3141,
    endLat:    41.5220,
    endLng:    23.3020,
    lengthM:   12_200,
    limitKmh:  140,
  },

  // ══ АМ „Марица" (A4) — Plovdiv → Turkey ════════════════════════════════

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

  // ══ АМ „Марица" (A4) — Turkey → Plovdiv ════════════════════════════════

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

  // ══ АМ „Европа" (A6) ════════════════════════════════════════════════════

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
  {
    id:       'evropa-iliyansi-chepintsi',
    road:     'АМ Европа',
    name:     'Илиянци — Чепинци',
    startLat:  42.7210,
    startLng:  23.3150,
    endLat:    42.7760,
    endLng:    23.3390,
    lengthM:   10_300,
    limitKmh:  120,
  },

  // ══ Път І-1  (Sofia — Kulata / Sofia — Vidin) ════════════════════════ ~

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
    id:       'i1-slatino-kocherinovo',   // ~approximate
    road:     'Път І-1',
    name:     'Слатино — Кочериново',
    startLat:  42.0070,
    startLng:  23.0730,
    endLat:    42.0860,
    endLng:    23.0530,
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
  {
    id:       'i1-zheglitsa-sratsimirovo',  // ~approximate
    road:     'Път І-1',
    name:     'Жеглица — Срацимирово',
    startLat:  43.9360,
    startLng:  22.7760,
    endLat:    43.9120,
    endLng:    22.8260,
    lengthM:   7_500,
    limitKmh:  90,
  },

  // ══ Път І-2  (Sofia — Varna via Shumen) ══════════════════════════════ ~

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
  {
    id:       'i2-shumen-struyno',          // ~approximate
    road:     'Път І-2',
    name:     'Шумен — Струйно',
    startLat:  43.2710,
    startLng:  26.9400,
    endLat:    43.2900,
    endLng:    27.0200,
    lengthM:   7_700,
    limitKmh:  90,
  },

  // ══ Път І-3  (Botevgrad — Pleven — Ruse) ════════════════════════════ ~

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
    id:       'i3-dolni-dabnik-telish',     // ~approximate
    road:     'Път І-3',
    name:     'Долни Дъбник — Телиш',
    startLat:  43.3530,
    startLng:  24.2840,
    endLat:    43.3970,
    endLng:    24.1450,
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
  {
    id:       'i3-peychinovo-gorna-studena',  // ~approximate
    road:     'Път І-3',
    name:     'Пейчиново — Горна Студена',
    startLat:  43.3920,
    startLng:  25.1480,
    endLat:    43.3580,
    endLng:    25.3960,
    lengthM:   21_200,
    limitKmh:  90,
  },

  // ══ Път І-4  (Botevgrad — Troyan — Lovech area) ══════════════════════ ~

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
    id:       'i4-balgarski-izvor-sopot',   // ~approximate
    road:     'Път І-4',
    name:     'Български Извор — Сопот',
    startLat:  43.0170,
    startLng:  24.1020,
    endLat:    42.9770,
    endLng:    24.1770,
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
    id:       'i4-golets-sopot',            // ~approximate
    road:     'Път І-4',
    name:     'Голец — Сопот',
    startLat:  43.0840,
    startLng:  24.0650,
    endLat:    42.9770,
    endLng:    24.1770,
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
    id:       'i4-bogatovo-ryahovtsite',    // ~approximate
    road:     'Път І-4',
    name:     'Богатово — Ряховците',
    startLat:  43.2070,
    startLng:  25.2270,
    endLat:    43.1750,
    endLng:    25.1120,
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
    id:       'i4-momin-sbor-bogatovo',     // ~approximate
    road:     'Път І-4',
    name:     'Момин сбор — Богатово',
    startLat:  43.0980,
    startLng:  25.0650,
    endLat:    43.2070,
    endLng:    25.2270,
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
  {
    id:       'i4-omurtag-prolaz',          // ~approximate
    road:     'Път І-4',
    name:     'Омуртаг — Пролаз',
    startLat:  43.1050,
    startLng:  26.4240,
    endLat:    43.0560,
    endLng:    26.2910,
    lengthM:   13_400,
    limitKmh:  90,
  },

  // ══ Път І-5  (Ruse — Stara Zagora) ══════════════════════════════════ ~

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
    id:       'i5-polikraishe-polski-trambesh',  // ~approximate
    road:     'Път І-5',
    name:     'Поликраище — Полски Тръмбеш',
    startLat:  43.2390,
    startLng:  25.5430,
    endLat:    43.3620,
    endLng:    25.6310,
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
    id:       'i5-trastenik-obretenk',      // ~approximate
    road:     'Път І-5',
    name:     'Тръстеник — Обретеник',
    startLat:  43.4190,
    startLng:  25.0100,
    endLat:    43.4680,
    endLng:    25.0870,
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
    id:       'i5-trastenik-odylyanik',     // ~approximate
    road:     'Път І-5',
    name:     'Тръстеник — Одяланик',
    startLat:  43.4190,
    startLng:  25.0100,
    endLat:    43.4600,
    endLng:    25.0850,
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
    id:       'i5-polikraishe-samodvene',   // ~approximate
    road:     'Път І-5',
    name:     'Поликраище — Самоводене',
    startLat:  43.2390,
    startLng:  25.5430,
    endLat:    43.1970,
    endLng:    25.5490,
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
  {
    id:       'i5-kazanlak-yagoda',         // ~approximate
    road:     'Път І-5',
    name:     'Казанлък — Ягода',
    startLat:  42.6190,
    startLng:  25.3970,
    endLat:    42.5380,
    endLng:    25.3300,
    lengthM:   13_200,
    limitKmh:  90,
  },

  // ══ Път І-6  (Sofia — Pernik — Radomir) ══════════════════════════════ ~

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
  {
    id:       'i6-belanitsa-radomir',       // ~approximate
    road:     'Път І-6',
    name:     'Беланица — Радомир',
    startLat:  42.5030,
    startLng:  23.0270,
    endLat:    42.5470,
    endLng:    22.9630,
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
  {
    id:       'ii55-vaglevtsi-kilifar',     // ~approximate
    road:     'Път ІІ-55',
    name:     'Въглевци — Килифарево',
    startLat:  43.0020,
    startLng:  25.4450,
    endLat:    42.9330,
    endLng:    25.5510,
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
