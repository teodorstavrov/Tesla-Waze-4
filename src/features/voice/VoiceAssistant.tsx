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
import { settingsStore }       from '@/features/settings/settingsStore'
import { uiStore }             from '@/features/settings/uiStore'
import { savedPlacesStore }    from '@/features/places/savedPlacesStore'
import { filterStore }         from '@/features/ev/filterStore'
import { evStore }             from '@/features/ev/evStore'
import { roadworksStore }      from '@/features/roadworks/roadworksStore'
import { meetupStore }         from '@/features/meetups/meetupStore'
import { nextOccurrence }      from '@/features/meetups/recurrence'
import { followStore }         from '@/features/follow/followStore'
import { getMap }              from '@/components/MapShell'
import { useThemeStore }       from '@/features/theme/store'
import { teslaStore }          from '@/features/tesla/teslaStore'
import { teslaVehicleStore }   from '@/features/tesla/teslaVehicleStore'
import { VEHICLE_CONFIGS }     from '@/features/planning/vehicleConfig'
import { haversineMeters }     from '@/lib/geo'
import { getLang, langStore }  from '@/lib/locale'
import type { Lang }           from '@/lib/locale'
import type { CountryCode }    from '@/config/countries'
import { isTeslaBrowser }      from '@/lib/browser'
import { searchNominatim }     from '@/features/search/nominatim'
import {
  requestMicrophone,
  releaseMicrophone,
  getMicErrorType,
  getMicErrorMessage,
  isSpeechRecognitionSupported,
  getBestMimeType,
} from './micCapability'

// ── Web Speech API type declarations ──────────────────────────────────────
// SpeechRecognition and its event types are not universally defined in all
// TypeScript DOM lib versions. Declaring them here makes VoiceAssistant.tsx
// fully self-contained regardless of TypeScript version.

interface SpeechRecognitionResultItem {
  readonly transcript: string
  readonly confidence: number
}
interface SpeechRecognitionResult {
  readonly isFinal: boolean
  readonly length: number
  [index: number]: SpeechRecognitionResultItem
}
interface SpeechRecognitionResultList {
  readonly length: number
  [index: number]: SpeechRecognitionResult
}
type SpeechRecognitionEventType = Event & {
  readonly results: SpeechRecognitionResultList
  readonly resultIndex: number
}
type SpeechRecognitionErrorEventType = Event & {
  readonly error: string
}

// The SpeechRecognition interface — minimal shape we actually use.
interface SpeechRecognition extends EventTarget {
  lang:            string
  continuous:      boolean
  interimResults:  boolean
  maxAlternatives: number
  start():  void
  abort():  void
  stop():   void
  onresult: ((ev: SpeechRecognitionEventType) => void) | null
  onerror:  ((ev: SpeechRecognitionErrorEventType) => void) | null
  onend:    (() => void) | null
}

declare global {
  interface Window {
    // Vendor-prefixed Web Speech API constructors
    SpeechRecognition?: new () => SpeechRecognition
    webkitSpeechRecognition?: new () => SpeechRecognition
  }
}

// ── Daily AI usage limit ───────────────────────────────────────────────────
const AI_DAILY_KEY   = 'teslaradar:ai_daily'
const AI_DAILY_LIMIT = 20

function _getAiUsageToday(): number {
  try {
    const raw = localStorage.getItem(AI_DAILY_KEY)
    if (!raw) return 0
    const data = JSON.parse(raw) as { date: string; count: number }
    const today = new Date().toISOString().slice(0, 10)  // "2026-08-28"
    return data.date === today ? (data.count ?? 0) : 0
  } catch { return 0 }
}

function _incrementAiUsage(): void {
  try {
    const today = new Date().toISOString().slice(0, 10)
    const count = _getAiUsageToday() + 1
    localStorage.setItem(AI_DAILY_KEY, JSON.stringify({ date: today, count }))
  } catch { /* storage full — ignore */ }
}

