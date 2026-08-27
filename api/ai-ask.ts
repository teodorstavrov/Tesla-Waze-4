// ─── POST /api/ai-ask ────────────────────────────────────────────────────
//
// Driving AI assistant — calls Groq chat completions (free tier).
// Model selection is automatic: tries preferred models in order, skips any
// that Groq returns 404 for. This handles Groq model deprecations gracefully.
//
// Required env var: GROQ_API_KEY  (console.groq.com → API Keys)
//
// Body:   { question: string, context: AiContext }
// Response: { answer: string } | { error: string }

import type { VercelRequest, VercelResponse } from '@vercel/node'

// Preferred models — fastest/cheapest first. New models go at the top.
// When Groq deprecates a model it returns 404; we skip it and try the next.
const MODELS = [
  'meta-llama/llama-4-scout-17b-16e-instruct',  // Llama 4 Scout (2025+)
  'meta-llama/llama-4-maverick-17b-128e-instruct',
  'llama-3.3-70b-versatile',
  'llama-3.1-70b-versatile',
  'llama3-70b-8192',
  'gemma2-9b-it',
  'llama3-8b-8192',
  'mixtral-8x7b-32768',
]

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

interface GroqChatResponse {
  choices: Array<{ message: { content: string } }>
  model?: string
}

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
  if (ctx.vehicleName)        lines.push(`Vehicle: ${ctx.vehicleName}`)
  if (ctx.batteryPct != null) lines.push(`Battery: ${ctx.batteryPct}%`)
  if (ctx.rangeKm    != null) lines.push(`Estimated range: ~${ctx.rangeKm} km`)
  if (ctx.lat != null && ctx.lng != null)
    lines.push(`GPS: ${ctx.lat.toFixed(4)}°N, ${ctx.lng.toFixed(4)}°E (${ctx.countryCode})`)
  if (ctx.speedKmh != null)   lines.push(`Speed: ${ctx.speedKmh} km/h`)
  if (ctx.routeActive && ctx.routeDestination)
    lines.push(`Navigating to "${ctx.routeDestination}", ${ctx.routeDistKm} km left, ETA ${ctx.routeEtaTime ?? '?'}`)
  else
    lines.push('No active navigation.')
  lines.push(`Events within 20 km: ${ctx.eventsNearby}`)

  const systemPrompt =
`You are TesRadar AI — real-time driving assistant for Tesla drivers in Europe.
Answer in the SAME LANGUAGE as the question.
Rules: max 2-3 short sentences; driver is reading while driving — be direct and specific.
Session data:\n${lines.join('\n')}`

  const messages = [
    { role: 'system', content: systemPrompt },
    { role: 'user',   content: question },
  ]

  // ── Try each model until one works ────────────────────────────────────
  let lastError = 'No available Groq model found'

  for (const model of MODELS) {
    let r: Response
    try {
      r = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
        body: JSON.stringify({ model, max_tokens: 300, temperature: 0.4, messages }),
      })
    } catch (err) {
      res.status(500).json({ error: `Groq unreachable: ${String(err)}` }); return
    }

    // 404 model_not_found OR 400 decommissioned → try next model
    if (r.status === 404 || r.status === 400) {
      const bodyErr = await r.json() as GroqError
      const code = bodyErr?.error?.code ?? ''
      const msg  = bodyErr?.error?.message ?? ''
      const isModelGone =
        code === 'model_not_found' ||
        code === 'model_decommissioned' ||
        msg.includes('does not exist') ||
        msg.includes('decommissioned') ||
        msg.includes('no longer supported')
      if (isModelGone) {
        console.log(`[ai-ask] model ${model} unavailable (${r.status}), trying next`)
        lastError = `${r.status} ${code || 'unavailable'}: ${model}`
        continue
      }
      // Real 400 error (bad request, not model issue)
      res.status(400).json({ error: `Groq 400: ${msg.slice(0, 200)}` }); return
    }

    if (!r.ok) {
      const errText = await r.text()
      res.status(502).json({ error: `Groq ${r.status}: ${errText.slice(0, 200)}` }); return
    }

    const data   = await r.json() as GroqChatResponse
    const answer = data.choices[0]?.message?.content?.trim() ?? ''
    console.log(`[ai-ask] answered with model ${data.model ?? model}`)
    res.status(200).json({ answer }); return
  }

  // All models exhausted
  res.status(502).json({ error: `All Groq models unavailable. Last: ${lastError}` })
}
