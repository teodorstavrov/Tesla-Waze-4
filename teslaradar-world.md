# TeslaRadar — World Edition · Стратегически план

> От Bulgarian-only MVP до глобален навигационен асистент за Tesla шофьори

---

## 1. Визия

TeslaRadar World е същото приложение — без реклами, без регистрация — но с глобално покритие. Шофьор в Германия, Норвегия, Австралия или САЩ отваря teslaradar.tech и получава: EV станции в радиус, speed cameras, community road events и route + battery planning — всичко в реално време, оптимизирано за Tesla браузъра.

---

## 2. Какво работи вече (използваемо глобално без промяна)

| Компонент | Статус |
|---|---|
| Leaflet карта + OSM tiles | ✅ Глобален по дефолт |
| OSRM маршрутизиране | ✅ Глобален (demo server) |
| Nominatim геокодиране | ✅ Глобален |
| EV станции (OCM) | ✅ OCM има глобална база |
| EV станции (OSM) | ✅ Глобален |
| Road events (репортване) | ✅ Само bbox валидацията е BG-only |
| Speed section engine | ✅ Архитектурата е универсална |
| Alert engine | ✅ Работи с всякакви координати |
| Audio (Web Audio API) | ✅ Без промяна |
| Admin panel | ✅ Без промяна |
| Vercel infra | ✅ Глобален CDN |

**Нужни промени: ~20% от кода**

---

## 3. Технически план — стъпка по стъпка

### Стъпка 1 — Махни Bulgaria-only ограниченията (1-2 дни)

**Файлове за промяна:**

- `api/events/index.ts` — премахни bbox геофенс `lat < 41.0 || lat > 44.5`
- `api/_lib/utils/bbox.ts` — замени `BULGARIA_BBOX` с `WORLD_BBOX` (-90,-180,90,180)
- `src/features/search/nominatim.ts` — премахни `countrycodes: 'bg'`
- `api/cron/sync-stations.ts` — разшири OCM заявките за повече региони

**Резултат:** Приложението работи навсякъде по света.

---

### Стъпка 2 — EV данни (2-3 седмици)

**Проблемът:** Текущият cron sync тегли само Bulgaria от OCM/OSM. Световната база е ~500 000+ станции.

**Решение — регионален tile подход:**

```
Разпредели света на ~50 региона (по държава/група)
Cron: sync по 1 регион на ден (ротация)
Redis: { "stations:de": [...], "stations:fr": [...] }
Client: изпраща bbox → API взема от правилния ключ
```

**Данни по источник:**
| Источник | Глобален? | Качество | API |
|---|---|---|---|
| OpenChargeMap (OCM) | ✅ 500k+ станции | Добро | Безплатен до 1M req/месец |
| OpenStreetMap (Overpass) | ✅ | Варира | Безплатен |
| Tesla | ✅ | Отлично | Неофициален (scraping) |
| OCPI агрегатори | ✅ | Отлично | Платени ($50-500/мес) |

**Препоръка:** OCM + OSM за launch. Добави OCPI ако приходите го позволяват.

---

### Стъпка 3 — Speed Camera база (1 месец)

Текущата база е 47 BG отсечки. Глобалната е сложна задача.

**Опции по приоритет:**

**A. OpenStreetMap (free, partial)**
- Query: `average_speed_camera`, `enforcement=average_speed`
- Добро покритие в: UK, Австрия, Белгия, Франция, Австралия
- Нулево покритие в: USA, Германия, много Азия
- **Effort:** 1 седмица скрипт за автоматичен import

**B. Overpass API (automated sections)**
- Crawl `camera:type=speed` + `maxspeed:type=average`
- Combine с ръчна верификация за топ 20 пазара
- **Effort:** 2-3 седмици

**C. Community-sourced (Waze подход)**
- Добави тип "speed_section" в репортинг системата
- Потребителите сами маркират начало/край
- 2 потвърждения → автоматично добавяне
- **Effort:** 2 седмици dev, месеци за критична маса

**D. Платена база (fastest)**
- Campoverde / Sygic Speed Cameras API
- ~$200-500/месец за глобална база с 1M+ камери
- **Effort:** 2-3 дни интеграция

**Препоръка:** Старт с OSM автоматичен import (A) + community reporting (C).

---

### Стъпка 4 — Road Events (3-4 дни)

Текущото community reporting работи глобално след Стъпка 1. Добави:

- Премахни Bulgaria bbox валидация
- Добави регионална rate limit (per country) за spam prevention
- Опционално: добави source `waze_import` за pull от Waze Public Data Feed (той е легален)

---

### Стъпка 5 — Локализация (1-2 седмици)

Приложението е 100% на български. За international launch:

**Минимален подход (1 седмица):**
- Добави i18n с `react-i18next`
- Преведи само UI labels (не алерт текстовете — гласът остава EN/BG)
- Пускови езици: EN, DE, NO, NL (топ Tesla пазари)

**Алерт гласове:**
- `audioManager.speak()` вече използва Web Speech API
- Просто смени language tag: `'bg-BG'` → detect от navigator.language

