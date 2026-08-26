// ─── Voice AI Assistant ──────────────────────────────────────────────────
//
// Triggered by the 🎤 button in BottomDock.
// Listens to the driver's question via the Tesla microphone (Web Speech API),
// sends it with driving context to /api/ai-ask (Claude Haiku 4.5),
// speaks the answer aloud and shows it on screen.
//
// State machine:
//   idle  →  listening  →  processing  →  answer
//            (error)       (error)        (auto-dismiss 12s / tap)
//
// Usage:
//   openVoiceAssistant()   — called by the 🎤 button
//   <VoiceAssistant />     — always mounted in App.tsx

import { useState, useEffect, useRef, useCallback } from 'react'
import { gpsStore } from '@/features/gps/gpsStore'
import { vehicleProfileStore } from '@/features/planning/store'
import { batteryStore } from '@/features/planning/batteryStore'
import { routeStore } from '@/features/route/routeStore'
import { eventStore } from '@/features/events/eventStore'
import { countryStore } from '@/lib/countryStore'
import { TESLA_MODELS } from '@/features/planning/vehicleConfig'
import { haversineM } from '@/lib/geo'
import { getLang } from '@/lib/locale'
import { isTeslaBrowser } from '@/lib/browser'

// ── Module-level trigger ──────────────────────────────────────────────────
let _trigger: (() => void) | null = null
export function openVoiceAssistant(): void { _trigger?.() }

// ── Types ─────────────────────────────────────────────────────────────────
type Phase = 'idle' | 'listening' | 'processing' | 'answer' | 'error'

// ── Context builder ───────────────────────────────────────────────────────
function buildContext() {
  const gps     = gpsStore.getPosition()
  const profile = vehicleProfileStore.get()
  const battery = batteryStore.getState()
  const route   = routeStore.getState()
  const events  = eventStore.getState().events
  const country = countryStore.getCode() ?? 'BG'

  // ── Battery & range ──────────────────────────────────────────────────
  const batteryPct = battery?.currentBatteryPercent != null
    ? Math.round(battery.currentBatteryPercent)
    : (profile?.currentBatteryPercent != null ? Math.round(profile.currentBatteryPercent) : null)

  let rangeKm: number | null = null
  if (battery && batteryPct != null && profile) {
    // Look up vehicle-specific efficiency from config
    const modelCfg = TESLA_MODELS.find(m => m.name === profile.model)
    const trimCfg  = modelCfg?.trims.find(t => t.id === profile.trim)
    const effWhKm  = trimCfg?.efficiencyWhKm ?? 170
    // range = available energy / efficiency
    rangeKm = Math.round((battery.currentEnergyKwh * 1000) / effWhKm)
  }

  // ── Vehicle name ─────────────────────────────────────────────────────
  const vehicleName = profile
    ? `Tesla ${profile.model} ${profile.trim} (${profile.year})`
    : null

  // ── Route ────────────────────────────────────────────────────────────
  const routeActive = route.mode === 'navigating'
  const routeDistKm = route.remainingM != null ? Math.round(route.remainingM / 1000) : null

  // ETA — derive from remaining duration
  let routeEtaTime: string | null = null
  if (routeActive && route.route && route.remainingM != null) {
    const totalDist   = route.route.distanceM
    const totalDurS   = route.route.durationS
    const remainDurS  = totalDist > 0 ? (route.remainingM / totalDist) * totalDurS : 0
    const arrival     = new Date(Date.now() + remainDurS * 1000)
    routeEtaTime = arrival.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  }

  // ── Nearby events ─────────────────────────────────────────────────────
  const eventsNearby = gps
    ? events.filter(e => haversineM(gps.lat, gps.lng, e.lat, e.lng) < 20_000).length
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
    routeDistKm,
    routeEtaTime,
    eventsNearby,
    chargersNearby:   0,   // extend later from evStore
    countryCode:      country,
  }
}

// ── Speech helpers ────────────────────────────────────────────────────────
function getSpeechLang(): string {
  const lang = getLang()
  if (lang === 'bg') return 'bg-BG'
  if (lang === 'no') return 'nb-NO'
  if (lang === 'sv') return 'sv-SE'
  if (lang === 'fi') return 'fi-FI'
  return 'en-US'
}

function speak(text: string): void {
  if (!('speechSynthesis' in window)) return
  window.speechSynthesis.cancel()
  const utt  = new SpeechSynthesisUtterance(text)
  utt.lang   = getSpeechLang()
  utt.rate   = 1.0
  utt.volume = 1.0
  window.speechSynthesis.speak(utt)
}

function cancelSpeech(): void {
  if ('speechSynthesis' in window) window.speechSynthesis.cancel()
}

// ── Labels ────────────────────────────────────────────────────────────────
function label(bg: string, en: string): string {
  return getLang() === 'bg' ? bg : en
}

