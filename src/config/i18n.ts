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
      toDayMode:     'Дневен режим',
      toNightMode:   'Нощен режим',
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
      arrived:       'Пристигнахте!',
      inDist:        'след',
    },

    search: {
      open:        'Отвори търсачката',
      searchTitle: 'Търси',
      close:       'Затвори търсачката',
      placeholder: 'Търси места или зарядни станции…',
      favorites:   'Любими',
      recent:      'Скорошни',
      stations:    'Зарядни станции',
      places:      'Места',
      noResults:   'Няма резултати за',
      addFav:      'Добави в любими',
      removeFav:   'Премахни от любими',
      removeHist:  'Премахни от историята',
      remove:      'Премахни',
    },

    offline: {
      offline: 'Офлайн — картата и станциите са кеширани',
      online:  'Връзката е възстановена',
    },

    controls: {
      courseUpHint:   'Режим: картата се върти (смени на аватар се върти)',
      northUpHint:    'Режим: аватарът се върти (смени на картата се върти)',
      orientLabel:    'Смени режим на ориентация',
      support:        'Подкрепи проекта',
      rateApp:        'Оцени приложението',
      vehicleProfile: 'Профил на автомобила',
    },

    station: {
      navigate:      '↗ Навигирай',
      network:       'Мрежа',
      ports:         'Порта',
      maxPower:      'Макс. мощност',
      price:         'Цена',
      free:          'Безплатно',
      paid:          'Платено',
      justUpdated:   'Обновено преди малко ✓',
      updatedPrefix: 'Обновено',
      refreshTitle:  'Обнови данните',
      refreshing:    'Зарежда...',
      refresh:       'Обнови',
      statusAvailable: 'Свободна',
      statusBusy:    'Заета',
      statusOffline: 'Офлайн',
      statusPlanned: 'Планирана',
    },

    routePanel: {
      calculating:   'Изчисляване на маршрут до',
      routes:        'Маршрути',
      currentCharge: 'Начален заряд',
      estimate:      '(оценка)',
      atArrival:     'При пристигане',
      chargeEnRoute: 'Зареди по пътя',
      hidePanel:     'СКРИИ',
      showPanel:     'ПОКАЖИ',
      mins:          'мин',
      hours:         'ч',
      m:             'м',
      km:            'км',
      minAbbr:       'м',
      secAbbr:       'с',
    },

    support: {
      title:            'Подкрепи проекта',
      subtitle:         'TesRadar е навигационен асистент за Tesla шофьори — безплатно и без реклами.\nАко ти е полезно, помогни за поддръжката му ! Благодарим !',
      scanQr:           'Сканирай с камерата на телефона си',
      contactBtn:       'Свържете се с нас',
      contactTitle:     'Свържете се с нас',
      emailPlaceholder: 'Твоят имейл',
      msgPlaceholder:   'Съобщение...',
      sending:          'Изпращане...',
      sent:             'Съобщението е изпратено!',
      sentDesc:         'Ще ти отговорим на',
      back:             '← Назад',
      errSend:          'Грешка при изпращане',
      errNoConn:        'Няма връзка. Опитайте отново.',
    },

    speedo: {
      kmh:         'км/ч',
      speedLabel:  'км/ч',
      noSignal:    'Скоростта не е налична',
      slowDown:    'Намалете скоростта',
    },

    nudge: {
      title:       '❤️ Хареса ли ти TesRadar?',
      subtitle:    'Приложението е безплатно и без реклами. Ако ти помага на пътя — поднеси кафе на разработчика. 😊',
      scanHint:    'Сканирай QR кода с телефона или натисни „Подкрепи" за повече начини.',
      support:     '❤️ Подкрепи проекта',
      later:       'Може би по-късно',
      qrAlt:       'QR код за дарение',
      dialogLabel: 'Подкрепи проекта',
      closeLabel:  'Затвори',
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
      toDayMode:     'Day mode',
      toNightMode:   'Night mode',
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
      arrived:       'Arrived!',
      inDist:        'in',
    },

    search: {
      open:        'Open search',
      searchTitle: 'Search',
      close:       'Close search',
      placeholder: 'Search places or charging stations…',
      favorites:   'Favourites',
      recent:      'Recent',
      stations:    'Charging stations',
      places:      'Places',
      noResults:   'No results for',
      addFav:      'Add to favourites',
      removeFav:   'Remove from favourites',
      removeHist:  'Remove from history',
      remove:      'Remove',
    },

    offline: {
      offline: 'Offline — map and stations are cached',
      online:  'Connection restored',
    },

    controls: {
      courseUpHint:   'Mode: map rotates (switch to avatar rotates)',
      northUpHint:    'Mode: avatar rotates (switch to map rotates)',
      orientLabel:    'Switch orientation mode',
      support:        'Support the project',
      rateApp:        'Rate the app',
      vehicleProfile: 'Vehicle setup',
    },

    station: {
      navigate:      '↗ Navigate',
      network:       'Network',
      ports:         'Ports',
      maxPower:      'Max power',
      price:         'Price',
      free:          'Free',
      paid:          'Paid',
      justUpdated:   'Just updated ✓',
      updatedPrefix: 'Updated',
      refreshTitle:  'Refresh data',
      refreshing:    'Loading...',
      refresh:       'Refresh',
      statusAvailable: 'Available',
      statusBusy:    'Busy',
      statusOffline: 'Offline',
      statusPlanned: 'Planned',
    },

    routePanel: {
      calculating:   'Calculating route to',
      routes:        'Routes',
      currentCharge: 'Starting charge',
      estimate:      '(estimate)',
      atArrival:     'At arrival',
      chargeEnRoute: 'Charge en route',
      hidePanel:     'HIDE',
      showPanel:     'SHOW',
      mins:          'min',
      hours:         'h',
      m:             'm',
      km:            'km',
      minAbbr:       'min',
      secAbbr:       's',
    },

    support: {
      title:            'Support the Project',
      subtitle:         'TesRadar is a free navigation assistant for Tesla drivers — no ads, no tracking.\nBuilt by an independent developer. If you find it useful, please consider supporting the project!',
      scanQr:           'Scan with your phone camera',
      contactBtn:       'Contact us',
      contactTitle:     'Contact us',
      emailPlaceholder: 'Your email',
      msgPlaceholder:   'Message...',
      sending:          'Sending...',
      sent:             'Message sent!',
      sentDesc:         "We'll reply to",
      back:             '← Back',
      errSend:          'Failed to send',
      errNoConn:        'No connection. Try again.',
    },

    speedo: {
      kmh:         'km/h',
      speedLabel:  'km/h',
      noSignal:    'Speed unavailable',
      slowDown:    'Reduce speed',
    },

    nudge: {
      title:       '❤️ Enjoying TesRadar?',
      subtitle:    "The app is free and ad-free. If it helps you on the road — buy the developer a coffee. 😊",
      scanHint:    'Scan the QR code with your phone or tap "Support" for more options.',
      support:     '❤️ Support the project',
      later:       'Maybe later',
      qrAlt:       'Donation QR code',
      dialogLabel: 'Support the project',
      closeLabel:  'Close',
    },
  },
} as const satisfies Record<string, Record<string, Record<string, string>>>
