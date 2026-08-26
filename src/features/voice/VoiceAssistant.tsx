// ─── Voice AI Assistant ──────────────────────────────────────────────────
//
// 🎤 button in BottomDock → listens via Web Speech API → sends to Groq
// (llama-3.1-8b-instant, free) → speaks answer via SpeechSynthesis.
//
// State machine:  idle → listening → processing → answer / error
//
// Public API:
//   openVoiceAssistant()   — called by the 🎤 button
//   <VoiceAssistant />     — always mounted in App.tsx (renders nothing when idle)

import { useState, useEffect, useRef, useCallback } from 'react'
import { gpsStore } from '@/features/gps/gpsStore'
import { vehicleProfileStore } from '@/features/planning/store'
import { batteryStore } from '@/features/planning/batteryStore'
import { routeStore } from '@/features/route/routeStore'
import { eventStore } from '@/features/events/eventStore'
import { countryStore } from '@/lib/countryStore'
import { TESLA_MODELS } from '@/features/planning/vehicleConfig'
import { haversineMeters } from '@/lib/geo'
import { getLang } from '@/lib/locale'
import { isTeslaBrowser } from '@/lib/browser'

// ── Module-level trigger (same pattern as openCountryPicker, openSupportModal) ──
let _trigger: (() => void) | null = null
export function openVoiceAssistant(): void { _trigger?.() }

type Phase = 'idle' | 'listening' | 'processing' | 'answer' | 'error'

// ── Context builder ───────────────────────────────────────────────────────
function buildContext() {
  const gps     = gpsStore.getPosition()
  const profile = vehicleProfileStore.get()
  const battery = batteryStore.getState()
  const route   = routeStore.getState()
  const events  = eventStore.getState().events
  const country = countryStore.getCode() ?? 'BG'

  // Battery %
  const batteryPct =
    battery?.currentBatteryPercent != null ? Math.round(battery.currentBatteryPercent)
    : profile?.currentBatteryPercent != null ? Math.round(profile.currentBatteryPercent)
    : null

  // Estimated range using per-trim efficiency from vehicleConfig
  let rangeKm: number | null = null
  if (battery && profile) {
    const modelCfg = TESLA_MODELS.find(m => m.name === profile.model)
    const trimCfg  = modelCfg?.trims.find(t => t.id === profile.trim)
    const effWhKm  = trimCfg?.efficiencyWhKm ?? 170
    rangeKm = Math.round((battery.currentEnergyKwh * 1000) / effWhKm)
  }

  // Vehicle display name
  const vehicleName = profile
    ? `Tesla ${profile.model} ${profile.trim} (${profile.year})`
    : null

  // Route
  const routeActive    = route.mode === 'navigating'
  const routeDistKm    = route.remainingM != null ? Math.round(route.remainingM / 1000) : null
  let routeEtaTime: string | null = null
  if (routeActive && route.route && route.remainingM != null && route.route.distanceM > 0) {
    const remainDurS = (route.remainingM / route.route.distanceM) * route.route.durationS
    routeEtaTime = new Date(Date.now() + remainDurS * 1000)
      .toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  }

  // Nearby events (20 km radius)
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
    routeDistKm,
    routeEtaTime,
    eventsNearby,
    chargersNearby:   0,
    countryCode:      country,
  }
}

// ── Speech helpers ────────────────────────────────────────────────────────
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
  const utt  = new SpeechSynthesisUtterance(text)
  utt.lang   = speechLang()
  utt.rate   = 1.05
  utt.volume = 1.0
  window.speechSynthesis.speak(utt)
}

function stopSpeech(): void {
  if ('speechSynthesis' in window) window.speechSynthesis.cancel()
}

const lbl = (bg: string, en: string) => getLang() === 'bg' ? bg : en

