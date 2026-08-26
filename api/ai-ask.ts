// ─── POST /api/ai-ask ────────────────────────────────────────────────────
//
// Receives a natural-language question + driving context from the client,
// sends it to Claude claude-haiku-4-5 (fast, cheap), returns the answer.
//
// Required env var: ANTHROPIC_API_KEY
//
// Body (JSON):
//   question          string    transcribed voice / typed question
//   context           object    see AiContext below
//
// Response:
//   { answer: string }          on success
//   { error: string }           on failure

import type { VercelRequest, VercelResponse } from '@vercel/node'

// ── Context shape sent by the frontend ───────────────────────────────────
interface AiContext {
  lat:                number | null
  lng:                number | null
  speedKmh:           number | null
  batteryPct:         number | null
  rangeKm:            number | null
  vehicleName:        string | null
  routeActive:        boolean
  routeDestination:   string | null
  routeDistKm:        number | null
  routeEtaTime:       string | null   // "14:37"
  eventsNearby:       number
  chargersNearby:     number
  countryCode:        string
}

// ── Anthropic API response shape ──────────────────────────────────────────
interface AnthropicResponse {
  content: Array<{ type: string; text: string }>
}

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  // CORS preflight
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  if (req.method === 'OPTIONS') { res.status(204).end(); return }

  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' }); return
  }

  const apiKey = process.env['ANTHROPIC_API_KEY']
  if (!apiKey) {
    res.status(503).json({ error: 'AI not configured — add ANTHROPIC_API_KEY env var' }); return
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const body = req.body as any
  const question: string = (body?.question ?? '').toString().trim()
  const ctx: AiContext  = body?.context ?? {}

  if (!question) {
    res.status(400).json({ error: 'Missing question' }); return
  }

  // ── Build context block for Claude ───────────────────────────────────
  const lines: string[] = []

  if (ctx.vehicleName)
    lines.push(`Vehicle: ${ctx.vehicleName}`)
  if (ctx.batteryPct != null)
    lines.push(`Battery charge: ${ctx.batteryPct}%`)
  if (ctx.rangeKm != null)
    lines.push(`Estimated range at current charge: ~${ctx.rangeKm} km`)
  if (ctx.lat != null && ctx.lng != null)
    lines.push(`GPS position: ${ctx.lat.toFixed(4)}°N, ${ctx.lng.toFixed(4)}°E  (country: ${ctx.countryCode})`)
  if (ctx.speedKmh != null)
    lines.push(`Current speed: ${ctx.speedKmh} km/h`)
  if (ctx.routeActive && ctx.routeDestination) {
    lines.push(`Active navigation: heading to "${ctx.routeDestination}", ${ctx.routeDistKm} km remaining, ETA ${ctx.routeEtaTime ?? 'unknown'}`)
  } else {
    lines.push('No active route/navigation.')
  }
  lines.push(`Reported events within 20 km: ${ctx.eventsNearby}`)
  lines.push(`EV charging stations within 10 km: ${ctx.chargersNearby}`)

  const systemPrompt =
`You are TesRadar AI — a real-time driving assistant embedded in the TesRadar app for Tesla drivers in Europe (Bulgaria, Norway, Sweden, Finland, Germany, Netherlands, Belgium).

Answer in the SAME LANGUAGE as the question. If the question is in Bulgarian → answer in Bulgarian. English → English.

Rules:
- Maximum 2–3 short sentences. The driver is reading while driving.
- Be direct and specific. Use the context data. No filler.
- If the question is about whether the battery is sufficient for a destination, calculate it clearly (distance vs estimated range) and recommend charging if needed.
- If critical data is missing (battery %, vehicle), ask the driver for it concisely.
- For safety topics, be responsible.

Current driving session:
${lines.join('\n')}`

  try {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method:  'POST',
      headers: {
        'Content-Type':      'application/json',
        'x-api-key':         apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model:      'claude-haiku-4-5-20251001',
        max_tokens: 300,
        system:     systemPrompt,
        messages:   [{ role: 'user', content: question }],
      }),
    })

    if (!r.ok) {
      const errText = await r.text()
      res.status(502).json({ error: `Claude error ${r.status}: ${errText.slice(0, 200)}` }); return
    }

    const data = await r.json() as AnthropicResponse
    const answer = data.content.find(b => b.type === 'text')?.text?.trim() ?? ''
    res.status(200).json({ answer })

  } catch (err) {
    res.status(500).json({ error: String(err) })
  }
}
