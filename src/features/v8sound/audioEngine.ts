// ─── Hybrid Audio Engine ──────────────────────────────────────────────────
//
// Two-layer architecture per engine:
//   1. Real-audio layer  — pre-recorded MP3 looped at low volume, playbackRate
//      tracks RPM so pitch shifts with speed (provides authentic engine character)
//   2. Synth layer       — sawtooth oscillators tuned per engine, clearly track
//      RPM via frequency (provides unambiguous dynamic speed response)
//
// Together: the character of the real engine + the clear dynamism of synthesis.
// The synth starts instantly; the real audio joins after the async MP3 decode.
//
// Signal chains:
//   Real audio:  [BufferSource] → [audioGain] ─┐
//                                               ├→ [masterGain] → out
//   Synth osc1: [osc1] → [g1] ─┐               │
//   Synth osc2: [osc2] → [g2] ─┤→ [WS] → [BPF] → [LPF] → [synthGain] ─┘
//   Synth LFO:  [lfo]  → [lfoGain] → masterGain.gain    (AM thump)
//   Synth LFO2: [lfo2] → [lfo2Gain]→ masterGain.gain    (cam irregularity)

import { gpsStore } from '@/features/gps/gpsStore'

// ── Shared types ──────────────────────────────────────────────────────────

interface GearBand {
  maxKmh: number
  minRpm: number
  maxRpm: number
}

function speedToRpm(kmh: number, gears: ReadonlyArray<GearBand>): number {
  const speed = Math.max(0, kmh)
  let idx = gears.findIndex((g) => speed <= g.maxKmh)
  if (idx < 0) idx = gears.length - 1
  const g       = gears[idx]
  const prevMax = idx === 0 ? 0 : gears[idx - 1].maxKmh
  const span    = g.maxKmh - prevMax
  const t       = span === 0 ? 0 : (speed - prevMax) / span
  return g.minRpm + t * (g.maxRpm - g.minRpm)
}

function rpmToHz(rpm: number): number { return (rpm / 60) * 4 }

function makeClipCurve(amount: number): Float32Array {
  const n = 512; const curve = new Float32Array(n)
  for (let i = 0; i < n; i++) {
    const x = (i * 2) / n - 1
    curve[i] = ((Math.PI + amount) * x) / (Math.PI + amount * Math.abs(x))
  }
  return curve
}

// ── Config ────────────────────────────────────────────────────────────────

interface HybridConfig {
  // — Real audio layer —
  url:          string
  audioVol:     number                    // mix level (0.1–0.4): texture only
  audioBaseRpm: number                    // RPM where playbackRate=1.0
  audioGears:   ReadonlyArray<GearBand>

  // — Synth layer —
  synthGears:   ReadonlyArray<GearBand>
  distAmount:   number
  osc1Vol:      number
  osc2Ratio:    number
  osc2Vol:      number
  lfoDepth:     number
  lfo2Ratio:    number | null
  lfo2Depth:    number
  bpfQ:         number
  bpfMult:      number
  lpfFreq:      number
  synthVol:     number                    // synth mix level — primary dynamic layer
}

// ── Open Header V8 ────────────────────────────────────────────────────────
// Raw open-pipe exhaust — aggressive, high harmonic content, heavy thump.
// Synth tuned to match: very resonant BPF, high distortion, partial-octave osc2.
const HEADER_GEARS: ReadonlyArray<GearBand> = [
  { maxKmh:   5, minRpm:  700, maxRpm:  700 },
  { maxKmh:  40, minRpm:  750, maxRpm: 4000 },
  { maxKmh:  70, minRpm: 1100, maxRpm: 3800 },
  { maxKmh: 100, minRpm: 1100, maxRpm: 3800 },
  { maxKmh: 135, minRpm: 1100, maxRpm: 4000 },
  { maxKmh: 170, minRpm: 1400, maxRpm: 4500 },
  { maxKmh: 999, minRpm: 1700, maxRpm: 5500 },
]

const HEADER_CONFIG: HybridConfig = {
  url:          '/engine-sounds/open-header-v8.mp3',
  audioVol:     0.30,
  audioBaseRpm: 1200,
  audioGears:   HEADER_GEARS,

  synthGears:  HEADER_GEARS,
  distAmount:  190,
  osc1Vol:     0.60,
  osc2Ratio:   1.80,       // partial octave → raw harmonic bark
  osc2Vol:     0.40,
  lfoDepth:    0.17,       // heavy exhaust thump
  lfo2Ratio:   0.875,      // lumpy cam irregularity
  lfo2Depth:   0.07,
  bpfQ:        2.0,        // very resonant — open pipe ring
  bpfMult:     1.5,        // lower center = more bass mass
  lpfFreq:     700,
  synthVol:    0.32,
}

