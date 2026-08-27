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

// Preferred model keywords — matched against whatever Groq lists as available.
// Order: prefer smaller/faster instruct models (no reasoning/thinking models — they leak chain-of-thought).
const PREFER_KEYWORDS = ['8b', '9b', '11b', '17b', 'gemma', '27b', '32b', '70b', 'maverick', 'versatile']
// Models to skip (embedding, STT, vision-only, TTS, reasoning/thinking models, qwen — qwen3 rejects response_format)
const SKIP_RE = /whisper|tts|embed|vision|guard|tool|distil|speculative|specdec|scout|-r1\b|reason|think|qwen/i

interface AiContext {
  lat:              number | null
  lng:              number | null
  speedKmh:         number | null
  batteryPct:       number | null
  rangeKm:          number | null
  vehicleName:      string | null
  // Extended vehicle / battery details
  batterySource:    string | null   // 'Tesla live data' | 'user entered' | 'estimated'
  degradationPct:   number | null
  usableKwh:        number | null
  currentKwh:       number | null
  // App settings
  headingMode:      string          // 'course-up' | 'north-up'
  showTraffic:      boolean
  performanceMode:  string          // 'auto' | 'quality' | 'performance'
  // Map & theme
  mapMode:          string          // 'normal' | 'voyager' | 'satellite'
  appTheme:         string          // 'dark' | 'light'
  showClock:        boolean
  showRightPanel:   boolean
  evStationsVisible: boolean
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

interface GroqError {
  error?: { message?: string; code?: string }
}

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

  // Vehicle
  if (ctx.vehicleName)        lines.push(`Vehicle: ${ctx.vehicleName}`)

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
  lines.push(`Clock: ${ctx.showClock ? 'visible' : 'hidden'}`)
  lines.push(`Right controls panel: ${ctx.showRightPanel ? 'visible' : 'hidden'}`)
  lines.push(`EV stations layer: ${ctx.evStationsVisible ? 'visible' : 'hidden'}`)
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

  const systemPrompt =
`You are TesRadar AI — a real-time driving assistant for Tesla drivers in Europe.

CRITICAL RULES — READ CAREFULLY:
1. ALWAYS respond with a single JSON object. NO reasoning steps, NO analysis, NO thinking, NO markdown.
2. Answer in the EXACT SAME LANGUAGE as the question (Bulgarian → Bulgarian, English → English).
3. Keep "answer" to MAX 2 short sentences. The driver is reading while moving — be direct and specific.
4. Do NOT output **bold**, bullet points, or any markdown inside JSON strings.

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

━━━ AVAILABLE ACTION KEYS ━━━
toggle_traffic      — turn traffic layer ON/OFF (current: Traffic layer from session data)
toggle_satellite    — toggle satellite map ON/OFF
map_mode_satellite  — switch to satellite view
map_mode_voyager    — switch to Voyager (street/day) view
map_mode_normal     — switch to standard night map view
toggle_night        — toggle night mode (dark map + dark theme)
toggle_dark_mode    — toggle dark/light app theme
toggle_clock        — show/hide the clock display
toggle_right_panel  — show/hide the right controls panel
toggle_ev_stations  — show/hide EV charging stations on map
heading_course_up   — set map to follow driving direction (course-up)
heading_north_up    — set map to fixed north orientation
zoom_in             — zoom the map in one step
zoom_out            — zoom the map out one step
center              — center map on current GPS location and re-enable follow mode
set_lang            — change UI language (with value: "bg","en","no","sv","fi","nl","de")
set_country         — change country (with value: "BG","NO","SE","FI","NL","BE","DE")

━━━ EXAMPLES ━━━
"Включи трафика"            → {"answer":"Включвам трафика.","intent":{"type":"action","action":"toggle_traffic"}}
"Сателитна карта"           → {"answer":"Превключвам на сателитен изглед.","intent":{"type":"action","action":"map_mode_satellite"}}
"Нощен режим"               → {"answer":"Включвам нощен режим.","intent":{"type":"action","action":"toggle_night"}}
"Скрий часовника"           → {"answer":"Скривам часовника.","intent":{"type":"action","action":"toggle_clock"}}
"Покажи зарядни станции"    → {"answer":"Показвам зарядни станции.","intent":{"type":"action","action":"toggle_ev_stations"}}
"Centreert de kaart"        → {"answer":"De kaart wordt gecentreerd.","intent":{"type":"action","action":"center"}}
"Zoom in"                   → {"answer":"Zooming in.","intent":{"type":"action","action":"zoom_in"}}
"Ориентирай картата на север" → {"answer":"Картата е ориентирана на север.","intent":{"type":"action","action":"heading_north_up"}}
"Смени езика на английски"  → {"answer":"Превключвам на английски.","intent":{"type":"action","action":"set_lang","value":"en"}}
"Смени държавата на Норвегия" → {"answer":"Превключвам към Норвегия.","intent":{"type":"action","action":"set_country","value":"NO"}}
"Навигирай ме до Варна"     → {"answer":"Стартирам навигация до Варна.","intent":{"type":"navigate","destination":"Варна","viaHemus":false}}
"Navigate home"             → {"answer":"Navigating home.","intent":{"type":"navigate","destination":"home","viaHemus":false}}
"Колко заряд ми остава?"    → {"answer":"Батерията ти е на 74%, остават 52.3 кВтч — обхват ~340 км."}
"Включен ли е трафикът?"    → {"answer":"Не, трафик слоят е изключен."}`

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

    if (attempt.status !== 400 && attempt.status !== 404) {
      // 5xx or rate-limit (429) — don't try more models, surface the error
      res.status(502).json({ error: lastError }); return
    }
    // 400 / 404 → continue to next model
  }

  if (!r) {
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

  res.status(200).json(responseBody)
}
