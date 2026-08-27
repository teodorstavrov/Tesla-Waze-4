// ─── Voice AI Assistant ──────────────────────────────────────────────────
//
// Architecture:
//   Path A (SpeechRecognition available — most Chromium/Tesla browsers):
//     button → SR.start() → transcript → /api/ai-ask → SpeechSynthesis
//
//   Path B (SpeechRecognition unavailable — fallback):
//     button → getUserMedia() → MediaRecorder → Blob → /api/stt → transcript
//     → /api/ai-ask → SpeechSynthesis
//
// All mic capability checks are isolated in micCapability.ts.
//
// Public API:
//   openVoiceAssistant()   — called by the 🎤 button (BottomDock)
//   <VoiceAssistant />     — always mounted in App.tsx

import { useState, useEffect, useRef, useCallback } from 'react'
import { gpsStore }           from '@/features/gps/gpsStore'
import { vehicleProfileStore } from '@/features/planning/store'
import { batteryStore }        from '@/features/planning/batteryStore'
import { routeStore }          from '@/features/route/routeStore'
import { eventStore }          from '@/features/events/eventStore'
import { countryStore }        from '@/lib/countryStore'
import { TESLA_MODELS }        from '@/features/planning/vehicleConfig'
import { haversineMeters }     from '@/lib/geo'
import { getLang }             from '@/lib/locale'
import { isTeslaBrowser }      from '@/lib/browser'
import {
  requestMicrophone,
  releaseMicrophone,
  getMicErrorType,
  getMicErrorMessage,
  isSpeechRecognitionSupported,
  getBestMimeType,
} from './micCapability'

// ── Module-level trigger ───────────────────────────────────────────────────
let _trigger: (() => void) | null = null
export function openVoiceAssistant(): void { _trigger?.() }

type Phase = 'idle' | 'listening' | 'recording' | 'processing' | 'answer' | 'error'

// ── Context builder ────────────────────────────────────────────────────────
function buildContext() {
  const gps     = gpsStore.getPosition()
  const profile = vehicleProfileStore.get()
  const battery = batteryStore.getState()
  const route   = routeStore.getState()
  const events  = eventStore.getState().events
  const country = countryStore.getCode() ?? 'BG'

  const batteryPct =
    battery?.currentBatteryPercent != null ? Math.round(battery.currentBatteryPercent)
    : profile?.currentBatteryPercent != null ? Math.round(profile.currentBatteryPercent)
    : null

  let rangeKm: number | null = null
  if (battery && profile) {
    const modelCfg = TESLA_MODELS.find(m => m.name === profile.model)
    const trimCfg  = modelCfg?.trims.find(t => t.id === profile.trim)
    const effWhKm  = trimCfg?.efficiencyWhKm ?? 170
    rangeKm = Math.round((battery.currentEnergyKwh * 1000) / effWhKm)
  }

  const vehicleName = profile
    ? `Tesla ${profile.model} ${profile.trim} (${profile.year})`
    : null

  const routeActive = route.mode === 'navigating'
  let routeEtaTime: string | null = null
  if (routeActive && route.route && route.remainingM != null && route.route.distanceM > 0) {
    const remainDurS = (route.remainingM / route.route.distanceM) * route.route.durationS
    routeEtaTime = new Date(Date.now() + remainDurS * 1000)
      .toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  }

  const eventsNearby = gps
    ? events.filter(e => haversineMeters(gps.lat, gps.lng, e.lat, e.lng) < 20_000).length
    : 0

  return {
    lat:              gps?.lat ?? null,
    lng:              gps?.lng ?? null,
    speedKmh:         gps?.speed != null ? Math.round(gps.speed * 3.6) : null,
    batteryPct,
    rangeKm,
    vehicleName,
    routeActive,
    routeDestination: route.destination?.name ?? null,
    routeDistKm:      route.remainingM != null ? Math.round(route.remainingM / 1000) : null,
    routeEtaTime,
    eventsNearby,
    chargersNearby:   0,
    countryCode:      country,
  }
}

// ── Speech helpers ─────────────────────────────────────────────────────────
function speechLang(): string {
  const l = getLang()
  if (l === 'bg') return 'bg-BG'
  if (l === 'no') return 'nb-NO'
  if (l === 'sv') return 'sv-SE'
  if (l === 'fi') return 'fi-FI'
  return 'en-US'
}