// ── S63 AMG V8 Biturbo ────────────────────────────────────────────────────
// Twin-turbo 4.0L — refined aggression, smoother character, higher-revving.
// Synth: tighter detune, less distortion, higher BPF center (premium AMG tone).
const S63_GEARS: ReadonlyArray<GearBand> = [
  { maxKmh:   5, minRpm:  750, maxRpm:  750 },
  { maxKmh:  35, minRpm:  900, maxRpm: 5000 },
  { maxKmh:  60, minRpm: 1400, maxRpm: 4500 },
  { maxKmh:  90, minRpm: 1400, maxRpm: 4500 },
  { maxKmh: 120, minRpm: 1400, maxRpm: 4500 },
  { maxKmh: 155, minRpm: 1700, maxRpm: 5000 },
  { maxKmh: 999, minRpm: 2000, maxRpm: 6500 },
]

const S63_CONFIG: HybridConfig = {
  url:          '/engine-sounds/s63-amg-v8.mp3',
  audioVol:     0.28,
  audioBaseRpm: 2200,      // AMG record sounds most natural at higher cruise RPM
  audioGears:   S63_GEARS,

  synthGears:  S63_GEARS,
  distAmount:  125,        // smoother clip — twin-turbo softens raw harmonics
  osc1Vol:     0.62,
  osc2Ratio:   1.02,       // very tight detune → smooth AMG width, no roughness
  osc2Vol:     0.38,
  lfoDepth:    0.12,       // moderate thump (not as heavy as raw V8)
  lfo2Ratio:   null,       // no secondary LFO — AMG idles smoothly
  lfo2Depth:   0,
  bpfQ:        1.4,
  bpfMult:     2.3,        // higher center = more refined mid character
  lpfFreq:     950,        // let a bit more high-end through (turbo whine)
  synthVol:    0.30,
}

// ── Hybrid engine class ───────────────────────────────────────────────────

class HybridAudioEngine {
  private ctx:        AudioContext | null          = null
  // Real audio
  private audioSrc:   AudioBufferSourceNode | null = null
  private audioGain:  GainNode | null              = null
  // Synth
  private osc1:       OscillatorNode | null        = null
  private osc2:       OscillatorNode | null        = null
  private lfo:        OscillatorNode | null        = null
  private lfo2:       OscillatorNode | null        = null
  private synthBpf:   BiquadFilterNode | null      = null
  private synthGain:  GainNode | null              = null
  // Shared
  private masterGain: GainNode | null              = null
  private _running    = false
  private _loading    = false
  private unsubGps:   (() => void) | null          = null

  constructor(private readonly cfg: HybridConfig) {}

  get isRunning(): boolean { return this._running }
  get isLoading(): boolean { return this._loading }

