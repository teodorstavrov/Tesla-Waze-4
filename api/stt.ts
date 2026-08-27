// ─── POST /api/stt ────────────────────────────────────────────────────────
//
// Speech-to-text endpoint — MediaRecorder fallback for browsers where
// SpeechRecognition / webkitSpeechRecognition cannot reach its cloud backend
// (e.g. Tesla Browser's webkitSpeechRecognition → Google STT unreachable).
//
// Client sends JSON:
//   { audio: "<base64>", mimeType: "audio/webm;codecs=opus", lang: "bg" }
//
// Server decodes → Groq Whisper (whisper-large-v3-turbo, free tier)
// Returns: { text: string } or { error: string }
//
// Provider is isolated here — swap STT service without touching the client.
// Requires env var: GROQ_API_KEY  (same key used by /api/ai-ask)
// Free tier: 7 200 sec audio / day (~120 hours).

import type { VercelRequest, VercelResponse } from '@vercel/node'

interface SttBody {
  audio:    string   // base64-encoded audio
  mimeType: string   // e.g. 'audio/webm;codecs=opus'
  lang:     string   // BCP-47 hint, e.g. 'bg', 'en'
}

interface GroqTranscription {
  text: string
}

// BCP-47 → Whisper ISO-639-1
const LANG: Record<string, string> = {
  'bg': 'bg', 'bg-BG': 'bg',
  'en': 'en', 'en-US': 'en',
  'no': 'no', 'nb-NO': 'no',
  'sv': 'sv', 'sv-SE': 'sv',
  'fi': 'fi', 'fi-FI': 'fi',
}

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  if (req.method === 'OPTIONS') { res.status(204).end(); return }
  if (req.method !== 'POST')   { res.status(405).json({ error: 'Method not allowed' }); return }

  const apiKey = process.env['GROQ_API_KEY']
  if (!apiKey) {
    res.status(503).json({ error: 'STT not configured (GROQ_API_KEY missing)' }); return
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const body = req.body as any
  const audio    = (body?.audio    ?? '') as string
  const mimeType = (body?.mimeType ?? 'audio/webm') as string
  const lang     = (body?.lang     ?? 'bg') as string

  if (!audio || audio.length < 50) {
    res.status(400).json({ error: 'Missing or too-short audio (base64 required)' }); return
  }

  // Decode base64 → Buffer
  let audioBuf: Buffer
  try {
    audioBuf = Buffer.from(audio, 'base64')
  } catch {
    res.status(400).json({ error: 'Invalid base64 audio data' }); return
  }

  if (audioBuf.length < 500) {
    res.status(400).json({ error: 'Audio too short to transcribe' }); return
  }

  // Resolve file extension
  const ext = mimeType.startsWith('audio/mp4')  ? 'mp4'
            : mimeType.startsWith('audio/ogg')  ? 'ogg'
            : 'webm'

  const whisperLang = LANG[lang] ?? 'bg'

  // Build multipart form using native FormData + Blob (Node 18+)
  // This is the correct approach — no manual boundary construction.
  const audioBlob = new Blob([audioBuf], { type: mimeType })
  const form = new FormData()
  form.append('file',            audioBlob, `audio.${ext}`)
  form.append('model',           'whisper-large-v3-turbo')
  form.append('response_format', 'json')
  form.append('language',        whisperLang)

  try {
    const r = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
      method:  'POST',
      headers: { 'Authorization': `Bearer ${apiKey}` },
      // Do NOT set Content-Type — fetch sets it automatically with the correct boundary
      body: form,
    })

    const raw = await r.text()

    if (!r.ok) {
      console.error('[stt] Groq error', r.status, raw.slice(0, 300))
      res.status(502).json({ error: `STT provider error ${r.status}: ${raw.slice(0, 120)}` }); return
    }

    let data: GroqTranscription
    try {
      data = JSON.parse(raw) as GroqTranscription
    } catch {
      res.status(502).json({ error: 'STT invalid JSON response' }); return
    }

    res.status(200).json({ text: (data.text ?? '').trim() })

  } catch (err) {
    console.error('[stt] fetch error', err)
    res.status(500).json({ error: `STT fetch failed: ${String(err)}` })
  }
}
