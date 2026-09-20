# teslanav.com → TesRadar police sync

Копира маркерите за **Полиция** от [teslanav.com](https://teslanav.com) върху
админ картата на TesRadar, с точните координати, снапнати към най-близкия път.

**Без Chrome. Без Waze. Всички групи ползват teslanav.com.**

## Как работи (накратко)

| Група | Source | Как се чете |
|-------|--------|-------------|
| `route` (A2 Хемус) | [teslanav.com/api/waze](https://teslanav.com/api/waze) | Plain HTTP fetch |
| `cities` (BG градове) | [teslanav.com/api/waze](https://teslanav.com/api/waze) | Plain HTTP fetch |
| `nl` / `be` | [teslanav.com/api/waze](https://teslanav.com/api/waze) | Plain HTTP fetch |

- Прави HTTP GET към `https://teslanav.com/api/waze?left=&right=&bottom=&top=`
- 3 bbox заявки на тайл: center + north + south spoke (~22km покритие)
- Не е нужен Chrome — пуска се директно

Проверен контракт на TesRadar:

| Действие | Заявка |
|---|---|
| Списък | `GET /api/admin/events` |
| Добавяне | `POST /api/admin/events` тяло `{ "type":"police", "lat":.., "lng":.., "description":"wazesync:<id>" }` |

Авторизация: хедър `Authorization: Bearer <admin secret>` (8-символната тайна от `/admin` логин).

## Еднократна инсталация

```powershell
cd "C:\Data\WWW\Tesla Waze 4\waze-police-sync"
npm install
```
(Трябва инсталиран **Node.js**. Chrome НЕ е нужен.)

## Пускане (ръчно)

```powershell
$env:TESRADAR_SECRET="твоята8символнатайна"; node sync.mjs cities
$env:TESRADAR_SECRET="твоята8символнатайна"; node sync.mjs route
$env:TESRADAR_SECRET="твоята8символнатайна"; node sync.mjs nl
$env:TESRADAR_SECRET="твоята8символнатайна"; node sync.mjs be
```

## Автоматично (Windows Task Scheduler)

1. Отвори `waze-sync.bat` и впиши тайната на реда `set "TESRADAR_SECRET=..."`.
2. Пусни `register-tasks.bat` като администратор за да регистрираш задачите.

| Task | Скрипт | Честота | Source |
|------|--------|---------|--------|
| TesRadar-TeslaNavSync-Chain | run-chain.bat | на 2h от 07:00 | teslanav.com |
| TesRadar-TeslaNavSync-Route | run-route.bat | на 4h от 08:00 | teslanav.com |
| TesRadar-TeslaNavSync-BENL  | run-chain-benl.bat | веднъж/ден 04:00 | teslanav.com |

## Настройки (в `sync.mjs`, обект `CONFIG`)

| Поле | Значение |
|---|---|
| `dedupMeters` | разстояние, под което два маркера се считат за един |
| `maxSnapMeters` | ако най-близкият път е по-далеч → точката се отхвърля |
| `removeStale` | ако `true` — трие изчезнали маркери (по подразбиране изключено) |

## Само върху път

Всяка координата се снапва към най-близкия път (OSRM); точка на >`maxSnapMeters` от път се отхвърля. Така маркер никога не пада извън платното.

## Диагностика

Провери дали teslanav.com отговаря:
```powershell
curl -s "https://teslanav.com/api/waze?left=23.2&right=23.5&bottom=42.6&top=42.8"
```