function speak(text: string): void {
  if (!('speechSynthesis' in window)) return
  window.speechSynthesis.cancel()
  const utt = new SpeechSynthesisUtterance(text)
  utt.lang   = speechLang()
  utt.rate   = 1.05
  utt.volume = 1.0
  window.speechSynthesis.speak(utt)
}

function stopSpeech(): void {
  if ('speechSynthesis' in window) window.speechSynthesis.cancel()
}

const lbl = (bg: string, en: string) => getLang() === 'bg' ? bg : en

// ── Component ──────────────────────────────────────────────────────────────
export function VoiceAssistant() {
  const [phase,      setPhase]      = useState<Phase>('idle')
  const [transcript, setTranscript] = useState('')
  const [answer,     setAnswer]     = useState('')
  const [errorMsg,   setErrorMsg]   = useState('')
  const [recSeconds, setRecSeconds] = useState(0)

  const recogRef     = useRef<InstanceType<typeof window.SpeechRecognition> | null>(null)
  const streamRef    = useRef<MediaStream | null>(null)
  const recorderRef  = useRef<MediaRecorder | null>(null)
  const chunksRef    = useRef<Blob[]>([])
  const timerRef     = useRef<ReturnType<typeof setInterval> | null>(null)
  const dismissTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const dismiss = useCallback(() => {
    stopSpeech()
    try { recogRef.current?.abort() } catch { /* ignore */ }
    try { recorderRef.current?.stop() } catch { /* ignore */ }
    releaseMicrophone(streamRef.current); streamRef.current = null
    if (timerRef.current) clearInterval(timerRef.current)
    if (dismissTimer.current) clearTimeout(dismissTimer.current)
    setPhase('idle')
    setTranscript('')
    setAnswer('')
    setErrorMsg('')
    setRecSeconds(0)
  }, [])

  // Register module-level trigger
  useEffect(() => {
    _trigger = startListening
    return () => { _trigger = null }
  })  // eslint-disable-line react-hooks/exhaustive-deps

  // ── Path A: SpeechRecognition ────────────────────────────────────────────
  function startWithSpeechRecognition() {
    const w = window as Record<string, unknown>
    const SR = (
      (w['SpeechRecognition'] as typeof window.SpeechRecognition | undefined) ??
      (w['webkitSpeechRecognition'] as typeof window.SpeechRecognition | undefined)
    )
    if (!SR) return false

    setPhase('listening')
    setTranscript('')
    setAnswer('')
    setErrorMsg('')

    const r = new SR()
    recogRef.current  = r
    r.lang            = speechLang()
    r.interimResults  = false
    r.maxAlternatives = 1
    r.continuous      = false

    r.onresult = (e: SpeechRecognitionEvent) => {
      const text = e.results[0]?.[0]?.transcript?.trim() ?? ''
      if (!text) return
      setTranscript(text)
      setPhase('processing')
      void askAI(text)
    }

    r.onerror = (e: SpeechRecognitionErrorEvent) => {
      console.error('[VoiceAssistant] SR error:', e.error, {
        isSecureContext: window.isSecureContext,
        protocol:        location.protocol,
        hostname:        location.hostname,
        userAgent:       navigator.userAgent,
      })

      if (e.error === 'no-speech') {
        setPhase('error')
        setErrorMsg(lbl('Не чух нищо. Опитай отново.', 'No speech detected. Try again.'))
      } else if (e.error === 'not-allowed') {
        setPhase('error')
        setErrorMsg(getMicErrorMessage('not-allowed', getLang()))
      } else if (e.error === 'service-not-allowed') {
        // SpeechRecognition itself not available — try MediaRecorder fallback
        setPhase('idle')
        void startWithMediaRecorder()
      } else if (e.error === 'network') {
        // Chrome SR sends audio to Google servers — Tesla browser can't reach them.
        // Fall through to MediaRecorder + Groq Whisper fallback.
        console.warn('[VoiceAssistant] SR network error (Google STT unreachable) → MediaRecorder fallback')
        setPhase('idle')
        void startWithMediaRecorder()
      } else {
        // Anything else → attempt MediaRecorder fallback
        console.warn('[VoiceAssistant] SR error, trying MediaRecorder fallback:', e.error)
        setPhase('idle')
        void startWithMediaRecorder()
      }
    }

    r.onend = () => {
      setPhase(p => p === 'listening' ? 'idle' : p)
    }

    r.start()
    return true
  }

  // ── Path B: MediaRecorder fallback ───────────────────────────────────────
  async function startWithMediaRecorder() {
    setPhase('listening')   // show "preparing..."
    setErrorMsg('')

    let stream: MediaStream
    try {
      stream = await requestMicrophone()
    } catch (err) {
      const type = getMicErrorType(err)
      console.error('[VoiceAssistant] getUserMedia error:', {
        type,
        err,
        isSecureContext: window.isSecureContext,
        protocol:        location.protocol,
        userAgent:       navigator.userAgent,
      })
      setPhase('error')
      setErrorMsg(getMicErrorMessage(type, getLang()))
      return
    }

    streamRef.current = stream
    chunksRef.current = []

    const mimeType = getBestMimeType() ?? undefined
    let recorder: MediaRecorder
    try {
      recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined)
    } catch (err) {
      console.error('[VoiceAssistant] MediaRecorder init error:', err)
      releaseMicrophone(stream); streamRef.current = null
      setPhase('error')
      setErrorMsg(lbl(
        'Браузърът не поддържа запис на аудио.',
        'This browser does not support audio recording.',
      ))
      return
    }

    recorderRef.current = recorder

    recorder.ondataavailable = (e) => {
      if (e.data?.size > 0) chunksRef.current.push(e.data)
    }

    recorder.onstop = () => {
      if (timerRef.current) clearInterval(timerRef.current)
      releaseMicrophone(streamRef.current); streamRef.current = null

      const blob = new Blob(chunksRef.current, { type: mimeType ?? 'audio/webm' })
      chunksRef.current = []

      if (blob.size < 1000) {
        setPhase('error')
        setErrorMsg(lbl('Записът е твърде кратък. Опитай отново.', 'Recording too short. Try again.'))
        return
      }

      setPhase('processing')
      void transcribeAndAsk(blob, mimeType ?? 'audio/webm')
    }

    recorder.onerror = () => {
      if (timerRef.current) clearInterval(timerRef.current)
      releaseMicrophone(streamRef.current); streamRef.current = null
      setPhase('error')
      setErrorMsg(lbl('Грешка при запис.', 'Recording error.'))
    }

    recorder.start(200)  // collect chunks every 200ms
    setPhase('recording')
    setRecSeconds(0)

    // Countdown timer + auto-stop at 10s
    timerRef.current = setInterval(() => {
      setRecSeconds(s => {
        if (s >= 9) {
          stopRecording()
          return 10
        }
        return s + 1
      })
    }, 1000)
  }

  function stopRecording() {
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null }
    try {
      if (recorderRef.current?.state === 'recording') {
        recorderRef.current.stop()
      }
    } catch { /* ignore */ }
  }

  async function transcribeAndAsk(blob: Blob, mimeType: string) {
    // Convert Blob → base64 via FileReader (reliable for any size, no stack limit)
    let base64: string
    try {
      base64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = () => {
          const dataUrl = reader.result as string
          // dataUrl = "data:audio/webm;base64,AAAA..."
          const comma = dataUrl.indexOf(',')
          resolve(comma >= 0 ? dataUrl.slice(comma + 1) : dataUrl)
        }
        reader.onerror = () => reject(new Error('FileReader failed'))
        reader.readAsDataURL(blob)
      })
    } catch (err) {
      console.error('[VoiceAssistant] FileReader error:', err)
      setPhase('error')
      setErrorMsg(lbl('Грешка при четене на аудио файла.', 'Failed to read audio data.'))
      return
    }

    try {
      const res = await fetch('/api/stt', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ audio: base64, mimeType, lang: getLang() }),
      })

      let data: { text?: string; error?: string }
      try {
        data = await res.json() as { text?: string; error?: string }
      } catch {
        data = { error: `HTTP ${res.status}` }
      }

      if (!res.ok || data.error) {
        console.error('[VoiceAssistant] STT error response:', res.status, data.error)
        setPhase('error')
        setErrorMsg(data.error ?? lbl(
          `Грешка при разпознаване (${res.status}).`,
          `Speech recognition error (${res.status}).`,
        ))
        return
      }

      const text = data.text?.trim() ?? ''
      if (!text) {
        setPhase('error')
        setErrorMsg(lbl('Не разпознах реч. Опитай отново.', 'No speech detected. Try again.'))
        return
      }

      setTranscript(text)
      void askAI(text)

    } catch (err) {
      // Show the real error — helps diagnose during Tesla browser testing
      const msg = err instanceof Error ? `${err.name}: ${err.message}` : String(err)
      console.error('[VoiceAssistant] STT fetch threw:', msg)
      setPhase('error')
      setErrorMsg(lbl(`Грешка при STT: ${msg}`, `STT error: ${msg}`))
    }
  }

  // ── Entry point ──────────────────────────────────────────────────────────
  function startListening() {
    dismiss()  // reset any previous state
    if (isSpeechRecognitionSupported()) {
      startWithSpeechRecognition()
    } else {
      void startWithMediaRecorder()
    }
  }

  // ── AI call ──────────────────────────────────────────────────────────────
  async function askAI(question: string) {
    try {
      const res  = await fetch('/api/ai-ask', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ question, context: buildContext() }),
      })
      const data = await res.json() as { answer?: string; error?: string }

      if (!res.ok || data.error) {
        setPhase('error')
        setErrorMsg(data.error ?? lbl('Грешка при свързване с AI.', 'AI connection error.'))
        return
      }

      const ans = data.answer ?? ''
      setAnswer(ans)
      setPhase('answer')
      speak(ans)

      if (dismissTimer.current) clearTimeout(dismissTimer.current)
      dismissTimer.current = setTimeout(dismiss, 14_000)

    } catch {
      setPhase('error')
      setErrorMsg(lbl('Няма интернет връзка.', 'No internet connection.'))
    }
  }

  if (phase === 'idle') return null

  const canDismissByTap = phase === 'answer' || phase === 'error'

  return (
    // eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions
    <div
      onClick={canDismissByTap ? dismiss : undefined}
      style={{
        position:            'fixed',
        inset:               0,
        zIndex:              850,
        display:             'flex',
        flexDirection:       'column',
        alignItems:          'center',
        justifyContent:      'center',
        background:          'rgba(0,0,0,0.88)',
        backdropFilter:      isTeslaBrowser ? undefined : 'blur(12px)',
        WebkitBackdropFilter: isTeslaBrowser ? undefined : 'blur(12px)',
        padding:             '32px 24px',
        gap:                 24,
        userSelect:          'none',
        WebkitUserSelect:    'none',
      }}
    >
      {/* ── LISTENING (SpeechRecognition mode) ─────────────────────────── */}
      {phase === 'listening' && <>
        <MicPulse />
        <div style={{ fontSize: 20, color: 'rgba(255,255,255,0.75)', fontWeight: 600 }}>
          {lbl('🎤 Слушам...', '🎤 Listening...')}
        </div>
        <button onClick={dismiss} style={cancelBtnStyle}>
          {lbl('Отказ', 'Cancel')}
        </button>
      </>}

      {/* ── RECORDING (MediaRecorder mode) ─────────────────────────────── */}
      {phase === 'recording' && <>
        <MicPulse recording />
        <div style={{ fontSize: 20, color: '#e31937', fontWeight: 700 }}>
          ⏺ {lbl('Запис', 'Recording')} {recSeconds}s / 10s
        </div>
        <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.45)', marginTop: -8 }}>
          {lbl('Докосни Стоп когато приключиш', 'Tap Stop when done')}
        </div>
        <button onClick={stopRecording} style={{ ...cancelBtnStyle, background: 'rgba(227,25,55,0.2)', borderColor: '#e31937', color: '#fff' }}>
          {lbl('⏹ Стоп', '⏹ Stop')}
        </button>
        <button onClick={dismiss} style={cancelBtnStyle}>
          {lbl('Отказ', 'Cancel')}
        </button>
      </>}

      {/* ── PROCESSING ─────────────────────────────────────────────────── */}
      {phase === 'processing' && <>
        <ThinkingDots />
        {transcript && (
          <div style={{
            fontSize: 15, color: 'rgba(255,255,255,0.4)', fontStyle: 'italic',
            maxWidth: 360, textAlign: 'center', lineHeight: 1.5,
          }}>
            &ldquo;{transcript}&rdquo;
          </div>
        )}
        <div style={{ fontSize: 19, color: 'rgba(255,255,255,0.7)', fontWeight: 600 }}>
          {lbl('⏳ Обработвам...', '⏳ Processing...')}
        </div>
      </>}

      {/* ── ANSWER ─────────────────────────────────────────────────────── */}
      {phase === 'answer' && <>
        <div style={{
          display: 'flex', alignItems: 'center', gap: 8,
          fontSize: 12, color: 'rgba(255,255,255,0.38)', letterSpacing: '0.08em',
        }}>
          <span style={{ fontSize: 17 }}>🤖</span>TesRadar AI
        </div>
        {transcript && (
          <div style={{
            fontSize: 14, color: 'rgba(255,255,255,0.32)', fontStyle: 'italic',
            maxWidth: 360, textAlign: 'center',
          }}>
            &ldquo;{transcript}&rdquo;
          </div>
        )}
        <div style={{
          maxWidth: 420, padding: '20px 26px', borderRadius: 20,
          background: 'rgba(255,255,255,0.07)',
          border: '1px solid rgba(255,255,255,0.13)',
          fontSize: 20, fontWeight: 500, color: '#fff',
          lineHeight: 1.6, textAlign: 'center',
        }}>
          {answer}
        </div>
        <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.22)' }}>
          {lbl('🔊 Докоснете за затваряне', '🔊 Tap to dismiss')}
        </div>
      </>}

      {/* ── ERROR ──────────────────────────────────────────────────────── */}
      {phase === 'error' && <>
        <div style={{ fontSize: 42 }}>⚠️</div>
        <div style={{
          fontSize: 17, color: 'rgba(255,255,255,0.75)',
          maxWidth: 340, textAlign: 'center', lineHeight: 1.55,
        }}>
          {errorMsg}
        </div>
        <button onClick={dismiss} style={cancelBtnStyle}>
          {lbl('Затвори', 'Close')}
        </button>
      </>}
    </div>
  )
}

