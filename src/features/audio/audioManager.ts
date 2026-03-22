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

  /** Short attention beep before speech. Freq in Hz, duration in ms. */
  beep(freq = 880, durationMs = 120): void {
    if (_state.muted || !_state.canUseAudio || !_ctx) return
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
    if (_state.unlocked) return

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
