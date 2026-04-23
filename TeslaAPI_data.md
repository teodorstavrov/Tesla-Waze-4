# Tesla Fleet API — Какво чете приложението

Пълен опис на всички Tesla API повиквания, данни, и как се използват в TesRadar.

---

## Регион и base URL

```
EU:  https://fleet-api.prd.eu.vn.cloud.tesla.com   ← използван (BG, NO, SE, FI)
NA:  https://fleet-api.prd.na.vn.cloud.tesla.com
```
Конфигурира се чрез env var `TESLA_API_BASE_URL`.

---

## OAuth scopes (заявени при свързване)

| Scope                | Какво дава                                      |
|---------------------|-------------------------------------------------|
| `openid`            | идентификация на потребителя                    |
| `offline_access`    | refresh token за автоматично подновяване        |
| `vehicle_device_data` | charge_state, drive_state, vehicle_state      |
| `vehicle_location`  | latitude/longitude от drive_state               |

---

## Auth endpoints (`auth.tesla.com/oauth2/v3`)

| Метод | URL                   | Кога                                         |
|-------|-----------------------|----------------------------------------------|
| GET   | `/authorize`          | потребителят кликва "Свържи Tesla"           |
| POST  | `/token`              | при callback — code → access+refresh tokens |
| POST  | `/token`              | автоматично при изтекъл token (< 60 s буфер)|
| POST  | `/revoke`             | при disconnect                               |

---

## Fleet API endpoints

### 1. `GET /api/1/vehicles`
**Кога:** веднъж при OAuth callback.  
**Връща:** списък с коли по акаунта.

```json
{
  "response": [
    {
      "id": 1234567890123456,
      "vehicle_id": 12345678,
      "vin": "LRW3F7EK...",
      "display_name": "My Model Y",
      "state": "online"
    }
  ],
  "count": 1
}
```

**Използвано:** взима `id` (→ `vehicleId`) и `display_name` / `vin` за името в сесията.

---

### 2. `GET /api/1/vehicles/{id}/vehicle_data?endpoints=charge_state;drive_state;vehicle_state`
**Кога:** при всеки реален poll (max 1 на 15 мин, cache-first).  
**Цена:** буди колата ако спи → използва се само когато кешът е stale.

#### Пълен raw JSON от Tesla:

```json
{
  "response": {
    "charge_state": {
      "battery_level": 72,
      "charging_state": "Disconnected",
      "charge_limit_soc": 80,
      "battery_range": 187.3
    },
    "drive_state": {
      "speed": null,
      "heading": 214,
      "latitude": 42.6977,
      "longitude": 23.3219,
      "power": 0,
      "shift_state": null
    },
    "vehicle_state": {
      "odometer": 12847.2
    }
  }
}
```

#### Кои полета реално се четат и как:

| Tesla поле                        | Тип         | Преобразуване         | Вътрешно поле              |
|-----------------------------------|-------------|------------------------|---------------------------|
| `charge_state.battery_level`      | `number?`   | → `null` ако липсва   | `batteryPercent`          |
| `charge_state.charging_state`     | `string?`   | enum валидация         | `chargingState`           |
| `charge_state.charge_limit_soc`   | `number?`   | директно               | `chargeLimitPercent`      |
| `charge_state.battery_range`      | `number?`   | × 1.60934 (mi → km)   | `batteryRangeKm`          |
| `drive_state.speed`               | `number?`   | × 1.60934 (mph → km/h)| `speedKph`                |
| `drive_state.heading`             | `number?`   | директно               | (не се кешира — само snap)|
| `drive_state.latitude`            | `number?`   | директно               | `latitude`                |
| `drive_state.longitude`           | `number?`   | директно               | `longitude`               |
| `drive_state.power`               | `number?`   | директно (kW)          | (само в snapshot)         |
| `drive_state.shift_state`         | `string?`   | `null` = паркирана     | `vehicleParked`           |
| `vehicle_state.odometer`          | `number?`   | × 1.60934 (mi → km)   | `odometerKm`              |

#### Какво НЕ се чете (съществува в Tesla API, но не се използва):

- `climate_state` (климатик, температура)
- `gui_settings` (единици на дисплея)
- `vehicle_config` (модел, боя, опции)
- `software_update` (версия на фирмуера)
- `media_state` (музика)
- `drive_state.native_latitude/longitude` (алтернативни координати)
- Nearby charging sites
- Tire pressure

---

### 3. `GET /api/1/vehicles/{id}`
**Кога:** по време на wake — проверява `state` на всеки 3 s (max 45 s).  
**Не буди колата** — само чете статуса.

```json
{
  "response": {
    "state": "online"   // "online" | "asleep" | "offline" | "waking" | "unknown"
  }
}
```

**Използвано:** само `state` — за да разбере дали колата се е събудила.

---

### 4. `POST /api/1/vehicles/{id}/wake_up`
**Кога:** само при изричен tap от потребителя върху battery widget.  
**Никога автоматично.**  
**Rate limit:** 1 wake на 90 сек per сесия (Redis).

```json
{ "response": { "state": "waking" } }
```

---

## Нормализиран state (кешира се в Redis)

След всяко успешно четене се записва в Redis с TTL 30 мин:

```ts
interface NormalizedVehicleState {
  source:         'vehicle_data'
  batteryPercent: number | null   // null ако Tesla не върне battery_level
  chargingState:  string | null   // 'Charging' | 'Stopped' | 'Disconnected' | 'Complete' | null
  speedKph:       number | null
  latitude:       number | null
  longitude:      number | null
  updatedAt:      number          // Unix ms
  freshness:      'live' | 'recent' | 'stale'  // изчислява се при четене
  sleeping:       boolean
}
```

Redis ключ: `tesla:vehicle_cache:{sessionId}`

---

## Caching стратегия

| Freshness | Вък | Действие                          |
|-----------|-----|-----------------------------------|
| live      | < 5 мин | връща кеша, 0 Tesla API повиквания |
| recent    | 5–15 мин | връща кеша, 0 Tesla API повиквания |
| stale     | > 15 мин | опитва live fetch                 |
| sleeping  | —   | винаги връща кеша + `sleeping:true`|

---

## Polling schedule (frontend)

| Сценарий          | Интервал          |
|-------------------|-------------------|
| Кола е online     | 20 мин            |
| Кола спи          | 2 мин (retry)     |
| Грешка / rate-limit | 10 мин          |
| Tab видим → focus | незабавно poll    |
| Tab скрит         | polling спира     |

---

## Данни, видими в UI

| UI елемент        | Tesla поле                 | Fallback                  |
|-------------------|---------------------------|---------------------------|
| Battery %         | `batteryPercent`          | ръчно въведено %          |
| "asleep ↺" label | `sleeping: true`          | —                         |
| "Tesla" label     | awake + non-null battery  | "manual" / "~"            |
| Зареждане статус  | `chargingState`           | не се показва отделно     |

GPS позицията и скоростта от `drive_state` **не се използват** в момента — приложението ползва браузърния Geolocation API вместо Tesla GPS.

---

## Резюме

Приложението чете **само 3 endpoint-а** от Fleet API:

1. `/vehicles` — веднъж при login (взима vehicleId)
2. `/vehicles/{id}/vehicle_data` — max 1× на 15 мин (battery %, charging state, GPS, speed, odometer)
3. `/vehicles/{id}` — само при wake flow (state check)

От `vehicle_data` реално се **кешира и показва**: `batteryPercent`, `chargingState`, `latitude`, `longitude`, `speedKph`.  
Останалите полета (`heading`, `power`, `odometer`, `vehicleParked`) се нормализират но не достигат до UI в момента.
