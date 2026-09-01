// ─── POST /api/stt ────────────────────────────────────────────────────────
//
// Speech-to-text — Groq Whisper fallback for Tesla Browser where
// webkitSpeechRecognition.start() triggers a 'network' error because
// it cannot reach Google's STT servers from the vehicle's network.
//
// Client JSON: { audio: "<base64>", mimeType: "audio/webm", lang: "bg" }
// Response:    { text: string }  |  { error: string }
//
// Env var: GROQ_API_KEY  (same key as /api/ai-ask)
// Free tier: 7 200 s audio / day (~120 h).

import type { VercelRequest, VercelResponse } from '@vercel/node'

const LANG: Record<string, string> = {
  bg: 'bg', 'bg-BG': 'bg',
  en: 'en', 'en-US': 'en',
  no: 'no', 'nb-NO': 'no',
  sv: 'sv', 'sv-SE': 'sv',
  fi: 'fi', 'fi-FI': 'fi',
}

// ── Top-level wrapper: always return JSON, never drop the connection ────────
export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  try {
    await _handle(req, res)
  } catch (err) {
    console.error('[stt] Unhandled exception:', err)
    if (!res.writableEnded) {
      res.status(500).json({ error: `Server error: ${String(err)}` })
    }
  }
}

async function _handle(req: VercelRequest, res: VercelResponse): Promise<void> {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  if (req.method === 'OPTIONS') { res.status(204).end(); return }
  if (req.method !== 'POST')   { res.status(405).json({ error: 'Method not allowed' }); return }

  const apiKey = process.env['GROQ_API_KEY']
  if (!apiKey) {
    res.status(503).json({ error: 'STT not configured (GROQ_API_KEY missing in Vercel env)' })
    return
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const body     = req.body as Record<string, unknown> | null | undefined
  const audio    = typeof body?.audio    === 'string' ? body.audio    : ''
  const mimeType = typeof body?.mimeType === 'string' ? body.mimeType : 'audio/webm'
  const lang     = typeof body?.lang     === 'string' ? body.lang     : 'bg'

  if (!audio) {
    res.status(400).json({ error: 'Missing audio field (base64 string required)' }); return
  }
  if (audio.length < 100) {
    res.status(400).json({ error: 'Audio too short to transcribe' }); return
  }

  // Decode base64 → Buffer
  let audioBuf: Buffer
  try {
    audioBuf = Buffer.from(audio, 'base64')
  } catch (err) {
    res.status(400).json({ error: `Invalid base64: ${String(err)}` }); return
  }

  if (audioBuf.length < 500) {
    res.status(400).json({ error: `Audio buffer too small (${audioBuf.length} bytes)` }); return
  }

  const whisperLang = LANG[lang] ?? 'bg'
  const ext = mimeType.startsWith('audio/mp4') ? 'mp4'
            : mimeType.startsWith('audio/ogg') ? 'ogg'
            : 'webm'

  // Whisper prompt — domain-specific vocabulary helps accuracy for noisy car environments.
  // Primes the model to expect navigation commands and Bulgarian place names.
  const WHISPER_PROMPT: Record<string, string> = {
    bg: 'TesRadar, Tesla, навигирай, зарядна станция, АМ Хемус, автомагистрала, батерия, заряд, км, София, Варна, Пловдив, Бургас, Велико Търново, Русе, Стара Загора, Ямбол, Шумен, Пазарджик, Видин, Враца, Плевен, Ловеч, Габрово, Силистра, Добрич, Хасково, Кърджали, Благоевград, Перник, Кюстендил, Монтана, Виден',
    en: 'TesRadar, Tesla, navigate, charging station, Hemus motorway, battery, charge, Sofia, Varna, Plovdiv, Burgas',
    no: 'TesRadar, Tesla, naviger, ladestasjon, batteri, lading',
    sv: 'TesRadar, Tesla, navigera, laddstation, batteri, laddning',
    fi: 'TesRadar, Tesla, navigoi, latauspiste, akku, lataus',
  }
  const whisperPrompt = WHISPER_PROMPT[whisperLang] ?? WHISPER_PROMPT['bg']!

  // ── Build multipart/form-data manually ────────────────────────────────
  // Using Buffer.concat — no FormData/Blob dependency (works Node 16/18/20).
  const boundary = `TesRadar${Date.now().toString(36)}`

  function textPart(name: string, value: string): Buffer {
    return Buffer.from(
      `--${boundary}\r\n` +
      `Content-Disposition: form-data; name="${name}"\r\n` +
      `\r\n` +
      `${value}\r\n`,
      'utf8',
    )
  }

  const filePart = Buffer.from(
    `--${boundary}\r\n` +
    `Content-Disposition: form-data; name="file"; filename="audio.${ext}"\r\n` +
    `Content-Type: ${mimeType}\r\n` +
    `\r\n`,
    'utf8',
  )

  const formBody = Buffer.concat([
    textPart('model',           'whisper-large-v3-turbo'),
    textPart('response_format', 'json'),
    textPart('language',        whisperLang),
    textPart('prompt',          whisperPrompt),
    filePart,
    audioBuf,
    Buffer.from(`\r\n--${boundary}--\r\n`, 'utf8'),
  ])

  console.log(`[stt] Sending ${audioBuf.length} bytes audio (${mimeType}, lang=${whisperLang}) to Groq`)

  // ── Call Groq Whisper ──────────────────────────────────────────────────
  let groqRes: Response
  try {
    groqRes = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type':  `multipart/form-data; boundary=${boundary}`,
      },
      body: formBody,
    })
  } catch (err) {
    console.error('[stt] fetch to Groq failed:', err)
    res.status(502).json({ error: `Cannot reach STT provider: ${String(err)}` }); return
  }

  const rawText = await groqRes.text()

  if (!groqRes.ok) {
    console.error(`[stt] Groq ${groqRes.status}:`, rawText.slice(0, 300))
    res.status(502).json({ error: `STT provider error ${groqRes.status}: ${rawText.slice(0, 150)}` })
    return
  }

  let parsed: { text?: string }
  try {
    parsed = JSON.parse(rawText) as { text?: string }
  } catch {
    console.error('[stt] Groq non-JSON response:', rawText.slice(0, 200))
    res.status(502).json({ error: 'STT provider returned invalid JSON' }); return
  }

  const text = (parsed.text ?? '').trim()
  console.log(`[stt] Transcription OK: "${text.slice(0, 80)}"`)
  res.status(200).json({ text })
}