---

### Стъпка 6 — Infrastructure scaling (1 седмица)

**Текущо:** 1 Redis instance, 1 Vercel region (iad1 — Вашингтон)

**За Европа/Глобал:**

```
Vercel Edge Network — вече глобален (CDN автоматично)
Redis — добави Upstash Global Database ($) за по-ниска latency
OSRM — смени demo server с self-hosted или платен API
```

---

## 4. Разходи — текущо vs глобален launch

### Текущо (Bulgaria only)

| Услуга | Цена/месец |
|---|---|
| Vercel Pro | $20 |
| Upstash Redis | ~$0-5 (free tier) |
| Resend email | $0 (free tier) |
| Nominatim | $0 (free) |
| OCM API | $0 (free) |
| Sentry | $0 (free tier) |
| **Общо** | **~$20-25/месец** |

---

### Global Launch — Фаза 1 (0-1000 DAU)

| Услуга | Промяна | Цена/месец |
|---|---|---|
| Vercel Pro | Без промяна — включен глобален CDN | $20 |
| Upstash Redis | Upgrade към Pay-as-you-go (повече команди) | $10-30 |
| Upstash Global DB | За <50ms latency в EU/US/Asia | $30-50 |
| OSRM | Смени demo → self-hosted (Railway/Render) | $20-40 |
| OCM API | Free до 1M req — достатъчно | $0 |
| Sentry | Free tier (5k errors/месец) | $0 |
| Domain + SSL | Вече имаш teslaradar.tech | $0 |
| **Общо** | | **~$80-140/месец** |

---

### Global Launch — Фаза 2 (1000-10 000 DAU)

| Услуга | Цена/месец |
|---|---|
| Vercel Pro (usage) | $20 + ~$30-50 overage |
| Upstash Redis | $50-100 |
| OSRM self-hosted (VPS) | $40-80 |
| Speed Cameras API (Campoverde) | $200-300 |
| Sentry Team | $26 |
| **Общо** | **~$350-550/месец** |

---

### Global Scale — Фаза 3 (10 000+ DAU)

| Услуга | Цена/месец |
|---|---|
| Vercel Pro / Enterprise | $200-500 |
| Upstash Redis Multi-region | $200-400 |
| OSRM (dedicated server) | $100-200 |
| Speed Cameras Premium API | $500+ |
| CDN за map tiles (Cloudflare) | $20-50 |
| Monitoring (Datadog/Sentry) | $50-100 |
| **Общо** | **~$1 070-1 250/месец** |

---

## 5. Приоритетни пазари

Tesla продажбите са концентрирани. Фокусирай се в този ред:

| Пазар | Tesla дял | Защо |
|---|---|---|
| 🇳🇴 Норвегия | #1 в света (~90% EV) | Огромна Tesla концентрация |
| 🇩🇪 Германия | Топ 3 EU | 100 000+ Tesla |
| 🇬🇧 Великобритания | Топ 2 EU | English-first, камери навсякъде |
| 🇳🇱 Нидерландия | Висок EV дял | Компактна, гъста мрежа |
| 🇺🇸 California | Топ US пазар | 40% от US Tesla |
| 🇦🇺 Австралия | Бързо растящ | Добро OSM покритие |
| 🇸🇪 Швеция | Висок EV дял | Скандинавски hub |

**MVP за Европа:** NO + DE + GB = 60% от EU Tesla шофьори.

---

## 6. Монетизация — препоръки

### Tier 1 — Безплатен (запази го)
Задържи безплатния tier за да изградиш потребителска база. Waze е безплатен. Google Maps е безплатен. Не поставяй paywall преди 50 000 потребители.

---

### 💰 Опция A — Доброволни дарения (вече имаш)
**Текущо реализирано:** QR код + Stripe
**Световен потенциал:** $500-2000/месец при 10k DAU
**Плюс:** Нула техническа работа
**Минус:** Непредвидимо, слаб ceiling

---

### 💰 Опция B — Tesla Premium Plan ($3.99/месец)
**Какво включва premium:**
- Speed camera alerts за всички 50+ пазара (не само твоята страна)
- Offline карта кеш (SW + IndexedDB)
- Нотификации (push) за репортирани инциденти покрай любим маршрут
- Battery planning с реален консумационен профил (не само estimate)
- История на маршрутите

**Реализация:**
- Stripe Subscriptions (вече имаш Stripe)
- JWT token в localStorage → API check
- Feature flags по план

**Потенциал:** 2% conversion от 10k DAU = 200 платени × $3.99 = **$800/месец**
При 100k DAU: 2000 × $3.99 = **$8 000/месец**

---

### 💰 Опция C — EV Station Partnerships
Зарядните мрежи плащат за traffic и leads:
- `Promoted` badge на станция в резултатите
- Push notification: "Свободна Tesla Supercharger на 2 км"
- Affiliate link при навигация към платена мрежа

