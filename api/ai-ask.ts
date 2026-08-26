// ─── POST /api/ai-ask ────────────────────────────────────────────────────
//
// Receives a natural-language question + driving context, calls Groq
// (llama-3.1-8b-instant — free tier, fast), returns the answer.
//
// Required env var: GROQ_API_KEY  (console.groq.com → API Keys)
// Free tier: 14 400 req/day, 30 req/min — more than enough.
//
// Body (JSON):
//   question   string     transcribed voice / typed question
//   context    object     see AiContext below
//
// Response:
//   { answer: string }     on success
//   { error:  string }     on failure

import type { VercelRequest, VercelResponse } from '@vercel/node'

interface AiContext {
  lat:              number | null
  lng:              number | null
  speedKmh:         number | null
  batteryPct:       number | null
  rangeKm:          number | null
  vehicleName:      string | null
  routeActive:      boolean
  routeDestination: string | null
  routeDistKm:      number | null
  routeEtaTime:     string | null
  eventsNearby:     number
  chargersNearby:   number
  countryCode:      string
}

interface GroqResponse {
  choices: Array<{ message: { content: string } }>
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

  // ── Build context block ───────────────────────────────────────────────
  const lines: string[] = []
  if (ctx.vehicleName)    lines.push(`Vehicle: ${ctx.vehicleName}`)
  if (ctx.batteryPct != null) lines.push(`Battery: ${ctx.batteryPct}%`)
  if (ctx.rangeKm    != null) lines.push(`Estimated range at current charge: ~${ctx.rangeKm} km`)
  if (ctx.lat != null && ctx.lng != null)
    lines.push(`GPS: ${ctx.lat.toFixed(4)}°N, ${ctx.lng.toFixed(4)}°E  (country: ${ctx.countryCode})`)
  if (ctx.speedKmh != null) lines.push(`Speed: ${ctx.speedKmh} km/h`)
  if (ctx.routeActive && ctx.routeDestination)
    lines.push(`Navigating to "${ctx.routeDestination}", ${ctx.routeDistKm} km left, ETA ${ctx.routeEtaTime ?? '?'}`)
  else
    lines.push('No active navigation.')
  lines.push(`Events within 20 km: ${ctx.eventsNearby}`)
  lines.push(`EV chargers within 10 km: ${ctx.chargersNearby}`)

  const systemPrompt =
`You are TesRadar AI — a real-time driving assistant for Tesla drivers in Europe (Bulgaria, Norway, Sweden, Finland, Germany, Netherlands, Belgium).

Answer in the SAME LANGUAGE as the question (Bulgarian → Bulgarian, English → English, Norwegian → Norwegian, etc.).

Rules:
- Maximum 2–3 short sentences. The driver is reading while driving — be direct.
- Use the context data below. Be specific with numbers.
- If battery range vs destination: calculate and recommend charging if needed.
- If critical data is missing (battery %, vehicle), ask for it concisely.

Session data:
${lines.join('\n')}`

  try {
    const r = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method:  'POST',
      headers: {
        'Content-Type':  'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model:       'llama-3.1-8b-instant',
        max_tokens:  300,
        temperature: 0.4,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user',   content: question },
        ],
      }),
    })

    if (!r.ok) {
      const errText = await r.text()
      res.status(502).json({ error: `Groq error ${r.status}: ${errText.slice(0, 200)}` }); return
    }

    const data   = await r.json() as GroqResponse
    const answer = data.choices[0]?.message?.content?.trim() ?? ''
    res.status(200).json({ answer })

  } catch (err) {
    res.status(500).json({ error: String(err) })
  }
}