// ── Component ─────────────────────────────────────────────────────────────
export function VoiceAssistant() {
  const [phase,      setPhase]      = useState<Phase>('idle')
  const [transcript, setTranscript] = useState('')
  const [answer,     setAnswer]     = useState('')
  const [errorMsg,   setErrorMsg]   = useState('')

  const recogRef      = useRef<InstanceType<typeof window.SpeechRecognition> | null>(null)
  const dismissTimer  = useRef<ReturnType<typeof setTimeout> | null>(null)

  const dismiss = useCallback(() => {
    stopSpeech()
    try { recogRef.current?.abort() } catch { /* ignore */ }
    if (dismissTimer.current) clearTimeout(dismissTimer.current)
    setPhase('idle')
    setTranscript('')
    setAnswer('')
    setErrorMsg('')
  }, [])

  // Register module-level trigger
  useEffect(() => {
    _trigger = startListening
    return () => { _trigger = null }
  })

  function startListening() {
    const SR =
      (window as unknown as { SpeechRecognition?: typeof window.SpeechRecognition }).SpeechRecognition ??
      (window as unknown as { webkitSpeechRecognition?: typeof window.SpeechRecognition }).webkitSpeechRecognition

    if (!SR) {
      setPhase('error')
      setErrorMsg(lbl(
        'Гласовото разпознаване не е поддържано в тази версия на браузъра.',
        'Speech recognition is not supported in this browser version.',
      ))
      return
    }

    setPhase('listening')
    setTranscript('')
    setAnswer('')
    setErrorMsg('')

    const r = new SR()
    recogRef.current       = r
    r.lang                 = speechLang()
    r.interimResults       = false
    r.maxAlternatives      = 1
    r.continuous           = false

    r.onresult = (e: SpeechRecognitionEvent) => {
      const text = e.results[0]?.[0]?.transcript?.trim() ?? ''
      if (!text) return
      setTranscript(text)
      setPhase('processing')
      void askAI(text)
    }

    r.onerror = (e: SpeechRecognitionErrorEvent) => {
      if (e.error === 'no-speech') {
        setPhase('error')
        setErrorMsg(lbl('Не чух нищо. Опитай отново.', 'No speech detected. Try again.'))
      } else if (e.error === 'not-allowed') {
        setPhase('error')
        setErrorMsg(lbl('Достъпът до микрофона е отказан.', 'Microphone access denied.'))
      } else {
        setPhase('error')
        setErrorMsg(lbl(`Грешка: ${e.error}`, `Error: ${e.error}`))
      }
    }

    r.onend = () => {
      setPhase(p => p === 'listening' ? 'idle' : p)
    }

    r.start()
  }

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

      // Auto-dismiss after 14s (long enough to finish speaking)
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
        position:        'fixed',
        inset:           0,
        zIndex:          850,
        display:         'flex',
        flexDirection:   'column',
        alignItems:      'center',
        justifyContent:  'center',
        background:      'rgba(0,0,0,0.88)',
        backdropFilter:  isTeslaBrowser ? undefined : 'blur(12px)',
        WebkitBackdropFilter: isTeslaBrowser ? undefined : 'blur(12px)',
        padding:         '32px 24px',
        gap:             24,
        userSelect:      'none',
        WebkitUserSelect: 'none',
      }}
    >

      {/* ── LISTENING ───────────────────────────────────────────────── */}
      {phase === 'listening' && <>
        <MicPulse />
        <div style={{ fontSize: 20, color: 'rgba(255,255,255,0.75)', fontWeight: 600 }}>
          {lbl('Слушам...', 'Listening...')}
        </div>
        <button onClick={dismiss} style={cancelBtnStyle}>
          {lbl('Отказ', 'Cancel')}
        </button>
      </>}

      {/* ── PROCESSING ──────────────────────────────────────────────── */}
      {phase === 'processing' && <>
        <ThinkingDots />
        {transcript && (
          <div style={{ fontSize: 15, color: 'rgba(255,255,255,0.4)', fontStyle: 'italic',
            maxWidth: 360, textAlign: 'center', lineHeight: 1.5 }}>
            &ldquo;{transcript}&rdquo;
          </div>
        )}
        <div style={{ fontSize: 19, color: 'rgba(255,255,255,0.7)', fontWeight: 600 }}>
          {lbl('Мисля...', 'Thinking...')}
        </div>
      </>}

      {/* ── ANSWER ──────────────────────────────────────────────────── */}
      {phase === 'answer' && <>
        {/* Badge */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8,
          fontSize: 12, color: 'rgba(255,255,255,0.38)', letterSpacing: '0.08em' }}>
          <span style={{ fontSize: 17 }}>🤖</span>TesRadar AI
        </div>

        {/* Question */}
        {transcript && (
          <div style={{ fontSize: 14, color: 'rgba(255,255,255,0.32)', fontStyle: 'italic',
            maxWidth: 360, textAlign: 'center' }}>
            &ldquo;{transcript}&rdquo;
          </div>
        )}

        {/* Answer bubble */}
        <div style={{
          maxWidth: 420, padding: '20px 26px', borderRadius: 20,
          background: 'rgba(255,255,255,0.07)',
          border: '1px solid rgba(255,255,255,0.13)',
          fontSize: 20, fontWeight: 500, color: '#fff',
          lineHeight: 1.6, textAlign: 'center',
        }}>
          {answer}
        </div>

        {/* Dismiss hint */}
        <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.22)' }}>
          {lbl('Докоснете за затваряне', 'Tap to dismiss')}
        </div>
      </>}

      {/* ── ERROR ───────────────────────────────────────────────────── */}
      {phase === 'error' && <>
        <div style={{ fontSize: 42 }}>⚠️</div>
        <div style={{ fontSize: 17, color: 'rgba(255,255,255,0.75)',
          maxWidth: 340, textAlign: 'center', lineHeight: 1.55 }}>
          {errorMsg}
        </div>
        <button onClick={dismiss} style={cancelBtnStyle}>
          {lbl('Затвори', 'Close')}
        </button>
      </>}

    </div>
  )
}

// ── Shared button style ───────────────────────────────────────────────────
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

// ── Animations ────────────────────────────────────────────────────────────
function MicPulse() {
  return (
    <div style={{ position: 'relative', width: 88, height: 88 }}>
      <div style={{
        position: 'absolute', inset: -14, borderRadius: '50%',
        border: '2px solid rgba(227,25,55,0.35)',
        animation: 'va-pulse 1.5s ease-in-out infinite',
      }} />
      <div style={{
        width: 88, height: 88, borderRadius: '50%',
        background: 'rgba(227,25,55,0.18)',
        border: '2px solid #e31937',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        boxShadow: '0 0 36px rgba(227,25,55,0.3)',
      }}>
        <MicSvg color="#e31937" size={36} />
      </div>
      <style>{`@keyframes va-pulse{0%,100%{transform:scale(1);opacity:.55}50%{transform:scale(1.28);opacity:.15}}`}</style>
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

// ── Icons ─────────────────────────────────────────────────────────────────
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
