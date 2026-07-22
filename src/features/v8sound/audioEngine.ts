// ─── Hybrid Audio Engine ──────────────────────────────────────────────────
//
// Two-layer architecture per engine:
//   1. Real-audio layer  — pre-recorded MP3 looped; playbackRate tracks speed
//   2. Synth layer       — sawtooth oscillators tuned per engine character
//
// Low-latency design (same as v8Engine.ts):
//   A requestAnimationFrame loop runs at display refresh rate and interpolates
//   _currentKmh toward _targetKmh (rate=14 → 95% in ~214 ms).
//   GPS updates only set _targetKmh; rAF drives all audio params each frame.
//   Both the synth frequencies AND the audio playbackRate update every frame.

import { gpsStore } from '@/features/gps/gpsStore'

// ── Shared types ──────────────────────────────────────────────────────────

interface GearBand { maxKmh: number; minRpm: number; maxRpm: number }

function speedToRpm(kmh: number, gears: ReadonlyArray<GearBand>): number {
  const speed = Math.max(0, kmh)
  let idx = gears.findIndex((g) => speed <= g.maxKmh)
  if (idx < 0) idx = gears.length - 1
  const g = gears[idx]; const prevMax = idx === 0 ? 0 : gears[idx - 1].maxKmh
  const span = g.maxKmh - prevMax
  const next = idx < gears.length - 1 ? gears[idx + 1] : null
  const topRpm = next ? Math.min(g.maxRpm, next.minRpm * 2.5) : g.maxRpm
  return g.minRpm + (span === 0 ? 0 : (speed - prevMax) / span) * (topRpm - g.minRpm)
}

function rpmToHz(rpm: number): number { return (rpm / 60) * 4 }

function makeClipCurve(amount: number): Float32Array {
  const n = 512; const c = new Float32Array(n)
  for (let i = 0; i < n; i++) {
    const x = (i * 2) / n - 1
    c[i] = ((Math.PI + amount) * x) / (Math.PI + amount * Math.abs(x))
  }
  return c
}

// ── Config ────────────────────────────────────────────────────────────────

interface HybridConfig {
  url:          string
  audioVol:     number
  audioBaseRpm: number
  audioGears:   ReadonlyArray<GearBand>
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
  synthVol:     number
}

// ── Open Header V8 ────────────────────────────────────────────────────────
const HEADER_GEARS: ReadonlyArray<GearBand> = [
  { maxKmh:   5, minRpm:  400, maxRpm:  400 },   // idle
  { maxKmh:  35, minRpm:  450, maxRpm: 3700 },   // 1st
  { maxKmh:  65, minRpm:  800, maxRpm: 3500 },   // 2nd
  { maxKmh:  95, minRpm:  800, maxRpm: 3500 },   // 3rd
  { maxKmh: 130, minRpm:  800, maxRpm: 3700 },   // 4th
  { maxKmh: 165, minRpm: 1100, maxRpm: 4200 },   // 5th
  { maxKmh: 999, minRpm: 1400, maxRpm: 5200 },   // 6th
]

const HEADER_CONFIG: HybridConfig = {
  url: '/engine-sounds/open-header-v8.mp3', audioVol: 0.30, audioBaseRpm: 900,
  audioGears: HEADER_GEARS, synthGears: HEADER_GEARS,
  distAmount: 190, osc1Vol: 0.60, osc2Ratio: 1.80, osc2Vol: 0.40,
  lfoDepth: 0.17, lfo2Ratio: 0.875, lfo2Depth: 0.07,
  bpfQ: 2.0, bpfMult: 1.5, lpfFreq: 700, synthVol: 0.32,
}

// ── Hybrid engine class ───────────────────────────────────────────────────

class HybridAudioEngine {
  private ctx:        AudioContext | null          = null
  private audioSrc:   AudioBufferSourceNode | null = null
  private audioGain:  GainNode | null              = null
  private osc1:       OscillatorNode | null        = null
  private osc2:       OscillatorNode | null        = null
  private lfo:        OscillatorNode | null        = null
  private lfo2:       OscillatorNode | null        = null
  private synthBpf:   BiquadFilterNode | null      = null
  private synthGain:  GainNode | null              = null
  private masterGain: GainNode | null              = null
  private _running    = false
  private _loading    = false
  private unsubGps:   (() => void) | null          = null

  // rAF interpolation
  private _targetKmh  = 0
  private _currentKmh = 0
  private _rafId:     number | null = null

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
      this._targetKmh = initKmh; this._currentKmh = initKmh

      const initHz = rpmToHz(speedToRpm(initKmh, this.cfg.synthGears))

      // ── Master gain ────────────────────────────────────────────────────
      this.masterGain = ctx.createGain(); this.masterGain.gain.value = 0
      this.masterGain.connect(ctx.destination)

