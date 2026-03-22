// ─── Audio Manager ────────────────────────────────────────────────────
//
// TESLA BROWSER AUDIO RULES
// ─────────────────────────────────────────────────────────────────────
// The Tesla browser (Chromium-based) blocks AudioContext and
// speechSynthesis until after a real user gesture. Attempting to create
// or resume an AudioContext on page load throws a DOMException and
// produces noisy console errors.
//
// Strategy:
//   1. Do NOT create AudioContext on mount.
//   2. On the first user gesture (tap/click anywhere on the app), call
//      audioManager.tryUnlock() — this is safe to call multiple times.
//   3. Store the unlock state so future phases can gate sounds on it.
//   4. Expose a pub/sub API so React components can react to unlock state
//      changes without polling.
//
// Future phases will add: UI beeps, speech synthesis, proximity alerts,
// and the police siren. They all gate on audioManager.getState().unlocked.
// ─────────────────────────────────────────────────────────────────────

import { logger } from '@/lib/logger'

export interface AudioState {
  unlocked: boolean
  canUseAudio: boolean
  canUseSpeech: boolean
}

let _state: AudioState = { unlocked: false, canUseAudio: false, canUseSpeech: false }
let _ctx: AudioContext | null = null

type Listener = (s: AudioState) => void
const _listeners = new Set<Listener>()

function _emit(): void {
  _listeners.forEach((fn) => fn(_state))
}

export const audioManager = {
  getState: (): AudioState => _state,

  getContext: (): AudioContext | null => _ctx,

  subscribe(fn: Listener): () => void {
    _listeners.add(fn)
    return () => { _listeners.delete(fn) }
  },

  async tryUnlock(): Promise<void> {
    if (_state.unlocked) return

    let canAudio = false
    let canSpeech = false

    // ── Web Audio API ────────────────────────────────────────────
    try {
      if (!_ctx) {
        // webkit prefix for older Chromium (Tesla browser compatibility)
        type WinWithWebkit = typeof window & { webkitAudioContext?: typeof AudioContext }
        const Ctor = window.AudioContext ?? (window as WinWithWebkit).webkitAudioContext
        if (Ctor) _ctx = new Ctor()
      }
      if (_ctx?.state === 'suspended') {
        await _ctx.resume()
      }
      canAudio = _ctx?.state === 'running' ? true : false
    } catch (err) {
      logger.audio.warn('AudioContext unlock failed', err)
    }

    // ── Speech Synthesis ─────────────────────────────────────────
    try {
      canSpeech = typeof window.speechSynthesis !== 'undefined'
      if (canSpeech) {
        // Prime the synthesis engine with a zero-volume utterance.
        // Some browsers (including Tesla) require this before the first
        // real utterance will play reliably.
        const u = new SpeechSynthesisUtterance('')
        u.volume = 0
        window.speechSynthesis.speak(u)
      }
    } catch (err) {
      logger.audio.warn('SpeechSynthesis init failed', err)
    }

    _state = {
      unlocked: canAudio || canSpeech,
      canUseAudio: canAudio,
      canUseSpeech: canSpeech,
    }

    logger.audio.info('Unlock result', _state)
    _emit()
  },
}
