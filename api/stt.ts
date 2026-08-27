// ─── POST /api/stt ────────────────────────────────────────────────────────
//
// Speech-to-text endpoint — MediaRecorder fallback for browsers where
// SpeechRecognition / webkitSpeechRecognition is unavailable (e.g. older
// Tesla browser firmware).
//
// Client sends JSON body:
//   { audio: "<base64 encoded audio>", mimeType: "audio/webm;codecs=opus", lang: "bg" }
//
// Server decodes, forwards to Groq Whisper (whisper-large-v3-turbo, free tier),
// returns:
//   { text: string }     success
//   { error: string }    failure
//
// Provider is isolated here — swap to any STT service without touching the client.
// Required env var: GROQ_API_KEY  (same key used by /api/ai-ask)
// Free tier: 7200 sec audio / day (~100 hours) — ample.

import type { VercelRequest, VercelResponse } from '@vercel/node'

interface SttBody {
  audio:    string  // base64-encoded audio data
  mimeType: string  // e.g. 'audio/webm;codecs=opus'
  lang:     string  // BCP-47 language code hint, e.g. 'bg', 'en', 'no'
}

interface GroqTranscriptionResponse {
  text: string
}

// Groq language code map (Whisper uses ISO-639-1)
const LANG_MAP: Record<string, string> = {
  'bg':    'bg',
  'bg-BG': 'bg',
  'en':    'en',
  'en-US': 'en',
  'no':    'no',
  'nb-NO': 'no',
  'sv':    'sv',
  'sv-SE': 'sv',
  'fi':    'fi',
  'fi-FI': 'fi',
}

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  if (req.method === 'OPTIONS') { res.status(204).end(); return }
  if (req.method !== 'POST')   { res.status(405).json({ error: 'Method not allowed' }); return }

  const apiKey = process.env['GROQ_API_KEY']
  if (!apiKey) {
    res.status(503).json({ error: 'STT not configured — GROQ_API_KEY missing' }); return
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const body = req.body as any
  const { audio, mimeType = 'audio/webm', lang = 'bg' } = (body ?? {}) as SttBody

  if (!audio || typeof audio !== 'string') {
    res.status(400).json({ error: 'Missing audio field (base64 string)' }); return
  }
  if (audio.length < 100) {
    res.status(400).json({ error: 'Audio too short to transcribe' }); return
  }

  // Decode base64 → Buffer
  let audioBuf: Buffer
  try {
    audioBuf = Buffer.from(audio, 'base64')
  } catch {
    res.status(400).json({ error: 'Invalid base64 audio data' }); return
  }

  // Resolve file extension from mimeType
  const ext = mimeType.startsWith('audio/mp4')  ? 'mp4'
             : mimeType.startsWith('audio/ogg')  ? 'ogg'
             : mimeType.startsWith('audio/webm') ? 'webm'
             : 'webm'

  // Build multipart/form-data body for Groq
  const whisperLang = LANG_MAP[lang] ?? 'bg'
  const boundary = `----TesRadarSTT${Date.now()}`

  const part = (name: string, value: string) =>
    `--${boundary}\r\nContent-Disposition: form-data; name="${name}"\r\n\r\n${value}\r\n`

  const textParts = Buffer.from(
    part('model',           'whisper-large-v3-turbo') +
    part('response_format', 'json') +
    part('language',        whisperLang),
    'utf8',
  )

  const fileHeader = Buffer.from(
    `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="audio.${ext}"\r\nContent-Type: ${mimeType}\r\n\r\n`,
    'utf8',
  )
  const fileFooter = Buffer.from(`\r\n--${boundary}--\r\n`, 'utf8')

  const formBody = Buffer.concat([textParts, fileHeader, audioBuf, fileFooter])

  try {
    const r = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
      method:  'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type':  `multipart/form-data; boundary=${boundary}`,
        'Content-Length': String(formBody.length),
      },
      body: formBody,
    })

    if (!r.ok) {
      const errText = await r.text()
      console.error('[stt] Groq error', r.status, errText.slice(0, 300))
      res.status(502).json({ error: `STT provider error ${r.status}` }); return
    }

    const data = await r.json() as GroqTranscriptionResponse
    const text = (data.text ?? '').trim()

    if (!text) {
      res.status(200).json({ text: '' }); return
    }

    res.status(200).json({ text })

  } catch (err) {
    console.error('[stt] fetch error', err)
    res.status(500).json({ error: String(err) })
  }
}
