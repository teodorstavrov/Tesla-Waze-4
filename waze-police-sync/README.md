# teslanav.com / Waze → TesRadar police sync

Копира маркерите за **Полиция** от teslanav.com (route) и Waze (cities/nl/be) върху
админ картата на TesRadar, с точните координати, снапнати към най-близкия път.

## Как работи (накратко)

| Група | Изор | Как се чете |
|-------|------|-------------|
| `route` (A2 Хемус) | [teslanav.com/api/waze](https://teslanav.com/api/waze) | Plain HTTP fetch — без Chrome |
| `cities` (BG градове) | Waze live-map | Chrome CDP (debug порт 9222) |
| `nl` / `be` | Waze live-map | Chrome CDP (debug порт 9222) |

### Route (teslanav.com)
- Прави HTTP GET към `https://teslanav.com/api/waze?left=&right=&bottom=&top=`
- 3 bbox заявки на тайл: center + north + south spoke (~22km покритие)
- Не е нужен Chrome — пуска се директно

### Cities / NL / BE (Waze)
- Закача се към нормално пуснат Chrome през CDP (debug порт) — такъв браузър Waze приема
- Прихваща georss отговорите (тип `POLICE`), дедупликира, снапва към път (OSRM)
- Има авто-отстъпване при rate-limit (403/429) — изчаква и спира при трайно блокиране

Провереен контракт на TesRadar:

| Действие | Заявка |
|---|---|
| Списък | `GET /api/admin/events` |
| Добавяне | `POST /api/admin/events` тяло `{ "type":"police", "lat":.., "lng":.., "description":"wazesync:<id>" }` |

Авторизация: хедър `Authorization: Bearer <admin secret>` (8-символната тайна от `/admin` логин).

## Еднократна инсталация

```powershell
cd "C:\Data\WWW\Tesla Waze 4\waze-police-sync"
npm install
npx playwright install chromium   # нужно само за cities/nl/be
```
(Трябва инсталиран **Node.js**. За cities/nl/be трябва и **Google Chrome**.)

## Пускане (ръчно)

### Route (без Chrome):
```powershell
$env:TESRADAR_SECRET="твоята8символнатайна"; node sync.mjs route
```

### Cities (изисква Chrome с debug порт):

**1. Пусни Chrome с debug порт:**
```
start-chrome-debug.bat
```
Остави го отворен.

**2. Пусни синхронизацията:**
```powershell
$env:TESRADAR_SECRET="твоята8символнатайна"; node sync.mjs cities
```

## Автоматично (Windows Task Scheduler)

1. Отвори `waze-sync.bat` и впиши тайната на реда `set "TESRADAR_SECRET=..."`.
2. Пусни `register-tasks.bat` като администратор за да регистрираш задачите.

| Task | Скрипт | Честота | Изор |
|------|--------|---------|------|
| TesRadar-WazeSync-Route | run-route.bat | на 4h от 08:00 | teslanav.com |
| TesRadar-WazeSync-Chain | run-chain.bat | на 2h от 07:00 | Waze (Chrome) |
| TesRadar-WazeSync-BENL  | run-chain-benl.bat | веднъж/ден 04:00 | Waze (Chrome) |

> Route не се нуждае от Chrome и не харчи Waze quota.

## Настройки (в `sync.mjs`, обект `CONFIG`)

| Поле | Значение |
|---|---|
| `cdpUrl` | адрес на Chrome debug порта (за cities/nl/be) |
| `startZoom` / `zoomOutClicks` | зум при зареждане (Waze) |
| `tileWaitMs` / `betweenActionMs` | темпо (Waze, по-бавно = по-малко 403) |
| `backoffBaseMs` / `maxBackoffMs` | авто-отстъпване при rate-limit (Waze) |
| `dedupMeters` | разстояние, под което два маркера се считат за един |
| `maxSnapMeters` | ако най-близкият път е по-далеч → точката се отхвърля |
| `removeStale` | ако `true` — трие изчезнали маркери (по подразбиране изключено) |

## Само върху път

Всяка координата се снапва към най-близкия път (OSRM); точка на >`maxSnapMeters` от път се отхвърля. Така маркер никога не пада извън платното.

## Диагностика

`node diag.mjs` — открива дали Chrome сесията и Waze работят правилно (само за cities/nl/be).
