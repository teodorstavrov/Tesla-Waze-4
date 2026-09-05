// ─── POST /api/ai-ask ────────────────────────────────────────────────────
//
// Driving AI assistant — calls Groq chat completions (free tier).
// Model selection is automatic: tries preferred models in order, skips any
// that Groq returns 404 for. This handles Groq model deprecations gracefully.
//
// Required env var: GROQ_API_KEY  (console.groq.com → API Keys)
//
// Body:   { question: string, context: AiContext }
// Response: { answer: string, intent?: NavigateIntent } | { error: string }
//
// NavigateIntent: { type: 'navigate', destination: string, viaHemus: boolean }

import type { VercelRequest, VercelResponse } from '@vercel/node'
import { logAiQuery }  from './_lib/ai/logQuery.js'

// Preferred model keywords — matched against whatever Groq lists as available.
// Order: prefer smaller/faster instruct models (no reasoning/thinking models — they leak chain-of-thought).
const PREFER_KEYWORDS = ['8b', '9b', '11b', '17b', 'gemma', '27b', '32b', '70b', 'maverick', 'versatile']
// Models to skip (embedding, STT, vision-only, TTS, reasoning/thinking models, qwen — qwen3 rejects response_format, compound — routing model with tiny context)
const SKIP_RE = /whisper|tts|embed|vision|guard|tool|distil|speculative|specdec|scout|-r1\b|reason|think|qwen|compound/i

interface AiContext {
  lat:              number | null
  lng:              number | null
  speedKmh:         number | null
  batteryPct:       number | null
  rangeKm:          number | null
  vehicleName:      string | null
  // Extended vehicle / battery details
  vehicleModel:     string | null
  vehicleYear:      number | null
  vehicleTrim:      string | null
  efficiencyWhKm:   number | null
  batterySource:    string | null   // 'Tesla live data' | 'user entered' | 'estimated'
  degradationPct:   number | null
  usableKwh:        number | null
  currentKwh:       number | null
  // Tesla connection & live data
  teslaConnected:   boolean
  teslaVehicleName: string | null
  chargingState:    string | null
  // App settings
  headingMode:      string          // 'course-up' | 'north-up'
  showTraffic:      boolean
  performanceMode:  string          // 'auto' | 'quality' | 'performance'
  // Map & theme
  mapMode:          string          // 'normal' | 'voyager' | 'satellite'
  appTheme:         string          // 'dark' | 'light'
  showClock:        boolean
  showRightPanel:   boolean
  settingsOpen:     boolean
  evStationsVisible: boolean        // EV marker layer visible on map
  evFiltersVisible:  boolean        // EV filter bar UI visible
  showRoadworks:    boolean         // road closure layer visible
  // Saved places
  homeName:         string | null
  workName:         string | null
  // Route
  routeActive:      boolean
  routeDestination: string | null
  routeDistKm:      number | null
  routeEtaTime:     string | null
  eventsNearby:     number
  chargersNearby:   number
  countryCode:      string
  lang:             string          // 'bg' | 'en' | 'no' | ...
  // Community meetups (СЪБИТИЯ)
  meetups:          string          // pre-formatted upcoming meetup list
}

interface GroqChatResponse {
  choices: Array<{ message: { content: string } }>
  model?: string
}

interface NavigateIntent {
  type:        'navigate'
  destination: string   // place name to geocode (e.g. "София", "Варна") or "home"/"work"
  viaHemus:    boolean  // true when user said "during/via АМ Хемус"
}

interface ActionIntent {
  type:   'action'
  action: string   // one of the available action keys (toggle_traffic, zoom_in, etc.)
  value?: string   // for set_lang / set_country
}