// ── Component ─────────────────────────────────────────────────────────────
export function VoiceAssistant() {
  const [phase,      setPhase]      = useState<Phase>('idle')
  const [transcript, setTranscript] = useState('')
  const [answer,     setAnswer]     = useState('')
  const [errorMsg,   setErrorMsg]   = useState('')

  const recogRef    = useRef<InstanceType<typeof window.SpeechRecognition> | null>(null)
  const dismissTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Register trigger
  useEffect(() => {
    _trigger = startListening
    return () => { _trigger = null }
  })

  const dismiss = useCallback(() => {
    cancelSpeech()
    if (recogRef.current) { try { recogRef.current.abort() } catch { /* ignore */ } }
    if (dismissTimer.current) clearTimeout(dismissTimer.current)
    setPhase('idle')
    setTranscript('')
    setAnswer('')
    setErrorMsg('')
  }, [])

  function startListening() {
    // Fallback: if Web Speech API not available — show typed input approach
    const SpeechRecognition =
      (window as unknown as { SpeechRecognition?: typeof window.SpeechRecognition }).SpeechRecognition ??
      (window as unknown as { webkitSpeechRecognition?: typeof window.SpeechRecognition }).webkitSpeechRecognition

    if (!SpeechRecognition) {
      setPhase('error')
      setErrorMsg(label(
        'Гласовото разпознаване не е поддържано в текущата версия на браузъра.',
        'Speech recognition is not supported in this browser version.'
      ))
      return
    }

    setPhase('listening')
    setTranscript('')
    setAnswer('')
    setErrorMsg('')

    const recognition = new SpeechRecognition()
    recogRef.current  = recognition
    recognition.lang              = getSpeechLang()
    recognition.interimResults    = false
    recognition.maxAlternatives   = 1
    recognition.continuous        = false

    recognition.onresult = (e: SpeechRecognitionEvent) => {
      const text = e.results[0]?.[0]?.transcript?.trim() ?? ''
      if (!text) return
      setTranscript(text)
      setPhase('processing')
      askAI(text)
    }

    recognition.onerror = (e: SpeechRecognitionErrorEvent) => {
      if (e.error === 'no-speech') {
        setPhase('error')
        setErrorMsg(label('Не чух нищо. Опитай отново.', 'No speech detected. Try again.'))
      } else if (e.error === 'not-allowed') {
        setPhase('error')
        setErrorMsg(label('Микрофонът не е разрешен.', 'Microphone access denied.'))
      } else {
        setPhase('error')
        setErrorMsg(label(`Грешка: ${e.error}`, `Error: ${e.error}`))
      }
    }

    recognition.onend = () => {
      // If still listening (no result, no error) → go to idle
      setPhase(p => p === 'listening' ? 'idle' : p)
    }

    recognition.start()
  }

  async function askAI(question: string) {
    try {
      const context = buildContext()
      const res = await fetch('/api/ai-ask', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ question, context }),
      })
      const data = await res.json() as { answer?: string; error?: string }

      if (!res.ok || data.error) {
        setPhase('error')
        setErrorMsg(data.error ?? label('Грешка при свързване с AI.', 'AI connection error.'))
        return
      }

      const ans = data.answer ?? ''
      setAnswer(ans)
      setPhase('answer')
      speak(ans)

      // Auto-dismiss after 12s
      if (dismissTimer.current) clearTimeout(dismissTimer.current)
      dismissTimer.current = setTimeout(dismiss, 12_000)

    } catch (err) {
      setPhase('error')
      setErrorMsg(label('Няма интернет връзка.', 'No internet connection.'))
      console.error('[VoiceAssistant]', err)
    }
  }

  if (phase === 'idle') return null

  // ── Overlay ───────────────────────────────────────────────────────────
  return (
    // eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions
    <div
      onClick={phase === 'answer' || phase === 'error' ? dismiss : undefined}
      style={{
        position:     'fixed',
        inset:        0,
        zIndex:       850,
        display:      'flex',
        flexDirection: 'column',
        alignItems:   'center',
        justifyContent: 'center',
        background:   'rgba(0,0,0,0.88)',
        backdropFilter: isTeslaBrowser ? undefined : 'blur(12px)',
        WebkitBackdropFilter: isTeslaBrowser ? undefined : 'blur(12px)',
        padding:      '32px 24px',
        gap:          24,
        userSelect:   'none',
        WebkitUserSelect: 'none',
      }}
    >
      {/* ── Listening ─────────────────────────────────────────────────── */}
      {phase === 'listening' && (
        <>
          <MicPulse />
          <div style={{ fontSize: 20, color: 'rgba(255,255,255,0.7)', fontWeight: 600 }}>
            {label('Слушам...', 'Listening...')}
          </div>
          <button
            onClick={dismiss}
            style={{
              marginTop: 8,
              padding: '10px 28px',
              borderRadius: 12,
              background: 'rgba(255,255,255,0.1)',
              border: '1px solid rgba(255,255,255,0.2)',
              color: 'rgba(255,255,255,0.55)',
              fontSize: 15,
              cursor: 'pointer',
              touchAction: 'manipulation',
            }}
          >
            {label('Отказ', 'Cancel')}
          </button>
        </>
      )}

      {/* ── Processing ────────────────────────────────────────────────── */}
      {phase === 'processing' && (
        <>
          <ThinkingDots />
          {transcript && (
            <div style={{
              fontSize: 16,
              color: 'rgba(255,255,255,0.45)',
              fontStyle: 'italic',
              maxWidth: 360,
              textAlign: 'center',
              lineHeight: 1.5,
            }}>
              &ldquo;{transcript}&rdquo;
            </div>
          )}
          <div style={{ fontSize: 18, color: 'rgba(255,255,255,0.65)', fontWeight: 600 }}>
            {label('Мисля...', 'Thinking...')}
          </div>
        </>
      )}

      {/* ── Answer ────────────────────────────────────────────────────── */}
      {phase === 'answer' && (
        <>
          {/* TesRadar AI badge */}
          <div style={{
            display: 'flex', alignItems: 'center', gap: 8,
            fontSize: 13, color: 'rgba(255,255,255,0.4)', letterSpacing: '0.08em',
          }}>
            <span style={{ fontSize: 18 }}>🤖</span>
            TesRadar AI
          </div>

          {/* Question (small) */}
          {transcript && (
            <div style={{
              fontSize: 14, color: 'rgba(255,255,255,0.35)', fontStyle: 'italic',
              maxWidth: 360, textAlign: 'center',
            }}>
              &ldquo;{transcript}&rdquo;
            </div>
          )}

          {/* Answer (large) */}
          <div style={{
            maxWidth:   400,
            padding:    '20px 24px',
            borderRadius: 18,
            background: 'rgba(255,255,255,0.07)',
            border:     '1px solid rgba(255,255,255,0.12)',
            fontSize:   20,
            fontWeight: 500,
            color:      '#fff',
            lineHeight: 1.55,
            textAlign:  'center',
          }}>
            {answer}
          </div>

          {/* Dismiss hint */}
          <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.25)' }}>
            {label('Докоснете за затваряне', 'Tap to dismiss')}
          </div>
        </>
      )}

      {/* ── Error ─────────────────────────────────────────────────────── */}
      {phase === 'error' && (
        <>
          <div style={{ fontSize: 40 }}>⚠️</div>
          <div style={{
            fontSize: 17, color: 'rgba(255,255,255,0.75)',
            maxWidth: 340, textAlign: 'center', lineHeight: 1.5,
          }}>
            {errorMsg}
          </div>
          <button
            onClick={dismiss}
            style={{
              padding: '12px 32px', borderRadius: 12,
              background: 'rgba(255,255,255,0.12)',
              border: '1px solid rgba(255,255,255,0.2)',
              color: '#fff', fontSize: 16,
              cursor: 'pointer', touchAction: 'manipulation',
            }}
          >
            {label('Затвори', 'Close')}
          </button>
        </>
      )}
    </div>
  )
}