// ── Module-level trigger ───────────────────────────────────────────────────
let _trigger: (() => void) | null = null
export function openVoiceAssistant(): void { _trigger?.() }

type Phase = 'idle' | 'listening' | 'recording' | 'processing' | 'answer' | 'error'

// ── Context builder ────────────────────────────────────────────────────────
function buildContext() {
  const gps      = gpsStore.getPosition()
  const profile  = vehicleProfileStore.get()
  const battery  = batteryStore.getState()
  const route    = routeStore.getState()
  const events   = eventStore.getState().events
  const country  = countryStore.getCode() ?? 'BG'
  const settings = settingsStore.get()
  const places   = savedPlacesStore.getAll()

  const modelCfg   = profile ? VEHICLE_CONFIGS.find(m => m.model === profile.model) : null
  const trimCfg    = modelCfg?.trims.find(t => t.id === profile?.trim) ?? null
  const themeState = useThemeStore.getState()
  const uiState    = uiStore.getState()

  const batteryPct =
    battery?.currentBatteryPercent != null ? Math.round(battery.currentBatteryPercent)
    : profile?.currentBatteryPercent != null ? Math.round(profile.currentBatteryPercent)
    : null

  let rangeKm: number | null = null
  if (battery && profile) {
    const effWhKm = trimCfg?.efficiencyWhKm ?? 170
    rangeKm = Math.round((battery.currentEnergyKwh * 1000) / effWhKm)
  }

  const vehicleName = profile
    ? `Tesla ${profile.model} ${trimCfg?.label ?? profile.trim} (${profile.year})`
    : null

  const routeActive = route.mode === 'navigating'
  let routeEtaTime: string | null = null
  if (routeActive && route.route && route.remainingM != null && route.route.distanceM > 0) {
    const remainDurS = (route.remainingM / route.route.distanceM) * route.route.durationS
    routeEtaTime = new Date(Date.now() + remainDurS * 1000)
      .toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  }

  const eventsNearby = gps
    ? events.filter(e => haversineMeters([gps.lat, gps.lng], [e.lat, e.lng]) < 20_000).length
    : 0

  // Battery source label (for AI context)
  const batterySourceLabel =
    battery?.source === 'tesla_live'  ? 'Tesla live data' :
    battery?.source === 'user_entered'? 'user entered'    :
    battery?.source === 'estimated'   ? 'estimated'       : null

  // Tesla connection & live vehicle data
  const teslaConn  = teslaStore.getState()
  const teslaSnap  = teslaVehicleStore.getSnapshot()
  const teslaConnected = teslaConn.connected
  const teslaVehicleName = teslaConn.vehicleName  // name from Tesla account (may differ from profile)
  let chargingState: string | null = null
  if (teslaSnap) {
    if (teslaSnap.sleeping)                                chargingState = 'sleeping'
    else if (teslaSnap.chargingState === 'Charging')       chargingState = 'charging'
    else if (teslaSnap.chargingState === 'Complete')       chargingState = 'charge complete'
    else if (teslaSnap.chargingState === 'Stopped')        chargingState = 'not charging'
    else if (teslaSnap.chargingState === 'Disconnected')   chargingState = 'charger disconnected'
  }

  return {
    lat:              gps?.lat ?? null,
    lng:              gps?.lng ?? null,
    speedKmh:         gps?.speedKmh ?? null,
    batteryPct,
    rangeKm,
    vehicleName,
    // ── Extended vehicle details ──────────────────────────────────────
    vehicleModel:     profile?.model ?? null,
    vehicleYear:      profile?.year ?? null,
    vehicleTrim:      trimCfg?.label ?? profile?.trim ?? null,
    efficiencyWhKm:   trimCfg?.efficiencyWhKm ?? null,
    batterySource:    batterySourceLabel,
    degradationPct:   profile?.degradationPercent ?? null,
    usableKwh:        battery?.usableKwhAfterDegradation != null
                        ? Math.round(battery.usableKwhAfterDegradation * 10) / 10
                        : null,
    currentKwh:       battery?.currentEnergyKwh != null
                        ? Math.round(battery.currentEnergyKwh * 10) / 10
                        : null,
    // ── Tesla connection & live data ──────────────────────────────────
    teslaConnected,
    teslaVehicleName,
    chargingState,                          // 'charging' | 'charge complete' | 'not charging' | 'charger disconnected' | 'sleeping' | null
    // ── App settings ──────────────────────────────────────────────────
    headingMode:      settings.headingMode,      // 'course-up' | 'north-up'
    showTraffic:      settings.showTraffic,
    performanceMode:  settings.performanceMode,
    // Map & theme
    mapMode:          themeState.mapMode,        // 'normal' | 'voyager' | 'satellite'
    appTheme:         themeState.theme,          // 'dark' | 'light'
    // UI toggles
    showClock:        uiState.showClock,
    showRightPanel:   uiState.showRightControls,
    settingsOpen:     uiState.settingsOpen,
    evStationsVisible: evStore.getState().markersVisible,
    evFiltersVisible:  filterStore.getState().filtersBarEnabled,
    showRoadworks:    roadworksStore.getState().visible,
    // ── Saved places ──────────────────────────────────────────────────
    homeName:         places.home?.name ?? null,
    workName:         places.work?.name ?? null,
    // ── Route ─────────────────────────────────────────────────────────
    routeActive,
    routeDestination: route.destination?.name ?? null,
    routeDistKm:      route.remainingM != null ? Math.round(route.remainingM / 1000) : null,
    routeEtaTime,
    eventsNearby,
    chargersNearby: gps
      ? evStore.getState().stations.filter(
          s => haversineMeters([gps.lat, gps.lng], [s.lat, s.lng]) < 10_000,
        ).length
      : 0,
    countryCode:      country,
    lang:             getLang(),
    // ── Community meetups (СЪБИТИЯ) ───────────────────────────────────
    meetups:          _buildMeetupsContext(),
  }
}

