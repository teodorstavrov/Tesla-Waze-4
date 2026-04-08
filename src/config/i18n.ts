// ─── Text Dictionary ──────────────────────────────────────────────────
//
// Centralized BG / EN translation strings.
// Plain static object — no runtime parsing, no dependencies.
//
// ADDING A NEW LANGUAGE
//   1. Add 'xx' to the Lang type in locale.ts
//   2. Add a 'xx' block here (copy 'en' as template)
//   3. Set locale: 'xx' in the country's config in countries.ts
//
// ADDING NEW KEYS
//   Add to both 'bg' and 'en' blocks in the same group.
//   Missing keys fall back to English then the key string — never crashes.
//
// USAGE
//   import { t } from '@/lib/locale'
//   t('alerts.police')   → 'Полиция напред' (lang=bg)  |  'Police ahead' (lang=en)
//   t('map.navigate')    → '⚡ НАВИГИРАЙ'   (lang=bg)  |  '⚡ NAVIGATE'  (lang=en)
//   t('bad.key')         → 'bad.key'                   (safe fallback)

export const DICTIONARY = {
  bg: {
    common: {
      ok:       'ОК',
      cancel:   'Отказ',
      close:    'Затвори',
      loading:  'Зареждане...',
      confirm:  'Потвърди',
      send:     'Изпрати',
    },

    map: {
      satellite:     'Сателитен изглед',
      toSatellite:   'Превключи към сателитен изглед',
      toVoyager:     'Превключи към Voyager карта',
      following:     'Следя локацията',
      recenter:      'Центрирай',
      waitingGps:    'Изчакване на GPS',
      northUp:       'Аватарът се върти',
      courseUp:      'Картата се върти',
      navigate:      '⚡ НАВИГИРАЙ',
      home:          'Дом',
      work:          'Работа',
      setHome:       'Запази като Дом',
      setWork:       'Запази като Работа',
      changeHome:    'Смени Дом',
      changeWork:    'Смени Работа',
    },

    stats: {
      stations:  'Станции',
      events:    'Събития',
      gps:       'GPS',
      muteOn:    'Включи звука',
      muteOff:   'Изключи звука',
    },

    alerts: {
      police:        'Полиция напред',
      accident:      'Катастрофа напред',
      hazard:        'Опасност на пътя',
      traffic:       'Задръстване напред',
      camera:        'Камера напред',
      construction:  'Строителни работи напред',
      policeClose:   'Полиция — 300 метра!',
    },

    sections: {
      label:         'Средна скорост',
      slowDown:      '⚠️ Намали скоростта!',
      approach:      'Зона за средна скорост',
      exit:          'Край на участъка',
      limit:         'лимит',
      ahead:         'напред',
      kmh:           'км/ч',
      withinLimit:   'В рамките на лимита ✓',
      overLimit:     'Лимитът е',
    },

    dock: {
      report:        'Докладвай',
      noRoute:       'Няма маркиран маршрут',
      route:         'Маршрут',
      cancelRoute:   'Откажи маршрут',
      stations:      'Станции',
      hideStations:  'Скрий станциите',
      showStations:  'Покажи станциите',
    },

    events: {
      police:        'Полиция',
      accident:      'Катастрофа',
      hazard:        'Опасност',
      traffic:       'Задръстване',
      camera:        'Камера',
      construction:  'Строителство',
      confirm:       'Потвърждавам',
      deny:          'Вече го няма',
      close:         'Затвори',
      denyProgress:  'гласа за изтриване',
      denyDeleting:  'Изтрива се...',
      filterLabel:   'Филтри за зарядни станции',
      reportWhat:    'Какво докладвате?',
      reportTitle:   'Докладвай събитие',
    },

    filter: {
      available:  'Свободни',
      clear:      '✕ Изчисти',
      filterLabel: 'Филтри за зарядни станции',
    },

    route: {
      cancel:        'Откажи',
      reroute:       'Пренасочи',
      deviated:      'Отклонение от маршрута',
      remaining:     'Остава',
      duration:      'Времетраене',
      arrival:       'Пристигане',
      to:            'До',
      primary:       'Основен',
      alt:           'Алт',
      start:         'Старт',
    },

    support: {
      subtitle: 'Tesla RADAR е навигационен асистент за Tesla шофьори — безплатно и без реклами.\nАко ти е полезно, помогни за поддръжката му ! Благодарим !',
    },
  },

  en: {
    common: {
      ok:       'OK',
      cancel:   'Cancel',
      close:    'Close',
      loading:  'Loading...',
      confirm:  'Confirm',
      send:     'Send',
    },

    map: {
      satellite:     'Satellite view',
      toSatellite:   'Switch to satellite view',
      toVoyager:     'Switch to Voyager map',
      following:     'Following your location',
      recenter:      'Center on my location',
      waitingGps:    'Waiting for GPS',
      northUp:       'Avatar rotates',
      courseUp:      'Map rotates',
      navigate:      '⚡ NAVIGATE',
      home:          'Home',
      work:          'Work',
      setHome:       'Save as Home',
      setWork:       'Save as Work',
      changeHome:    'Change Home',
      changeWork:    'Change Work',
    },

    stats: {
      stations:  'Stations',
      events:    'Events',
      gps:       'GPS',
      muteOn:    'Unmute',
      muteOff:   'Mute',
    },

    alerts: {
      police:        'Police ahead',
      accident:      'Accident ahead',
      hazard:        'Road hazard',
      traffic:       'Traffic ahead',
      camera:        'Speed camera ahead',
      construction:  'Road works ahead',
      policeClose:   'Police — 300 meters!',
    },

    sections: {
      label:         'Average speed',
      slowDown:      '⚠️ Reduce speed!',
      approach:      'Average speed zone',
      exit:          'End of section',
      limit:         'limit',
      ahead:         'ahead',
      kmh:           'km/h',
      withinLimit:   'Within the limit ✓',
      overLimit:     'Limit:',
    },

    dock: {
      report:        'Report',
      noRoute:       'No route set',
      route:         'Route',
      cancelRoute:   'Cancel route',
      stations:      'Stations',
      hideStations:  'Hide stations',
      showStations:  'Show stations',
    },

    events: {
      police:        'Police',
      accident:      'Accident',
      hazard:        'Hazard',
      traffic:       'Traffic',
      camera:        'Camera',
      construction:  'Road works',
      confirm:       'Confirm',
      deny:          'Gone now',
      close:         'Close',
      denyProgress:  'votes to remove',
      denyDeleting:  'Removing...',
      filterLabel:   'EV station filters',
      reportWhat:    'What are you reporting?',
      reportTitle:   'Report an event',
    },

    filter: {
      available:   'Available',
      clear:       '✕ Clear',
      filterLabel: 'EV station filters',
    },

    route: {
      cancel:        'Cancel',
      reroute:       'Reroute',
      deviated:      'Off route',
      remaining:     'Remaining',
      duration:      'Duration',
      arrival:       'Arrival',
      to:            'To',
      primary:       'Primary',
      alt:           'Alt',
      start:         'Start',
    },

    support: {
      subtitle: 'Tesla RADAR is a free navigation assistant for Tesla drivers — no ads, no tracking.\nIf you find it useful, please consider supporting the project!',
    },
  },
} as const satisfies Record<string, Record<string, Record<string, string>>>