  async start(): Promise<void> {
    if (this._running || this._loading) return
    this._loading = true

    try {
      this.ctx = new AudioContext()
      void this.ctx.resume()

      const ctx = this.ctx
      const initKmh = gpsStore.getPosition()?.speedKmh ?? 0
      const initRpm = speedToRpm(initKmh, this.cfg.synthGears)
      const initHz  = rpmToHz(initRpm)

      // ── Master gain (both layers connect here) ─────────────────────────
      this.masterGain = ctx.createGain()
      this.masterGain.gain.value = 0
      this.masterGain.connect(ctx.destination)

      // ── Synth layer (starts immediately) ──────────────────────────────
      this.osc1 = ctx.createOscillator(); this.osc1.type = 'sawtooth'
      this.osc1.frequency.value = initHz

      this.osc2 = ctx.createOscillator(); this.osc2.type = 'sawtooth'
      this.osc2.frequency.value = initHz * this.cfg.osc2Ratio

      this.lfo = ctx.createOscillator(); this.lfo.type = 'sine'
      this.lfo.frequency.value = initHz

      const g1       = ctx.createGain(); g1.gain.value      = this.cfg.osc1Vol
      const g2       = ctx.createGain(); g2.gain.value      = this.cfg.osc2Vol
      const lfoGain  = ctx.createGain(); lfoGain.gain.value = this.cfg.lfoDepth

      const shaper = ctx.createWaveShaper()
      shaper.curve = makeClipCurve(this.cfg.distAmount); shaper.oversample = '2x'

      this.synthBpf = ctx.createBiquadFilter()
      this.synthBpf.type = 'bandpass'
      this.synthBpf.frequency.value = Math.min(initHz * this.cfg.bpfMult, 1400)
      this.synthBpf.Q.value = this.cfg.bpfQ

      const lpf = ctx.createBiquadFilter()
      lpf.type = 'lowpass'; lpf.frequency.value = this.cfg.lpfFreq

      this.synthGain = ctx.createGain(); this.synthGain.gain.value = this.cfg.synthVol

      this.osc1.connect(g1); g1.connect(shaper)
      this.osc2.connect(g2); g2.connect(shaper)
      shaper.connect(this.synthBpf); this.synthBpf.connect(lpf)
      lpf.connect(this.synthGain); this.synthGain.connect(this.masterGain)

      this.lfo.connect(lfoGain); lfoGain.connect(this.masterGain.gain)

      if (this.cfg.lfo2Ratio !== null && this.cfg.lfo2Depth > 0) {
        this.lfo2 = ctx.createOscillator(); this.lfo2.type = 'sine'
        this.lfo2.frequency.value = initHz * this.cfg.lfo2Ratio
        const lg2 = ctx.createGain(); lg2.gain.value = this.cfg.lfo2Depth
        this.lfo2.connect(lg2); lg2.connect(this.masterGain.gain)
        this.lfo2.start()
      }

      this.osc1.start(); this.osc2.start(); this.lfo.start()
      this._running = true

      // Fade in the synth immediately
      this.masterGain.gain.setTargetAtTime(1.0, ctx.currentTime, 0.25)

      // Subscribe to GPS — synth responds right away
      this.unsubGps = gpsStore.onPosition((pos) => {
        if (pos?.speedKmh != null) this._update(pos.speedKmh)
      })

      // ── Real audio layer (async decode, joins after load) ──────────────
      const res      = await fetch(this.cfg.url)
      const arrayBuf = await res.arrayBuffer()
      if (!this.ctx) return                       // stopped while loading

      const buffer = await this.ctx.decodeAudioData(arrayBuf)
      if (!this.ctx || !this.masterGain) return   // stopped while decoding

      this.audioSrc = this.ctx.createBufferSource()
      this.audioSrc.buffer = buffer
      this.audioSrc.loop   = true
      this.audioSrc.playbackRate.value = this._audioRate(initKmh)

      this.audioGain = this.ctx.createGain()
      this.audioGain.gain.value = 0               // fade in
      this.audioSrc.connect(this.audioGain)
      this.audioGain.connect(this.masterGain)
      this.audioSrc.start()
      this.audioGain.gain.setTargetAtTime(this.cfg.audioVol, this.ctx.currentTime, 0.5)

    } catch {
      this._cleanup()
    } finally {
      this._loading = false
    }
  }

  stop(): void {
    if (!this._running) return
    this._running = false
    this.unsubGps?.(); this.unsubGps = null
    if (this.masterGain && this.ctx) {
      this.masterGain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.22)
    }
    const ctx = this.ctx
    const refs = { o1: this.osc1, o2: this.osc2, lfo: this.lfo, lfo2: this.lfo2, src: this.audioSrc }
    setTimeout(() => {
      try { refs.o1?.stop(); refs.o2?.stop(); refs.lfo?.stop(); refs.lfo2?.stop(); refs.src?.stop() } catch { /* ok */ }
      void ctx?.close()
    }, 700)
    this._cleanup()
  }

  private _cleanup(): void {
    this.ctx = null; this.osc1 = null; this.osc2 = null; this.lfo = null; this.lfo2 = null
    this.synthBpf = null; this.synthGain = null; this.audioSrc = null
    this.audioGain = null; this.masterGain = null
  }

  private _audioRate(kmh: number): number {
    const rpm = speedToRpm(kmh, this.cfg.audioGears)
    return Math.max(0.3, Math.min(3.0, rpm / this.cfg.audioBaseRpm))
  }

  private _update(kmh: number): void {
    if (!this.ctx) return
    const T  = this.ctx.currentTime
    const TC = 0.38
    const hz = rpmToHz(speedToRpm(kmh, this.cfg.synthGears))

    // Synth frequency tracks RPM
    this.osc1?.frequency.setTargetAtTime(hz, T, TC)
    this.osc2?.frequency.setTargetAtTime(hz * this.cfg.osc2Ratio, T, TC)
    this.lfo?.frequency.setTargetAtTime(hz, T, TC)
    this.lfo2?.frequency.setTargetAtTime(
      this.cfg.lfo2Ratio !== null ? hz * this.cfg.lfo2Ratio : hz, T, TC,
    )
    this.synthBpf?.frequency.setTargetAtTime(Math.min(hz * this.cfg.bpfMult, 1400), T, TC)

    // Real audio playbackRate also tracks RPM (pitch shifts with speed)
    this.audioSrc?.playbackRate.setTargetAtTime(this._audioRate(kmh), T, TC)
  }
}

// ── Exported singletons ───────────────────────────────────────────────────
export const v8HeaderEngine = new HybridAudioEngine(HEADER_CONFIG)
export const v8S63Engine    = new HybridAudioEngine(S63_CONFIG)