// ── Meetup context builder ─────────────────────────────────────────────────
// Returns a compact text summary of upcoming community meetups (СЪБИТИЯ)
// for the AI system prompt. Max 5 upcoming events, sorted soonest-first.
function _buildMeetupsContext(): string {
  try {
    const now  = new Date()
    const all  = meetupStore.getState().meetups
    if (!all.length) return 'No community events scheduled.'

    const upcoming = all
      .map(m => {
        const base = new Date(m.date)
        const next = nextOccurrence(base, m.recurrence, now)
        return { m, next }
      })
      .filter(({ next }) => next >= now)
      .sort((a, b) => a.next.getTime() - b.next.getTime())
      .slice(0, 5)

    if (!upcoming.length) return 'No upcoming community events.'

    const lang = getLang()
    return upcoming.map(({ m, next }) => {
      const dateStr = next.toLocaleString(
        lang === 'bg' ? 'bg-BG' : lang === 'no' ? 'nb-NO' : 'en-GB',
        { weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' },
      )
      const recur = m.recurrence && m.recurrence !== 'none' ? ` (recurring)` : ''
      const org   = m.organizer ? `, organizer: ${m.organizer}` : ''
      const phone = m.organizerPhone ? `, tel: ${m.organizerPhone}` : ''
      return `• "${m.title}" — ${dateStr}${recur}${org}${phone}`
    }).join('\n')
  } catch {
    return ''
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

  const recogRef     = useRef<SpeechRecognition | null>(null)
  const streamRef    = useRef<MediaStream | null>(null)
  const recorderRef  = useRef<MediaRecorder | null>(null)
  const chunksRef    = useRef<Blob[]>([])
  const timerRef     = useRef<ReturnType<typeof setInterval> | null>(null)
  const vadRef       = useRef<ReturnType<typeof setInterval> | null>(null)
  const audioCtxRef  = useRef<AudioContext | null>(null)
  const dismissTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const dismiss = useCallback(() => {
    stopSpeech()
    try { recogRef.current?.abort() } catch { /* ignore */ }
    try { recorderRef.current?.stop() } catch { /* ignore */ }
    releaseMicrophone(streamRef.current); streamRef.current = null
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null }
    if (vadRef.current)   { clearInterval(vadRef.current);   vadRef.current = null }
    if (audioCtxRef.current) { audioCtxRef.current.close().catch(() => {}); audioCtxRef.current = null }
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
    const SR = window.SpeechRecognition ?? window.webkitSpeechRecognition
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

    r.onresult = (e: SpeechRecognitionEventType) => {
      const text = e.results[0]?.[0]?.transcript?.trim() ?? ''
      if (!text) return
      setTranscript(text)
      setPhase('processing')
      void askAI(text)
    }

    r.onerror = (e: SpeechRecognitionErrorEventType) => {
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

      if (blob.size < 300) {
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

    // ── Voice Activity Detection (VAD) ───────────────────────────────────
    // Monitors audio level via AnalyserNode. Stops automatically after
    // SILENCE_MS of silence (only after MIN_RECORD_MS has passed),
    // so the user never needs to tap Stop.
    //
    // Tesla browser quirk: AudioContext may read all-zero frequency data
    // (microphone not connected to analyser yet), which looks like silence.
    // MIN_RECORD_MS guards against stopping before the user has a chance to speak.
    const SILENCE_THRESHOLD = 14   // 0-255 avg frequency; below = silence (lowered so speech easily beats it)
    const SILENCE_MS        = 2200 // ms of continuous silence before stopping (give pauses room)
    const MIN_RECORD_MS     = 3000 // don't stop before first 3 s (time for user to start speaking)

    const recordStart = Date.now()
    let silenceStart: number | null = null
    let speechDetectedEver = false   // once real speech is seen, use a tighter silence window

    try {
      type AC = typeof AudioContext
      const ACtx = (window.AudioContext ?? (window as unknown as Record<string,unknown>)['webkitAudioContext']) as AC
      const ctx = new ACtx()
      audioCtxRef.current = ctx
      if (ctx.state === 'suspended') await ctx.resume()

      const analyser = ctx.createAnalyser()
      analyser.fftSize = 512
      ctx.createMediaStreamSource(stream).connect(analyser)
      const freqData = new Uint8Array(analyser.frequencyBinCount)

      vadRef.current = setInterval(() => {
        analyser.getByteFrequencyData(freqData)
        let sum = 0
        for (let i = 0; i < freqData.length; i++) sum += freqData[i]
        const avg = sum / freqData.length
        const elapsed = Date.now() - recordStart

        if (avg >= SILENCE_THRESHOLD) {
          speechDetectedEver = true
          silenceStart = null  // speech detected — reset silence timer
        } else {
          if (silenceStart === null) silenceStart = Date.now()
          // Only auto-stop when:
          //   • we're past the minimum recording window, AND
          //   • silence has lasted long enough (shorter window after actual speech is heard)
          const silenceDuration = Date.now() - silenceStart
          const requiredSilence = speechDetectedEver ? SILENCE_MS : SILENCE_MS + 800
          if (elapsed > MIN_RECORD_MS && silenceDuration > requiredSilence) {
            if (vadRef.current) { clearInterval(vadRef.current); vadRef.current = null }
            stopRecording()
          }
        }
      }, 80)
    } catch (err) {
      // VAD unavailable — fall back to manual Stop button (already present)
      console.warn('[VAD] AudioContext unavailable, using manual stop:', err)
    }

    // Hard 20s ceiling regardless of VAD
    timerRef.current = setInterval(() => {
      setRecSeconds(s => {
        if (s >= 19) {
          stopRecording()
          return 20
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

    // Tesla browser has webkitSpeechRecognition but it always fails with a
    // "network" error because the car's network blocks Google's STT servers.
    // Skip the SR attempt entirely and go straight to MediaRecorder → Groq Whisper.
    if (isTeslaBrowser) {
      void startWithMediaRecorder()
      return
    }

    if (isSpeechRecognitionSupported()) {
      startWithSpeechRecognition()
    } else {
      void startWithMediaRecorder()
    }
  }

  // ── AI call ──────────────────────────────────────────────────────────────
  async function askAI(question: string) {
    // ── Daily limit check ───────────────────────────────────────────────────
    const usedToday = _getAiUsageToday()
    if (usedToday >= AI_DAILY_LIMIT) {
      const remaining = lbl(
        `Достигна дневния лимит от ${AI_DAILY_LIMIT} гласови въпроса. Пробвай утре. 🔒`,
        `Daily limit of ${AI_DAILY_LIMIT} voice questions reached. Try again tomorrow. 🔒`,
      )
      setAnswer(remaining)
      setPhase('answer')
      speak(remaining)
      if (dismissTimer.current) clearTimeout(dismissTimer.current)
      dismissTimer.current = setTimeout(dismiss, 12_000)
      return
    }

    const ctrl = new AbortController()
    const t = setTimeout(() => ctrl.abort(), 25_000)  // 25s timeout

    try {
      let ctx: ReturnType<typeof buildContext>
      try { ctx = buildContext() } catch (e) {
        console.error('[askAI] buildContext threw:', e)
        ctx = { lat: null, lng: null, speedKmh: null, batteryPct: null, rangeKm: null,
          vehicleName: null, vehicleModel: null, vehicleYear: null, vehicleTrim: null,
          efficiencyWhKm: null, batterySource: null, degradationPct: null, usableKwh: null,
          currentKwh: null, teslaConnected: false, teslaVehicleName: null, chargingState: null,
          headingMode: 'course-up', showTraffic: false, performanceMode: 'auto',
          mapMode: 'voyager', appTheme: 'dark',
          showClock: true, showRightPanel: true, settingsOpen: false,
          evStationsVisible: true, evFiltersVisible: true, showRoadworks: false,
          homeName: null, workName: null,
          routeActive: false, routeDestination: null, routeDistKm: null,
          routeEtaTime: null, eventsNearby: 0, chargersNearby: 0,
          countryCode: 'BG', lang: 'bg', meetups: '' }
      }

      const res = await fetch('/api/ai-ask', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ question, context: ctx }),
        signal:  ctrl.signal,
      })
      clearTimeout(t)

      let data: {
        answer?:  string
        error?:   string
        intent?:  { type: string; destination: string; viaHemus: boolean; action: string; value?: string }
      }
      try { data = await res.json() as typeof data }
      catch { data = { error: `HTTP ${res.status} (non-JSON)` } }

      if (!res.ok || data.error) {
        setPhase('error')
        setErrorMsg(data.error ?? lbl(`AI грешка ${res.status}`, `AI error ${res.status}`))
        return
      }

      // Successful AI response — count it toward the daily limit
      _incrementAiUsage()

      const ans = data.answer ?? ''
      setAnswer(ans)
      setPhase('answer')
      speak(ans)

      // ── Navigation intent ─────────────────────────────────────────────────
      if (data.intent?.type === 'navigate' && data.intent.destination) {
        void handleNavigateIntent(data.intent.destination, data.intent.viaHemus === true)

      // ── Action intent (toggle settings, zoom, center, lang, country…) ────
      } else if (data.intent?.type === 'action' && data.intent.action) {
        handleActionIntent(data.intent.action, data.intent.value)
        // Actions are instant — dismiss overlay quickly so user sees the result
        if (dismissTimer.current) clearTimeout(dismissTimer.current)
        dismissTimer.current = setTimeout(dismiss, 3_500)

      } else {
        if (dismissTimer.current) clearTimeout(dismissTimer.current)
        dismissTimer.current = setTimeout(dismiss, 14_000)
      }

    } catch (err) {
      clearTimeout(t)
      const msg = err instanceof Error ? `${err.name}: ${err.message}` : String(err)
      console.error('[askAI] fetch threw:', msg)
      setPhase('error')
      setErrorMsg(lbl(`AI: ${msg}`, `AI: ${msg}`))
    }
  }

  // ── Handle action intent from AI (toggle settings, zoom, etc.) ─────────
  function handleActionIntent(action: string, value?: string) {
    const theme = useThemeStore.getState()

    switch (action) {
      // ── Traffic ──
      case 'toggle_traffic':
        settingsStore.toggleTraffic()
        break

      // ── Roadworks / road closures ──
      case 'toggle_roadworks':
        roadworksStore.toggle()
        break

      // ── Satellite / map mode ──
      case 'toggle_satellite':
        theme.toggleSatellite()
        break
      case 'map_mode_satellite':
        useThemeStore.setState({ mapMode: 'satellite' })
        break
      case 'map_mode_voyager':
        useThemeStore.setState({ mapMode: 'voyager' })
        break
      case 'map_mode_normal':
        useThemeStore.setState({ mapMode: 'normal' })
        break

      // ── Night / theme ──
      case 'toggle_night':
        theme.toggleNight()
        break
      case 'toggle_dark_mode':
        theme.toggleTheme()
        break

      // ── Clock ──
      case 'toggle_clock':
        uiStore.toggleClock()
        break

      // ── Right controls panel ──
      case 'toggle_right_panel':
        uiStore.toggleRightControls()
        break

      // ── Settings panel ──
      case 'open_settings':
        uiStore.openSettings()
        break
      case 'close_settings':
        uiStore.closeSettings()
        break

      // ── EV station markers on map ──
      case 'toggle_ev_stations':
        evStore.toggleMarkersVisible()
        break

      // ── EV filter bar (filter chips UI) ──
      case 'toggle_ev_filters':
        filterStore.toggleFiltersBarEnabled()
        break

      // ── Map heading / rotation ──
      case 'heading_course_up':
        settingsStore.setHeadingMode('course-up')
        break
      case 'heading_north_up':
        settingsStore.setHeadingMode('north-up')
        break

      // ── Zoom ──
      case 'zoom_in':
        getMap()?.zoomIn(1)
        break
      case 'zoom_out':
        getMap()?.zoomOut(1)
        break

      // ── Center on GPS ──
      case 'center': {
        const map = getMap()
        const pos = gpsStore.getPosition()
        if (map && pos) {
          followStore.beginProgrammaticMove()
          map.once('moveend', () => followStore.endProgrammaticMove())
          map.setView([pos.lat, pos.lng], 15, { animate: !isTeslaBrowser, duration: 0.4 })
        }
        followStore.setFollowing(true)
        break
      }

      // ── Cancel active navigation ──
      case 'cancel_route':
        routeStore.clear()
        break

      // ── Performance mode ──
      case 'performance_auto':
        settingsStore.setPerformanceMode('auto')
        break
      case 'performance_quality':
        settingsStore.setPerformanceMode('normal')
        break
      case 'performance_performance':
        settingsStore.setPerformanceMode('tesla_amd_lite')
        break

      // ── Community meetups list (СЪБИТИЯ) ──
      case 'open_meetups':
        meetupStore.openList()
        break
      case 'close_meetups':
        meetupStore.closeList()
        break

      // ── Language change ──
      case 'set_lang':
        if (value) langStore.setLang(value as Lang)
        break

      // ── Country change ──
      case 'set_country':
        if (value) countryStore.setCountry(value as CountryCode)
        break

      default:
        console.warn('[VoiceAction] Unknown action:', action)
    }
  }

  // ── Handle navigation intent from AI ────────────────────────────────────
  async function handleNavigateIntent(destination: string, viaHemus: boolean) {
    const lower = destination.toLowerCase().trim()

    // ── Special: saved home / work places ────────────────────────────────
    const isHome = lower === 'home' || lower === 'вкъщи' || lower === 'у дома' || lower === 'домашен адрес'
    const isWork = lower === 'work' || lower === 'работа' || lower === 'на работа' || lower === 'офис'

    if (isHome || isWork) {
      const placeType = isHome ? 'home' : 'work'
      const place = savedPlacesStore.get(placeType)
      if (place) {
        console.log(`[VoiceNav] Navigating to saved ${placeType}: "${place.name}" (${place.lat}, ${place.lng})`)
        const currentViaHemus = routeStore.getState().viaHemus
        if (viaHemus !== currentViaHemus) await routeStore.toggleViaHemus()
        await routeStore.navigateTo({ lat: place.lat, lng: place.lng, name: place.name })
        if (dismissTimer.current) clearTimeout(dismissTimer.current)
        dismissTimer.current = setTimeout(dismiss, 3_000)
        return
      }
      // Saved place not configured — inform user
      const noPlaceMsg = isHome
        ? lbl('Нямаш запазен домашен адрес. Добави го от Настройки → Записани места.', 'No home address saved. Add it in Settings → Saved Places.')
        : lbl('Нямаш запазен работен адрес. Добави го от Настройки → Записани места.', 'No work address saved. Add it in Settings → Saved Places.')
      setAnswer(noPlaceMsg)
      speak(noPlaceMsg)
      if (dismissTimer.current) clearTimeout(dismissTimer.current)
      dismissTimer.current = setTimeout(dismiss, 10_000)
      return
    }

    // ── Nearest EV charger ───────────────────────────────────────────────
    if (lower === '__nearest_charger__'
      || lower.includes('nearest charger') || lower.includes('nearest station')
      || lower.includes('nearest charging')) {
      const pos      = gpsStore.getPosition()
      const stations = evStore.getState().stations
      if (!pos || stations.length === 0) {
        const msg = lbl(
          'Няма данни за зарядни станции или GPS.',
          'No charger data or GPS available.',
        )
        setAnswer(msg); speak(msg)
        if (dismissTimer.current) clearTimeout(dismissTimer.current)
        dismissTimer.current = setTimeout(dismiss, 8_000)
        return
      }
      // Find nearest by haversine
      let nearest = stations[0]!
      let nearestDist = haversineMeters([pos.lat, pos.lng], [nearest.lat, nearest.lng])
      for (const s of stations) {
        const d = haversineMeters([pos.lat, pos.lng], [s.lat, s.lng])
        if (d < nearestDist) { nearest = s; nearestDist = d }
      }
      const name = nearest.name ?? lbl('Зарядна станция', 'Charging station')
      console.log(`[VoiceNav] Nearest charger: "${name}" ${Math.round(nearestDist)}m away`)
      const currentViaHemus = routeStore.getState().viaHemus
      if (viaHemus !== currentViaHemus) await routeStore.toggleViaHemus()
      await routeStore.navigateTo({ lat: nearest.lat, lng: nearest.lng, name })
      if (dismissTimer.current) clearTimeout(dismissTimer.current)
      dismissTimer.current = setTimeout(dismiss, 3_000)
      return
    }

    // ── Community meetup: by sentinel or title match ─────────────────────
    const isNextMeetup = lower === '__next_meetup__'
      || lower.includes('следващото събитие') || lower.includes('next event')
      || lower.includes('next meetup')        || lower.includes('следващата среща')
      || lower.includes('следващото')         || lower.includes('nearest event')

    const allMeetups = meetupStore.getState().meetups
    let targetMeetup = null

    if (isNextMeetup) {
      // Find the soonest upcoming meetup
      const now = new Date()
      const upcoming = allMeetups
        .map(m => ({ m, next: nextOccurrence(new Date(m.date), m.recurrence, now) }))
        .filter(({ next }) => next >= now)
        .sort((a, b) => a.next.getTime() - b.next.getTime())
      targetMeetup = upcoming[0]?.m ?? null
    } else {
      // Try to match a meetup by title (case-insensitive, partial)
      const dl = destination.toLowerCase()
      targetMeetup = allMeetups.find(m =>
        m.title.toLowerCase() === dl ||
        m.title.toLowerCase().includes(dl) ||
        dl.includes(m.title.toLowerCase()),
      ) ?? null
    }

    if (targetMeetup) {
      console.log(`[VoiceNav] Navigating to meetup: "${targetMeetup.title}" (${targetMeetup.lat}, ${targetMeetup.lng})`)
      const currentViaHemus = routeStore.getState().viaHemus
      if (viaHemus !== currentViaHemus) await routeStore.toggleViaHemus()
      await routeStore.navigateTo({ lat: targetMeetup.lat, lng: targetMeetup.lng, name: targetMeetup.title })
      if (dismissTimer.current) clearTimeout(dismissTimer.current)
      dismissTimer.current = setTimeout(dismiss, 3_000)
      return
    }

    // ── Named destination: geocode via Nominatim ──────────────────────────
    let results: Awaited<ReturnType<typeof searchNominatim>>
    try {
      results = await searchNominatim(destination)
    } catch (err) {
      console.error('[VoiceNav] Nominatim failed:', err)
      if (dismissTimer.current) clearTimeout(dismissTimer.current)
      dismissTimer.current = setTimeout(dismiss, 14_000)
      return
    }

    const first = results[0]
    if (!first) {
      console.warn('[VoiceNav] No results for:', destination)
      const notFoundMsg = lbl(
        `Не намерих "${destination}" на картата.`,
        `Could not find "${destination}" on the map.`,
      )
      setAnswer(notFoundMsg)
      speak(notFoundMsg)
      if (dismissTimer.current) clearTimeout(dismissTimer.current)
      dismissTimer.current = setTimeout(dismiss, 10_000)
      return
    }

    console.log(`[VoiceNav] Navigating to "${first.displayName}" (${first.lat}, ${first.lng}) viaHemus=${viaHemus}`)

    const currentViaHemus = routeStore.getState().viaHemus
    if (viaHemus !== currentViaHemus) {
      await routeStore.toggleViaHemus()
    }

    await routeStore.navigateTo({ lat: first.lat, lng: first.lng, name: first.shortName })

    if (dismissTimer.current) clearTimeout(dismissTimer.current)
    dismissTimer.current = setTimeout(dismiss, 3_000)
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
        padding:             '24px 20px',
        gap:                 16,
        userSelect:          'none',
        WebkitUserSelect:    'none',
        overflow:            'hidden',
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
          {lbl('Говори — спира автоматично', 'Speak — stops automatically')}
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
          flexShrink: 0,
        }}>
          <span style={{ fontSize: 17 }}>🤖</span>TesRadar AI
        </div>
        {transcript && (
          <div style={{
            fontSize: 13, color: 'rgba(255,255,255,0.38)', fontStyle: 'italic',
            maxWidth: 460, textAlign: 'center', lineHeight: 1.45,
            flexShrink: 0,
          }}>
            &ldquo;{transcript}&rdquo;
          </div>
        )}
        <div style={{
          width: '100%', maxWidth: 460,
          padding: '18px 22px', borderRadius: 20,
          background: 'rgba(255,255,255,0.07)',
          border: '1px solid rgba(255,255,255,0.13)',
          // Adaptive font — shorter text = larger, longer = smaller so it always fits
          fontSize: answer.length > 160 ? 15 : answer.length > 90 ? 17 : 20,
          fontWeight: 500, color: '#fff',
          lineHeight: 1.55, textAlign: 'center',
          // Constrain height so it never overflows the screen
          maxHeight: '52vh',
          overflowY: 'auto',
          WebkitOverflowScrolling: 'touch',
          flexShrink: 1,
        }}>
          {answer}
        </div>
        <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.22)', flexShrink: 0 }}>
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