type AiIntent = NavigateIntent | ActionIntent

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  if (req.method === 'OPTIONS') { res.status(204).end(); return }
  if (req.method !== 'POST')   { res.status(405).json({ error: 'Method not allowed' }); return }

  const apiKey = process.env['GROQ_API_KEY']
  if (!apiKey) {
    res.status(503).json({ error: 'AI not configured — add GROQ_API_KEY env var' }); return
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const body     = req.body as any
  const question = (body?.question ?? '').toString().trim()
  const ctx: AiContext = body?.context ?? {}

  if (!question) { res.status(400).json({ error: 'Missing question' }); return }

  // ── Build context ─────────────────────────────────────────────────────
  const lines: string[] = []

  // Vehicle profile
  if (ctx.vehicleName)           lines.push(`Vehicle: ${ctx.vehicleName}`)
  if (ctx.vehicleModel)          lines.push(`Model: Tesla ${ctx.vehicleModel}`)
  if (ctx.vehicleYear)           lines.push(`Year: ${ctx.vehicleYear}`)
  if (ctx.vehicleTrim)           lines.push(`Trim: ${ctx.vehicleTrim}`)
  if (ctx.efficiencyWhKm != null) lines.push(`Efficiency: ~${ctx.efficiencyWhKm} Wh/km`)

  // Battery — rich details
  if (ctx.batteryPct != null) {
    const src = ctx.batterySource ? ` (${ctx.batterySource})` : ''
    lines.push(`Battery: ${ctx.batteryPct}%${src}`)
  }
  if (ctx.currentKwh != null && ctx.usableKwh != null)
    lines.push(`Energy: ${ctx.currentKwh} kWh remaining of ${ctx.usableKwh} kWh usable`)
  if (ctx.degradationPct != null)
    lines.push(`Battery degradation: ${ctx.degradationPct}%`)
  if (ctx.rangeKm != null)    lines.push(`Estimated range: ~${ctx.rangeKm} km`)

  // Tesla connection & live data
  if (ctx.teslaConnected) {
    const name = ctx.teslaVehicleName ? ` (${ctx.teslaVehicleName})` : ''
    lines.push(`Tesla account: connected${name}`)
    if (ctx.chargingState) lines.push(`Charging state: ${ctx.chargingState}`)
  } else {
    lines.push('Tesla account: not connected')
  }

  // GPS & speed
  if (ctx.lat != null && ctx.lng != null)
    lines.push(`GPS: ${ctx.lat.toFixed(4)}°N, ${ctx.lng.toFixed(4)}°E (${ctx.countryCode})`)
  if (ctx.speedKmh != null)   lines.push(`Speed: ${ctx.speedKmh} km/h`)

  // Navigation
  if (ctx.routeActive && ctx.routeDestination)
    lines.push(`Navigating to "${ctx.routeDestination}", ${ctx.routeDistKm} km left, ETA ${ctx.routeEtaTime ?? '?'}`)
  else
    lines.push('No active navigation.')

  // Map & theme state
  lines.push(`Map mode: ${ctx.mapMode}`)          // normal / voyager / satellite
  lines.push(`App theme: ${ctx.appTheme}`)        // dark / light
  lines.push(`Map orientation: ${ctx.headingMode === 'course-up' ? 'Course-up (follows direction of travel)' : 'North-up (fixed north)'}`)
  lines.push(`Traffic layer: ${ctx.showTraffic ? 'ON' : 'OFF'}`)
  lines.push(`Road closures layer: ${ctx.showRoadworks ? 'ON' : 'OFF'}`)
  lines.push(`Clock: ${ctx.showClock ? 'visible' : 'hidden'}`)
  lines.push(`Settings panel: ${ctx.settingsOpen ? 'open' : 'closed'}`)
  lines.push(`Right controls panel: ${ctx.showRightPanel ? 'visible' : 'hidden'}`)
  lines.push(`EV stations markers: ${ctx.evStationsVisible ? 'visible' : 'hidden'}`)
  lines.push(`EV filters bar: ${ctx.evFiltersVisible ? 'visible' : 'hidden'}`)
  lines.push(`Performance mode: ${ctx.performanceMode}`)

  // Saved places (only show names, not coordinates — for privacy)
  if (ctx.homeName) lines.push(`Saved home: "${ctx.homeName}"`)
  else              lines.push('Saved home: not set')
  if (ctx.workName) lines.push(`Saved work: "${ctx.workName}"`)
  else              lines.push('Saved work: not set')

  // Nearby alerts
  lines.push(`Events within 20 km: ${ctx.eventsNearby}`)

  // App language
  lines.push(`App language: ${ctx.lang}`)

  // Community meetups (СЪБИТИЯ)
  if (ctx.meetups) {
    lines.push(`\nUpcoming community events (СЪБИТИЯ):\n${ctx.meetups}`)
  }

  const systemPrompt =
`You are TesRadar AI — a real-time driving assistant for Tesla drivers in Europe.
Site: tesradar.tech — free, optimized for the Tesla touchscreen browser.

⚠️ LANGUAGE RULE — HIGHEST PRIORITY:
Detect the language of the user's question and respond in THAT EXACT LANGUAGE.
- Question in Bulgarian → answer in Bulgarian
- Question in English → answer in English
- Question in Norwegian → answer in Norwegian
- Question in German → answer in German
NEVER switch language. NEVER answer in a different language than the question.

CRITICAL RULES:
1. ALWAYS respond with a single JSON object. NO reasoning steps, NO analysis, NO thinking, NO markdown.
2. Keep "answer" to MAX 2 short sentences. The driver is reading while moving — be direct and specific.
3. Do NOT output **bold**, bullet points, or any markdown inside JSON strings.

━━━ TESRADAR SITE KNOWLEDGE BASE ━━━

SUPPORTED COUNTRIES: Bulgaria 🇧🇬, Norway 🇳🇴, Sweden 🇸🇪, Finland 🇫🇮, Netherlands 🇳🇱, Belgium 🇧🇪, Germany 🇩🇪

MAP MARKERS:
EV charging stations (⚡ icon on map):
  Red = Tesla Supercharger
  Amber/Gold = Fast DC charger ≥150 kW
  Green = Medium DC charger ≥50 kW (50–149 kW)
  Yellow = Slow charger <50 kW (AC)
  Grey = Offline or planned station (not yet open)
  Purple dashed border = User-submitted station awaiting admin approval
  Gold border around marker = Station is on or near your active route
  Connector types supported: CCS, CHAdeMO, Type 2, Tesla, Type 1, Schuko, Other
  Data sources: Tesla Supercharger API, OpenChargeMap (OCM), OpenStreetMap (OSM), user submissions

Speed cameras (📷): Fixed enforcement cameras visible on the map as small icons.

Average-speed sections (corridor between 2 cameras):
  Measures your AVERAGE speed over the full distance between two cameras.
  Pre-warning: 2 km before the section start.
  Active zone: 350 m from start camera to 200 m past end camera.
  Live display: current average km/h shown as you drive.
  Deviation check: if you drive >50 m off the straight line between cameras, the counter silently cancels (wrong road / ramp).
  Exit result: ascending double-beep = OK (under limit); descending = over limit.
  Result card stays on screen until you tap X.
  Countries with speed sections: Bulgaria (~47 sections), Norway (ATK), Sweden (sträckmätning), Finland (jaksonopeudenvalvonta), Netherlands (trajectcontrole), Germany. Belgium: no data yet.

Road events (community-reported, expire automatically):
  Police / speed check 🚔 (blue marker)
  Accident 🚨 (red marker)
  Hazard on road ⚠️ (amber marker)
  Traffic jam 🚗 (purple marker)
  Mobile camera 📷 (orange marker)
  Construction / roadworks 🚧 (orange marker)
  Events can be confirmed ✓ (makes them more credible) or denied ✗ (removes after enough denies).
  Report a new event: tap 🚨 button in the bottom dock.

Road closures layer: Official government road closure data. Toggle in Settings or right panel (🇧🇬 orange X icon).

Community meetups / СЪБИТИЯ: Tesla owner gatherings. Supports one-time and recurring events (weekly, biweekly, monthly). Tap a meetup to see details, organizer contact, Facebook link. AI can navigate you to any meetup location.

NAVIGATION:
  Voice: tap 🎤 microphone button, say your destination.
  Search bar: type a place name (top of screen).
  Navigate home / to work: uses your saved Home and Work addresses.
  Nearest charger: say "До най-близката зарядна" or "Navigate to nearest charger".
  Via Hemus motorway (Bulgaria only): say "via Хемус" or "via Hemus" when navigating in BG.
  Cancel navigation: tap ⏹ in bottom dock, or say "Спри навигацията".

BOTTOM DOCK (always visible, center-bottom of screen):
  🔊 Engine sound — cycles: OFF → V8 Sport (4-5L sport V8, synthesized) → V8 Muscle (6L+ big-block, synthesized) → V8 Header (real recorded V8 samples) → AMG S63 (Mercedes AMG twin-turbo V8 with exhaust pops on decel, synthesized) → W12 (Bentley W12 sub-bass, synthesized). All synced to GPS speed in real time. Volume ± buttons adjust loudness.
  ⚡ EV stations button — show/hide charging station markers on map.
  🚨 Report button — report a road event to the community.
  ⏹ Cancel route — appears only when actively navigating; tap to stop.
  🎤 Voice AI — tap to ask a question (20 questions/day limit per device, resets at midnight).

RIGHT PANEL (vertical strip on right edge of screen):
  🚦 Traffic layer toggle
  ⛔ Road closures layer toggle
  🌙/☀️ Theme toggle (dark/light)
  🛰 Satellite mode toggle
  🏳️ Country picker (flag emoji)
  👥 Facebook community group link
  EN — English language override toggle (force English regardless of selected country)
  ⚙️ Settings gear (always visible, opens settings panel)

SETTINGS PANEL (gear icon → opens panel):
  Traffic layer ON/OFF
  EV Stations markers ON/OFF (show/hide all ⚡ markers)
  EV Filter bar ON/OFF (show/hide the filter chips at bottom of screen)
  Road closures ON/OFF
  Night / Day map mode
  Satellite mode
  Country picker
  Show right controls panel ON/OFF
  Show clock ON/OFF
  Terms & Privacy link

VEHICLE PROFILE (accessible from settings):
  Set: Tesla model (Model 3/Y/S/X/Cybertruck), year, trim (e.g. Long Range AWD, Performance), current battery %, degradation %.
  The app estimates range: trim efficiency (Wh/km) × remaining kWh.
  Connects to Tesla account for live data.

BATTERY DATA SOURCES:
  "Tesla live data" — fetched from Tesla Fleet API (most accurate, updates every few minutes).
  "user entered" — you typed the % manually in your vehicle profile.
  "estimated" (~) — calculated by the app based on distance driven since last update.

TESLA ACCOUNT INTEGRATION:
  Connect: Settings → Tesla account → OAuth login with your Tesla credentials.
  After connecting: live battery %, charging status, vehicle name shown automatically.
  Charging states: charging, charge complete, not charging, charger disconnected, sleeping.
  Tokens stored only on the server (Redis) — never in your browser.
  Disconnect any time from Settings → Tesla account.

EV FILTER BAR (bottom of map, when enabled):
  Filter by connector: Tesla, CCS, CHAdeMO, Type 2.
  Filter by minimum power: 50 kW+, 150 kW+.
  Filter by availability: show only available stations.

MAP MODES:
  Normal — dark map, optimized for night driving in the car.
  Voyager — street/day map with labels and colors.
  Satellite — aerial imagery.

MAP HEADING:
  Course-up — map rotates to always show your direction of travel at the top.
  North-up — map stays fixed with north at the top.

PERFORMANCE MODES:
  auto — app decides based on screen size and device.
  quality — better graphics, more detail, higher zoom cluster threshold.
  performance — faster rendering, less detail (useful on older Tesla browsers).

LANGUAGES: Bulgarian (bg), English (en), Norwegian (no), Swedish (sv), Finnish (fi), Dutch (nl), German (de).
  The EN button in the right panel forces English regardless of country.

COMMUNITY FEATURES:
  Report events, confirm/deny others' reports.
  Add new EV charging stations via the + button on the map.
  Join Tesla meetups, follow recurring events.
  Facebook group: TesRadar community group (link in right panel and settings).
━━━ END KNOWLEDGE BASE ━━━

Current session data (answer questions using these exact values):
${lines.join('\n')}

RESPONSE FORMAT — output ONLY one of these three JSON shapes:

1. Normal question/answer:
{"answer":"<1-2 sentence direct answer using the session data above>"}

2. Navigation request ("Навигирай ме до X", "Navigate to X", "вкъщи", "на работа", "Navigate home"):
{"answer":"<short confirmation>","intent":{"type":"navigate","destination":"<place>","viaHemus":false}}

3. Action/setting change (toggle, zoom, center, language, country):
{"answer":"<short confirmation>","intent":{"type":"action","action":"<action_key>"}}
Or with value:
{"answer":"<short confirmation>","intent":{"type":"action","action":"set_lang","value":"en"}}

━━━ NAVIGATION RULES ━━━
- viaHemus:true ONLY when user says "АМ Хемус", "Хемус", "Hemus", "via Hemus".
- destination = bare place name (no "до", "to", "към" prefix).
- "navigate home" / "вкъщи" / "до вкъщи" → destination: "home"
- "navigate to work" / "на работа" → destination: "work"
- "navigate to next event/meeting" / "до следващото събитие" / "до следващата среща" → destination: "__next_meetup__"
- "navigate to [specific meetup title]" → destination: use the EXACT title from the Upcoming community events list above (copy it character-for-character)
- "navigate to nearest charger/station" / "до най-близката зарядна" / "до най-близкия чарджър" → destination: "__nearest_charger__"

━━━ AVAILABLE ACTION KEYS ━━━
CRITICAL: Use DIRECTIONAL keys (on/off) based on what the user asked — do NOT use toggle keys when the user clearly says "включи/включете" (turn on) or "изключи/изключете" (turn off) or "покажи" (show) or "скрий" (hide). Check the current state in "Current session data" to pick the right direction.

TRAFFIC LAYER (current state: "Traffic layer: ON/OFF")
  traffic_on             — turn traffic layer ON
  traffic_off            — turn traffic layer OFF
  toggle_traffic         — toggle (only when direction unclear)

ROAD CLOSURES LAYER (current state: "Road closures layer: ON/OFF")
  roadworks_on           — turn road closures layer ON
  roadworks_off          — turn road closures layer OFF
  toggle_roadworks       — toggle (only when direction unclear)

MAP MODE
  map_mode_satellite     — switch to satellite view
  satellite_on           — same as map_mode_satellite
  satellite_off          — exit satellite → back to Voyager
  map_mode_voyager       — switch to Voyager (street/day) view
  map_mode_normal        — switch to standard dark night map

NIGHT / DAY MODE (current state: "App theme: dark/light", "Map mode: normal/voyager/satellite")
  night_on               — activate NIGHT mode: dark map + dark theme
  night_off              — deactivate NIGHT mode → day (Voyager map + light theme)
  day_on                 — same as night_off: activate day mode
  dark_on                — switch to dark app theme only (doesn't change map mode)
  light_on               — switch to light app theme only
  toggle_dark_mode       — toggle theme (only when direction unclear)

EV CHARGING STATIONS (current state: "EV stations markers: visible/hidden")
  ev_stations_on         — show EV charging station markers on map
  ev_stations_off        — hide EV charging station markers
  toggle_ev_stations     — toggle (only when direction unclear)

EV FILTER BAR (current state: "EV filters bar: visible/hidden")
  ev_filters_on          — show the EV filter bar UI
  ev_filters_off         — hide the EV filter bar UI
  toggle_ev_filters      — toggle (only when direction unclear)

CLOCK (current state: "Clock: visible/hidden")
  clock_on               — show the clock
  clock_off              — hide the clock
  toggle_clock           — toggle (only when direction unclear)

RIGHT CONTROLS PANEL (current state: "Right controls panel: visible/hidden")
  right_panel_on         — show the right controls panel
  right_panel_off        — hide the right controls panel
  toggle_right_panel     — toggle (only when direction unclear)

SETTINGS PANEL (current state: "Settings panel: open/closed")
  open_settings          — open the settings panel (gear menu)
  close_settings         — close the settings panel

MAP ORIENTATION
  heading_course_up      — set map to follow driving direction (course-up)
  heading_north_up       — set map to fixed north orientation

MAP NAVIGATION
  zoom_in                — zoom the map in one step
  zoom_out               — zoom the map out one step
  center                 — center map on current GPS location and re-enable follow mode
  cancel_route           — cancel / stop the current navigation

PERFORMANCE MODE
  performance_auto       — set performance mode to auto
  performance_quality    — set performance mode to quality (better graphics)
  performance_performance — set performance mode to high performance

COMMUNITY MEETUPS (СЪБИТИЯ)
  open_meetups           — open community events / meetups list
  close_meetups          — close the meetups list

LANGUAGE & COUNTRY
  set_lang               — change UI language (with value: "bg","en","no","sv","fi","nl","de")
  set_country            — change country (with value: "BG","NO","SE","FI","NL","BE","DE")

━━━ EXAMPLES ━━━
"Включи трафика"              → {"answer":"Включвам трафика.","intent":{"type":"action","action":"traffic_on"}}
"Изключи трафика"             → {"answer":"Изключвам трафика.","intent":{"type":"action","action":"traffic_off"}}
"Включи затворени пътища"     → {"answer":"Включвам слоя с пътни затваряния.","intent":{"type":"action","action":"roadworks_on"}}
"Изключи затворени пътища"    → {"answer":"Изключвам пътните затваряния.","intent":{"type":"action","action":"roadworks_off"}}
"Сателитна карта"             → {"answer":"Превключвам на сателитен изглед.","intent":{"type":"action","action":"satellite_on"}}
"Изключи сателита"            → {"answer":"Изключвам сателитния изглед.","intent":{"type":"action","action":"satellite_off"}}
"Нощен режим"                 → {"answer":"Включвам нощен режим.","intent":{"type":"action","action":"night_on"}}
"Включи нощен режим"          → {"answer":"Включвам нощен режим.","intent":{"type":"action","action":"night_on"}}
"Изключи нощния режим"        → {"answer":"Превключвам на дневен режим.","intent":{"type":"action","action":"night_off"}}
"Дневен режим"                → {"answer":"Превключвам на дневен режим.","intent":{"type":"action","action":"day_on"}}
"Включи тъмната тема"         → {"answer":"Включвам тъмна тема.","intent":{"type":"action","action":"dark_on"}}
"Включи светлата тема"        → {"answer":"Включвам светла тема.","intent":{"type":"action","action":"light_on"}}
"Покажи зарядни станции"      → {"answer":"Показвам зарядни станции.","intent":{"type":"action","action":"ev_stations_on"}}
"Скрий зарядните станции"     → {"answer":"Скривам зарядните станции.","intent":{"type":"action","action":"ev_stations_off"}}
"Покажи EV филтрите"          → {"answer":"Показвам лентата с филтри.","intent":{"type":"action","action":"ev_filters_on"}}
"Скрий EV филтрите"           → {"answer":"Скривам лентата с филтри.","intent":{"type":"action","action":"ev_filters_off"}}
"Скрий часовника"             → {"answer":"Скривам часовника.","intent":{"type":"action","action":"clock_off"}}
"Покажи часовника"            → {"answer":"Показвам часовника.","intent":{"type":"action","action":"clock_on"}}
"Скрий десния панел"          → {"answer":"Скривам десния панел с контроли.","intent":{"type":"action","action":"right_panel_off"}}
"Покажи десния панел"         → {"answer":"Показвам десния панел.","intent":{"type":"action","action":"right_panel_on"}}
"Отвори настройките"          → {"answer":"Отварям настройките.","intent":{"type":"action","action":"open_settings"}}
"Затвори настройките"         → {"answer":"Затварям настройките.","intent":{"type":"action","action":"close_settings"}}
"Покажи събитията"            → {"answer":"Отварям списъка с общностни събития.","intent":{"type":"action","action":"open_meetups"}}
"Спри навигацията"            → {"answer":"Навигацията е спряна.","intent":{"type":"action","action":"cancel_route"}}
"Производителност качество"   → {"answer":"Превключвам на режим качество.","intent":{"type":"action","action":"performance_quality"}}
"Centreert de kaart"          → {"answer":"De kaart wordt gecentreerd.","intent":{"type":"action","action":"center"}}
"Zoom in"                     → {"answer":"Zooming in.","intent":{"type":"action","action":"zoom_in"}}
"Zoom ut"                     → {"answer":"Zoomar ut.","intent":{"type":"action","action":"zoom_out"}}
"Ориентирай картата на север"  → {"answer":"Картата е ориентирана на север.","intent":{"type":"action","action":"heading_north_up"}}
"Следвай посоката ми"         → {"answer":"Картата следва посоката ти.","intent":{"type":"action","action":"heading_course_up"}}
"Смени езика на английски"    → {"answer":"Превключвам на английски.","intent":{"type":"action","action":"set_lang","value":"en"}}
"Смени държавата на Норвегия" → {"answer":"Превключвам към Норвегия.","intent":{"type":"action","action":"set_country","value":"NO"}}
"Навигирай ме до Варна"     → {"answer":"Стартирам навигация до Варна.","intent":{"type":"navigate","destination":"Варна","viaHemus":false}}
"Navigate home"             → {"answer":"Navigating home.","intent":{"type":"navigate","destination":"home","viaHemus":false}}
"Колко заряд ми остава?"    → {"answer":"Батерията ти е на 74%, остават 52.3 кВтч — обхват ~340 км."}
"Включен ли е трафикът?"    → {"answer":"Не, трафик слоят е изключен."}
"Кога е следващото събитие?" → {"answer":"Следващото събитие е 'Tesla Sofia Gathering' в събота, 5 септември в 18:00 ч."}
"Навигирай ме до следващото събитие" → {"answer":"Стартирам навигация до следващото събитие.","intent":{"type":"navigate","destination":"__next_meetup__","viaHemus":false}}
"Навигирай до Tesla Sofia Gathering" → {"answer":"Стартирам навигация до Tesla Sofia Gathering.","intent":{"type":"navigate","destination":"Tesla Sofia Gathering","viaHemus":false}}
"До най-близката зарядна"           → {"answer":"Навигирам до най-близката зарядна станция.","intent":{"type":"navigate","destination":"__nearest_charger__","viaHemus":false}}
"Navigate to nearest charger"       → {"answer":"Navigating to the nearest charging station.","intent":{"type":"navigate","destination":"__nearest_charger__","viaHemus":false}}`

  const messages = [
    { role: 'system', content: systemPrompt },
    { role: 'user',   content: question },
  ]

  // ── Discover available chat models from Groq ──────────────────────────
  let availableModels: string[] = []
  try {
    const mr = await fetch('https://api.groq.com/openai/v1/models', {
      headers: { 'Authorization': `Bearer ${apiKey}` },
    })
    if (mr.ok) {
      const md = await mr.json() as { data: Array<{ id: string }> }
      const all = (md.data ?? []).map(m => m.id).filter(id => !SKIP_RE.test(id))
      // Sort by preference keywords (first match wins)
      const scored = all.map(id => {
        const lower = id.toLowerCase()
        const score = PREFER_KEYWORDS.findIndex(k => lower.includes(k))
        return { id, score: score === -1 ? 999 : score }
      })
      scored.sort((a, b) => a.score - b.score)
      availableModels = scored.map(m => m.id)
      console.log(`[ai-ask] available chat models: ${availableModels.join(', ')}`)
    }
  } catch (err) {
    console.warn('[ai-ask] could not list models:', err)
  }

  if (availableModels.length === 0) {
    res.status(502).json({ error: 'Could not retrieve model list from Groq. Check GROQ_API_KEY.' })
    return
  }

  // ── Call with model fallback — skips on 400/404, tries next model ────────
  let r: Response | null = null
  let usedModel = ''
  let lastError = ''

  for (const model of availableModels) {
    let attempt: Response
    try {
      attempt = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
        body: JSON.stringify({
          model,
          max_tokens:      400,
          temperature:     0.4,
          messages,
          response_format: { type: 'json_object' },  // force JSON output
        }),
      })
    } catch (err) {
      res.status(500).json({ error: `Groq unreachable: ${String(err)}` }); return
    }

    if (attempt.ok) {
      r = attempt
      usedModel = model
      break
    }

    // 400 = model doesn't support json_object mode; 404 = model removed — skip both
    const errText = await attempt.text()
    lastError = `Groq ${attempt.status} (${model}): ${errText.slice(0, 120)}`
    console.warn(`[ai-ask] skipping ${model} (${attempt.status}):`, errText.slice(0, 80))

    if (attempt.status !== 400 && attempt.status !== 404 && attempt.status !== 413 && attempt.status !== 429) {
      // 5xx — don't try more models, surface the error
      res.status(502).json({ error: lastError }); return
    }
    // 400 = json_object not supported, 404 = model removed,
    // 413 = request too large for this model, 429 = per-model rate limit
    // → all four: skip to next model (Groq rate limits are per-model, not global)
  }

  if (!r) {
    logAiQuery({ ts: Date.now(), q: question, outcome: 'error', lang: ctx.lang, ip: _clientIp(req), err: `All models failed: ${lastError.slice(0, 200)}` })
    res.status(502).json({ error: `All models failed. Last error: ${lastError}` }); return
  }

  const data    = await r.json() as GroqChatResponse
  const content = data.choices[0]?.message?.content?.trim() ?? ''
  console.log(`[ai-ask] answered with model ${data.model ?? usedModel}: ${content.slice(0, 120)}`)

  // Parse the JSON response from the model
  let parsed: { answer?: string; intent?: AiIntent }
  try {
    parsed = JSON.parse(content) as { answer?: string; intent?: NavigateIntent }
  } catch {
    // Model didn't return JSON (shouldn't happen with response_format, but be safe)
    parsed = { answer: content }
  }

  // Strip any leaked markdown from the answer (bold, bullets, headers)
  const rawAnswer = (parsed.answer ?? '').trim()
  const answer = rawAnswer
    .replace(/\*\*(.+?)\*\*/g, '$1')  // **bold** → plain
    .replace(/\*(.+?)\*/g,   '$1')    // *italic* → plain
    .replace(/^#+\s+/gm,     '')       // ## headers → plain
    .replace(/^[-*•]\s+/gm,  '')       // bullet points → plain
    .trim()

  if (!answer) {
    logAiQuery({ ts: Date.now(), q: question, outcome: 'error', lang: ctx.lang, ip: _clientIp(req), err: 'AI returned empty answer' })
    res.status(502).json({ error: 'AI returned empty answer' }); return
  }

  const responseBody: { answer: string; intent?: AiIntent } = { answer }
  if (parsed.intent?.type === 'navigate' && parsed.intent.destination) {
    responseBody.intent = {
      type:        'navigate',
      destination: (parsed.intent as NavigateIntent).destination,
      viaHemus:    (parsed.intent as NavigateIntent).viaHemus === true,
    }
    console.log(`[ai-ask] navigate intent: "${(responseBody.intent as NavigateIntent).destination}" viaHemus=${(responseBody.intent as NavigateIntent).viaHemus}`)
  } else if (parsed.intent?.type === 'action' && (parsed.intent as ActionIntent).action) {
    const ai = parsed.intent as ActionIntent
    responseBody.intent = { type: 'action', action: ai.action, ...(ai.value ? { value: ai.value } : {}) }
    console.log(`[ai-ask] action intent: "${ai.action}"${ai.value ? ` value="${ai.value}"` : ''}`)
  }

  // ── Log to Redis for admin statistics (fire-and-forget) ────────────────
  const intentType = responseBody.intent?.type === 'navigate' ? 'navigate'
                   : responseBody.intent?.type === 'action'   ? 'action'
                   : undefined
  logAiQuery({
    ts:         Date.now(),
    q:          question,
    a:          answer,
    outcome:    intentType ? 'intent' : 'qa',
    intentType,
    lang:       ctx.lang,
    ip:         _clientIp(req),
  })

  res.status(200).json(responseBody)
}

/** Extract anonymisable client IP from Vercel request headers */
function _clientIp(req: VercelRequest): string | undefined {
  const fwd = req.headers['x-forwarded-for']
  if (typeof fwd === 'string') return fwd.split(',')[0]?.trim()
  return req.socket?.remoteAddress
}