**Пазарна цена:** $0.50-2.00 на referred charging session
**Потенциал при 10k DAU:** $500-3000/месец

**Партньори за контакт:** Ionity, Fastned, Allego, ChargePoint

---

### 💰 Опция D — B2B API (дългосрочно)
Продавай агрегирания community data (анонимен):
- Speed trap density по регион
- Real-time incident feed (webhook)
- Fleet monitoring dashboard

**Цена:** $200-2000/месец на B2B клиент (застрахователи, fleet operators, mapping companies)

---

### 💰 Опция E — White-label за автомобилни асоциации
Продай branded версия на:
- Национални автомобилни клубове (ADAC Германия, AA UK, KAT България)
- Fleet management компании
- Rental car компании (Hertz, Europcar)

**Цена:** $1 000-10 000/месец лицензна такса
**Effort:** 2-4 седмици customization

---

### Препоръчана монетизационна стратегия

```
Фаза 1 (сега → 10k users):   Дарения + Premium план $3.99
Фаза 2 (10k → 50k users):    + EV партньорства affiliate
Фаза 3 (50k+ users):          + B2B API + White-label
```

**Реалистични приходи при 50k DAU:**
- Дарения: $1 000/месец
- Premium (2% = 1000 × $3.99): $4 000/месец
- EV affiliate: $2 000/месец
- B2B (2 клиента): $3 000/месец
- **Общо: ~$10 000/месец**

---

## 7. Най-прекият път до World launch

### Sprint план — 8 седмици до Beta

**Седмица 1-2: Unlock global**
- [ ] Премахни Bulgaria bbox от API и frontend
- [ ] Разшири OCM sync за EU (DE, NO, GB, NL, SE, FR)
- [ ] Добави `navigator.language` → alert език
- [ ] Launch на teslaradar.tech/global (beta flag)

**Седмица 3-4: Speed cameras EU**
- [ ] OSM Overpass import скрипт за EU камери
- [ ] Автоматичен nightly sync за топ 10 пазара
- [ ] Community reporting за speed sections (begin/end tap)

**Седмица 5-6: UX локализация**
- [ ] EN превод на целия UI
- [ ] DE превод (Германия е #2 EU пазар)
- [ ] Country auto-detect → правилен език
- [ ] Landing page обяснение на функциите

**Седмица 7-8: Монетизация**
- [ ] Stripe subscription flow ($3.99/месец)
- [ ] Premium feature gates в кода
- [ ] Affiliate links за EV мрежи

**Седмица 8: Launch**
- [ ] Reddit posts: r/teslamotors, r/TeslaModelY, r/electricvehicles
- [ ] Tesla forums (TMC, Norway EV forum)
- [ ] Product Hunt launch
- [ ] Tesla Facebook групи EU

---

## 8. Рискове и митигация

| Риск | Вероятност | Митигация |
|---|---|---|
| OCM данни остаряват | Средна | Weekly cron + manual bust бутон (вече имаш) |
| OSRM demo server пада | Висока | Self-host на Railway ($20/мес) |
| Tesla блокира unofficial API | Ниска | OCM + OSM са достатъчни без Tesla |
| Spam reports глобално | Висока | Country-level rate limits + DENY_THRESHOLD |
| Vercel costs explode | Средна | Edge caching + строги rate limits (вече имаш) |
| Конкуренция от Tesla official app | Ниска | Нямат community features, нямат камери |

---

## 9. Конкурентно предимство

| Feature | TeslaRadar | Waze | Tesla Nav | Google Maps |
|---|---|---|---|---|
| Tesla browser оптимизиран | ✅ | ❌ | ✅ | ❌ |
| Средна скорост секции | ✅ | ❌ | ❌ | ❌ |
| Battery при пристигане | ✅ | ❌ | ✅ | ❌ |
| EV станции по маршрут | ✅ | ❌ | ✅ | Частично |
| Community events | ✅ | ✅ | ❌ | ❌ |
| Без регистрация | ✅ | ❌ | ✅ | ❌ |
| Offline fallback | Частично | ✅ | ✅ | ✅ |
| Безплатен | ✅ | ✅ | ✅ | ✅ |

**Уникалното позициониране:** Единственото community-driven, Tesla-first, speed-camera-aware навигационно приложение в браузъра.

---

## 10. Резюме

| | Сега | Фаза 1 (EU) | Фаза 2 (Global) |
|---|---|---|---|
| Пазар | България | EU top 7 | Worldwide |
| Разходи/месец | $20 | $80-140 | $350-1250 |
| Потенциални приходи | $100-300 | $1 000-5 000 | $5 000-50 000 |
| Dev effort | — | 6-8 седмици | +3-6 месеца |
| Критична зависимост | — | OCM global data | OSRM self-host |

**Препоръка:** Стартирай Фаза 1 EU веднага — 80% от световния Tesla пазар е в Европа. Разходите растат само с ~$60-120/месец. Break-even при ~30 premium абонамента ($120/месец).

---

*teslaradar.tech — Built for Tesla drivers, by a Tesla driver.*