      // ── Synth layer (starts immediately, no fetch needed) ──────────────
      this.osc1 = ctx.createOscillator(); this.osc1.type = 'sawtooth'
      this.osc1.frequency.value = initHz

      this.osc2 = ctx.createOscillator(); this.osc2.type = 'sawtooth'
      this.osc2.frequency.value = initHz * this.cfg.osc2Ratio

      this.lfo = ctx.createOscillator(); this.lfo.type = 'sine'
      this.lfo.frequency.value = initHz

      const g1      = ctx.createGain(); g1.gain.value      = this.cfg.osc1Vol
      const g2      = ctx.createGain(); g2.gain.value      = this.cfg.osc2Vol
      const lfoGain = ctx.createGain(); lfoGain.gain.value = this.cfg.lfoDepth

      const shaper = ctx.createWaveShaper()
      shaper.curve = makeClipCurve(this.cfg.distAmount); shaper.oversample = '2x'

      this.synthBpf = ctx.createBiquadFilter(); this.synthBpf.type = 'bandpass'
      this.synthBpf.frequency.value = Math.min(initHz * this.cfg.bpfMult, 1400)
      this.synthBpf.Q.value = this.cfg.bpfQ

      const lpf = ctx.createBiquadFilter(); lpf.type = 'lowpass'; lpf.frequency.value = this.cfg.lpfFreq

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
      this.masterGain.gain.setTargetAtTime(1.0, ctx.currentTime, 0.25)

      // Start rAF loop immediately — synth is already live
      this._startRaf()

      // GPS sets target; rAF interpolates every frame
      this.unsubGps = gpsStore.onPosition((pos) => {
        if (pos?.speedKmh != null) this._targetKmh = pos.speedKmh
      })

      // ── Real audio layer (async, joins after decode) ───────────────────
      const res      = await fetch(this.cfg.url)
      const arrayBuf = await res.arrayBuffer()
      if (!this.ctx || !this.masterGain) return   // stopped while loading

      const buffer = await this.ctx.decodeAudioData(arrayBuf)
      if (!this.ctx || !this.masterGain) return

      this.audioSrc = this.ctx.createBufferSource()
      this.audioSrc.buffer = buffer; this.audioSrc.loop = true
      this.audioSrc.playbackRate.value = this._kmhToRate(this._currentKmh)

      this.audioGain = this.ctx.createGain(); this.audioGain.gain.value = 0
      this.audioSrc.connect(this.audioGain); this.audioGain.connect(this.masterGain)
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
    this._stopRaf()
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

  // ── rAF loop — all audio params update every display frame ────────────

  private _startRaf(): void {
    let lastMs = 0

    const tick = (ms: number) => {
      if (!this._running) { this._rafId = null; return }

      const dt = lastMs > 0 ? Math.min((ms - lastMs) / 1000, 0.1) : 0.016
      lastMs   = ms
      // rate=14 → 95% in ~214 ms, frame-rate independent
      const k  = 1 - Math.exp(-dt * 14)

      this._currentKmh += (this._targetKmh - this._currentKmh) * k

      const hz = rpmToHz(speedToRpm(this._currentKmh, this.cfg.synthGears))

      if (this.osc1) this.osc1.frequency.value = hz
      if (this.osc2) this.osc2.frequency.value = hz * this.cfg.osc2Ratio
      if (this.lfo)  this.lfo.frequency.value  = hz
      if (this.lfo2 && this.cfg.lfo2Ratio !== null) {
        this.lfo2.frequency.value = hz * this.cfg.lfo2Ratio
      }
      if (this.synthBpf) {
        this.synthBpf.frequency.value = Math.min(hz * this.cfg.bpfMult, 1400)
      }
      // Real audio pitch also tracks speed every frame
      if (this.audioSrc) {
        this.audioSrc.playbackRate.value = this._kmhToRate(this._currentKmh)
      }

      this._rafId = requestAnimationFrame(tick)
    }

    this._rafId = requestAnimationFrame(tick)
  }

  private _stopRaf(): void {
    if (this._rafId !== null) { cancelAnimationFrame(this._rafId); this._rafId = null }
  }

  private _kmhToRate(kmh: number): number {
    const rpm = speedToRpm(kmh, this.cfg.audioGears)
    return Math.max(0.3, Math.min(3.0, rpm / this.cfg.audioBaseRpm))
  }

  private _cleanup(): void {
    this.ctx = null; this.osc1 = null; this.osc2 = null; this.lfo = null; this.lfo2 = null
    this.synthBpf = null; this.synthGain = null; this.audioSrc = null
    this.audioGain = null; this.masterGain = null
  }
}

// ── Exported singleton ────────────────────────────────────────────────────
export const v8HeaderEngine = new HybridAudioEngine(HEADER_CONFIG)
