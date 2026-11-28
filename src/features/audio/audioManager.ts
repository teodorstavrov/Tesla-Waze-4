// ─── Audio Manager ────────────────────────────────────────────────────
//
// TESLA BROWSER AUDIO RULES
// ─────────────────────────────────────────────────────────────────────
// The Tesla browser blocks AudioContext and speechSynthesis until after
// a real user gesture. tryUnlock() is called on the first tap anywhere.
//
// Phase 9 additions: speak(), beep(), mute/unmute.

import { logger } from '@/lib/logger'

export interface AudioState {
  unlocked:    boolean
  canUseAudio: boolean
  canUseSpeech: boolean
  muted:       boolean
}

let _state: AudioState = { unlocked: false, canUseAudio: false, canUseSpeech: false, muted: false }
let _ctx: AudioContext | null = null

type Listener = (s: AudioState) => void
const _listeners = new Set<Listener>()

function _emit(): void { _listeners.forEach((fn) => fn(_state)) }

export const audioManager = {
  getState: (): AudioState => _state,
  getContext: (): AudioContext | null => _ctx,

  subscribe(fn: Listener): () => void {
    _listeners.add(fn)
    return () => { _listeners.delete(fn) }
  },

  toggleMute(): void {
    _state = { ..._state, muted: !_state.muted }
    if (_state.muted) window.speechSynthesis?.cancel()
    logger.audio.debug('Mute toggled', { muted: _state.muted })
    _emit()
  },

  /** Soft UI feedback pop — panel opens, toast appears. */
  uiBeep(): void {
    if (_state.muted || !_state.canUseAudio || !_ctx) return
    if (_ctx.state === 'suspended') {
      void _ctx.resume().then(() => { if (_ctx?.state === 'running') audioManager.uiBeep() })
      return
    }
    try {
      const osc  = _ctx.createOscillator()
      const gain = _ctx.createGain()
      osc.connect(gain)
      gain.connect(_ctx.destination)
      osc.frequency.value = 620
      osc.type = 'sine'
      gain.gain.setValueAtTime(0.08, _ctx.currentTime)
      gain.gain.exponentialRampToValueAtTime(0.001, _ctx.currentTime + 0.07)
      osc.start(_ctx.currentTime)
      osc.stop(_ctx.currentTime + 0.07)
    } catch (err) {
      logger.audio.warn('uiBeep failed', err)
    }
  },

  /** Two ascending tones — marker placed / action confirmed. */
  confirmBeep(): void {
    if (_state.muted || !_state.canUseAudio || !_ctx) return
    if (_ctx.state === 'suspended') {
      void _ctx.resume().then(() => { if (_ctx?.state === 'running') audioManager.confirmBeep() })
      return
    }
    try {
      const t = _ctx.currentTime
      for (const [freq, offset] of [[680, 0], [960, 0.1]] as [number, number][]) {
        const osc  = _ctx.createOscillator()
        const gain = _ctx.createGain()
        osc.connect(gain)
        gain.connect(_ctx.destination)
        osc.frequency.value = freq
        osc.type = 'sine'
        gain.gain.setValueAtTime(0.13, t + offset)
        gain.gain.exponentialRampToValueAtTime(0.001, t + offset + 0.1)
        osc.start(t + offset)
        osc.stop(t + offset + 0.1)
      }
    } catch (err) {
      logger.audio.warn('confirmBeep failed', err)
    }
  },

  /** Police siren — triangle sweep 600↔1200 Hz, soft fade-in then sustain then fade-out.
   *  Starts quiet (0.001) and builds to full volume over buildS seconds so it
   *  doesn't startle the driver, then fades out in the last 0.3 s. */
  policeChime(totalS = 3.0, buildS = 0.9): void {
    if (_state.muted || !_state.canUseAudio || !_ctx) return
    if (_ctx.state === 'suspended') {
      void _ctx.resume().then(() => { if (_ctx?.state === 'running') audioManager.policeChime(totalS, buildS) })
      return
    }
    try {
      const t    = _ctx.currentTime
      const osc  = _ctx.createOscillator()
      const gain = _ctx.createGain()
      osc.connect(gain)
      gain.connect(_ctx.destination)
      osc.type = 'triangle'
      // Envelope: fade in → sustain → fade out
      gain.gain.setValueAtTime(0.001, t)
      gain.gain.linearRampToValueAtTime(0.38, t + buildS)
      gain.gain.setValueAtTime(0.38, t + totalS - 0.3)
      gain.gain.linearRampToValueAtTime(0.001, t + totalS)
      // Frequency sweep 600↔1200 Hz every 0.5 s
      const steps = Math.ceil(totalS / 0.5)
      for (let i = 0; i < steps; i++) {
        const fromHz = i % 2 === 0 ? 600 : 1200
        const toHz   = i % 2 === 0 ? 1200 : 600
        osc.frequency.setValueAtTime(fromHz, t + i * 0.5)
        osc.frequency.linearRampToValueAtTime(toHz, t + (i + 1) * 0.5)
      }
      osc.start(t)
      osc.stop(t + totalS)
    } catch (err) {
      logger.audio.warn('policeChime failed', err)
    }
  },

  /** @deprecated alias */
  siren(_durationS = 3): void { audioManager.policeChime() },

  /** Radar-detector style alert — 3 short ascending tones (~350 ms total).
   *  Alternative to policeChime for drivers who prefer a discrete beep
   *  over a continuous siren sweep. */
  radarBeep(): void {
    if (_state.muted || !_state.canUseAudio || !_ctx) return
    if (_ctx.state === 'suspended') {
      void _ctx.resume().then(() => { if (_ctx?.state === 'running') audioManager.radarBeep() })
      return
    }
    try {
      const t      = _ctx.currentTime
      const tones: [number, number][] = [[880, 0], [1100, 0.13], [1320, 0.26]]
      for (const [freq, offset] of tones) {
        const osc  = _ctx.createOscillator()
        const gain = _ctx.createGain()
        osc.connect(gain)
        gain.connect(_ctx.destination)
        osc.frequency.value = freq
        osc.type = 'sine'
        gain.gain.setValueAtTime(0.001,  t + offset)
        gain.gain.linearRampToValueAtTime(0.30, t + offset + 0.018)
        gain.gain.exponentialRampToValueAtTime(0.001, t + offset + 0.095)
        osc.start(t + offset)
        osc.stop(t + offset + 0.095)
      }
    } catch (err) {
      logger.audio.warn('radarBeep failed', err)
    }
  },

  /** Short attention beep before speech. Freq in Hz, duration in ms. */
  beep(freq = 880, durationMs = 120): void {
    if (_state.muted || !_state.canUseAudio || !_ctx) return
    if (_ctx.state === 'suspended') {
      void _ctx.resume().then(() => { if (_ctx?.state === 'running') audioManager.beep(freq, durationMs) })
      return
    }
    try {
      const osc  = _ctx.createOscillator()
      const gain = _ctx.createGain()
      osc.connect(gain)
      gain.connect(_ctx.destination)
      osc.frequency.value = freq
      osc.type = 'sine'
      gain.gain.setValueAtTime(0.18, _ctx.currentTime)
      gain.gain.exponentialRampToValueAtTime(0.001, _ctx.currentTime + durationMs / 1000)
      osc.start(_ctx.currentTime)
      osc.stop(_ctx.currentTime + durationMs / 1000)
    } catch (err) {
      logger.audio.warn('beep failed', err)
    }
  },

  /** Speak text via SpeechSynthesis. Queues behind any current utterance. */
  speak(text: string, lang = 'bg-BG'): void {
    if (_state.muted || !_state.canUseSpeech) return
    try {
      // Cancel anything already queued — new alert is more relevant
      window.speechSynthesis.cancel()
      const u = new SpeechSynthesisUtterance(text)
      u.lang   = lang
      u.rate   = 1.05
      u.volume = 1
      window.speechSynthesis.speak(u)
    } catch (err) {
      logger.audio.warn('speak failed', err)
    }
  },

  async tryUnlock(): Promise<void> {
    // Allow re-unlock when context was auto-suspended by Chrome (inactivity / page hidden)
    if (_state.unlocked && _ctx?.state !== 'suspended') return

    let canAudio  = false
    let canSpeech = false

    // ── Web Audio API ────────────────────────────────────────────
    try {
      if (!_ctx) {
        type WinWithWebkit = typeof window & { webkitAudioContext?: typeof AudioContext }
        const Ctor = window.AudioContext ?? (window as WinWithWebkit).webkitAudioContext
        if (Ctor) _ctx = new Ctor()
      }
      if (_ctx?.state === 'suspended') await _ctx.resume()
      canAudio = _ctx?.state === 'running' ? true : false
    } catch (err) {
      logger.audio.warn('AudioContext unlock failed', err)
    }

    // ── Speech Synthesis ─────────────────────────────────────────
    try {
      canSpeech = typeof window.speechSynthesis !== 'undefined'
      if (canSpeech) {
        const u = new SpeechSynthesisUtterance('')
        u.volume = 0
        window.speechSynthesis.speak(u)
      }
    } catch (err) {
      logger.audio.warn('SpeechSynthesis init failed', err)
    }

    _state = { ..._state, unlocked: canAudio || canSpeech, canUseAudio: canAudio, canUseSpeech: canSpeech }
    logger.audio.info('Unlock result', _state)
    _emit()
  },
}