// ── Shared styles ──────────────────────────────────────────────────────────
const cancelBtnStyle: React.CSSProperties = {
  padding:      '11px 30px',
  borderRadius: 12,
  background:   'rgba(255,255,255,0.10)',
  border:       '1px solid rgba(255,255,255,0.18)',
  color:        'rgba(255,255,255,0.6)',
  fontSize:     15,
  cursor:       'pointer',
  touchAction:  'manipulation',
}

// ── Animations ─────────────────────────────────────────────────────────────
function MicPulse({ recording = false }: { recording?: boolean }) {
  const color = recording ? '#e31937' : '#e31937'
  return (
    <div style={{ position: 'relative', width: 88, height: 88 }}>
      <div style={{
        position: 'absolute', inset: -14, borderRadius: '50%',
        border: `2px solid ${recording ? 'rgba(227,25,55,0.5)' : 'rgba(227,25,55,0.35)'}`,
        animation: recording ? 'va-pulse-fast 0.8s ease-in-out infinite' : 'va-pulse 1.5s ease-in-out infinite',
      }} />
      <div style={{
        width: 88, height: 88, borderRadius: '50%',
        background: `rgba(227,25,55,${recording ? '0.25' : '0.18'})`,
        border: `2px solid ${color}`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        boxShadow: `0 0 36px rgba(227,25,55,${recording ? '0.5' : '0.3'})`,
      }}>
        <MicSvg color={color} size={36} />
      </div>
      <style>{`
        @keyframes va-pulse      { 0%,100%{transform:scale(1);opacity:.55} 50%{transform:scale(1.28);opacity:.15} }
        @keyframes va-pulse-fast { 0%,100%{transform:scale(1);opacity:.70} 50%{transform:scale(1.35);opacity:.20} }
      `}</style>
    </div>
  )
}

function ThinkingDots() {
  return (
    <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
      {[0, 1, 2].map(i => (
        <div key={i} style={{
          width: 12, height: 12, borderRadius: '50%',
          background: '#e31937',
          animation: `va-dot 1.2s ease-in-out ${i * 0.18}s infinite`,
        }} />
      ))}
      <style>{`@keyframes va-dot{0%,100%{transform:translateY(0);opacity:.35}50%{transform:translateY(-10px);opacity:1}}`}</style>
    </div>
  )
}

// ── Icons ──────────────────────────────────────────────────────────────────
function MicSvg({ color = 'currentColor', size = 28 }: { color?: string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="9" y="2" width="6" height="12" rx="3" />
      <path d="M5 10a7 7 0 0 0 14 0" />
      <line x1="12" y1="17" x2="12" y2="21" />
      <line x1="9"  y1="21" x2="15" y2="21" />
    </svg>
  )
}

export function MicButtonIcon() {
  return <MicSvg size={28} />
}
