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

// Preferred model keywords — matched against whatever Groq lists as available.
// Order: prefer smaller/faster models for a driving assistant.
const PREFER_KEYWORDS = ['8b', '9b', '11b', 'scout', '17b', 'gemma', '27b', '32b', '70b', 'maverick', 'versatile']
// Models to skip (embedding, STT, vision-only, TTS)
const SKIP_RE = /whisper|tts|embed|vision|guard|tool|distil|speculative|specdec/i

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

  // ── Call with first available model ───────────────────────────────────
  const model = availableModels[0]
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

  if (!r.ok) {
    const errText = await r.text()
    res.status(502).json({ error: `Groq ${r.status} (${model}): ${errText.slice(0, 200)}` }); return
  }

  const data   = await r.json() as GroqChatResponse
  const answer = data.choices[0]?.message?.content?.trim() ?? ''
  console.log(`[ai-ask] answered with model ${data.model ?? model}`)
  res.status(200).json({ answer })
}