// ── Mic pulse animation ───────────────────────────────────────────────────
function MicPulse() {
  return (
    <div style={{ position: 'relative', width: 88, height: 88 }}>
      {/* Outer pulse ring */}
      <div style={{
        position: 'absolute', inset: -12,
        borderRadius: '50%',
        border: '2px solid rgba(227,25,55,0.4)',
        animation: 'voice-pulse 1.4s ease-in-out infinite',
      }} />
      {/* Inner circle */}
      <div style={{
        width: 88, height: 88, borderRadius: '50%',
        background: 'rgba(227,25,55,0.2)',
        border: '2px solid #e31937',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        boxShadow: '0 0 32px rgba(227,25,55,0.35)',
      }}>
        <MicIcon />
      </div>
      <style>{`
        @keyframes voice-pulse {
          0%   { transform: scale(1);   opacity: 0.6; }
          50%  { transform: scale(1.25); opacity: 0.2; }
          100% { transform: scale(1);   opacity: 0.6; }
        }
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
          animation: `dot-bounce 1.2s ease-in-out ${i * 0.2}s infinite`,
        }} />
      ))}
      <style>{`
        @keyframes dot-bounce {
          0%, 100% { transform: translateY(0);    opacity: 0.4; }
          50%       { transform: translateY(-10px); opacity: 1;   }
        }
      `}</style>
    </div>
  )
}

function MicIcon() {
  return (
    <svg width="36" height="36" viewBox="0 0 24 24" fill="none"
      stroke="#e31937" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="9" y="2" width="6" height="12" rx="3" />
      <path d="M5 10a7 7 0 0 0 14 0" />
      <line x1="12" y1="17" x2="12" y2="21" />
      <line x1="9"  y1="21" x2="15" y2="21" />
    </svg>
  )
}
