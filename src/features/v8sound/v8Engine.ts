// ─── V8 Engine Sound Synthesizer ─────────────────────────────────────────
//
// Two preconfigured V8 synthesizers built on Web Audio API:
//   v8SportEngine  — high-revving sport V8 (~4–5L)
//   v8MuscleEngine — heavy naturally-aspirated 6L+ big-block burble
//
// Signal chain per engine:
//   [osc1 sawtooth] ─┐
//                     ├─→ [WaveShaper] → [BPF] → [LPF] → [masterGain] → out
//   [osc2 sawtooth] ─┘
//   [lfo sine] ──────────────────────────→ [lfoGain] → masterGain.gain  (AM thump)
//   [lfo2 sine] ─────────────────────────→ [lfo2Gain] → masterGain.gain (muscle irregular cam)

import { gpsStore } from '@/features/gps/gpsStore'

// ── Config ────────────────────────────────────────────────────────────────

interface GearBand {
  maxKmh: number
  minRpm: number
  maxRpm: number
}

interface V8Config {
  idleRpm:    number                    // RPM at standstill
  gears:      ReadonlyArray<GearBand>
  distAmount: number                    // waveshaper clip curve steepness
  osc1Vol:    number                    // mix level for oscillator 1
  osc2Ratio:  number                    // osc2 freq = osc1 * ratio
  osc2Vol:    number                    // mix level for oscillator 2
  lfoDepth:   number                    // primary AM thump depth
  lfo2Ratio:  number | null             // secondary LFO ratio (null = disabled)
  lfo2Depth:  number                    // secondary LFO depth
  bpfQ:       number                    // bandpass resonance
  bpfMult:    number                    // BPF center = firingHz * bpfMult
  lpfFreq:    number                    // low-pass cutoff Hz
  masterVol:  number                    // overall gain (0–1)
}

// ── Sport V8 — high-revving, modern character (~4–5L) ─────────────────────
const SPORT_GEARS: ReadonlyArray<GearBand> = [
  { maxKmh:   5, minRpm:  800, maxRpm:  800 },
  { maxKmh:  30, minRpm:  900, maxRpm: 4500 },
  { maxKmh:  55, minRpm: 1200, maxRpm: 4000 },
  { maxKmh:  80, minRpm: 1200, maxRpm: 4000 },
  { maxKmh: 110, minRpm: 1200, maxRpm: 4000 },
  { maxKmh: 140, minRpm: 1500, maxRpm: 4200 },
  { maxKmh: 999, minRpm: 1800, maxRpm: 5500 },
]

const SPORT_CONFIG: V8Config = {
  idleRpm:    800,
  gears:      SPORT_GEARS,
  distAmount: 100,
  osc1Vol:    0.65,
  osc2Ratio:  1.015,   // slight detune → stereo width
  osc2Vol:    0.35,
  lfoDepth:   0.10,
  lfo2Ratio:  null,    // no secondary LFO
  lfo2Depth:  0,
  bpfQ:       1.2,
  bpfMult:    2.5,
  lpfFreq:    900,
  masterVol:  0.30,
}

// ── Muscle V8 6L+ — big-block burble, lumpy cam, heavy low-end ───────────
// Lower idle, higher distortion, osc2 at 2× (octave harmonic for "bark"),
// a secondary LFO at 0.875× creates the irregular "potato-potato" cam beat,
// deeper BPF center and higher LFO depth for that chest-thumping V8 idle.
const MUSCLE_GEARS: ReadonlyArray<GearBand> = [
  { maxKmh:   5, minRpm:  680, maxRpm:  680 },  // deep idle
  { maxKmh:  40, minRpm:  750, maxRpm: 3800 },  // 1st — wide power band
  { maxKmh:  70, minRpm: 1100, maxRpm: 3600 },  // 2nd
  { maxKmh: 100, minRpm: 1100, maxRpm: 3600 },  // 3rd
  { maxKmh: 135, minRpm: 1100, maxRpm: 3800 },  // 4th
  { maxKmh: 170, minRpm: 1400, maxRpm: 4000 },  // 5th
  { maxKmh: 999, minRpm: 1600, maxRpm: 5000 },  // 6th
]

const MUSCLE_CONFIG: V8Config = {
  idleRpm:    680,
  gears:      MUSCLE_GEARS,
  distAmount: 220,     // aggressive hard-clip — raw, gritty character
  osc1Vol:    0.58,
  osc2Ratio:  2.0,     // octave harmonic → metallic "bark" at top-end
  osc2Vol:    0.42,
  lfoDepth:   0.18,    // heavy rhythmic thump
  lfo2Ratio:  0.875,   // 7:8 against main → creates uneven cam-like beat
  lfo2Depth:  0.06,
  bpfQ:       1.9,     // more resonant → engine "ring"
  bpfMult:    1.7,     // lower center = more bass mass
  lpfFreq:    650,     // darker tone — less high-frequency fizz
  masterVol:  0.36,
}

// ── Helpers ───────────────────────────────────────────────────────────────

// V8 = 4 firing events per crank revolution
function rpmToHz(rpm: number): number { return (rpm / 60) * 4 }

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

// Soft-clip waveshaper curve — higher amount = more harmonic grit
function makeClipCurve(amount: number): Float32Array {
  const n     = 512
  const curve = new Float32Array(n)
  for (let i = 0; i < n; i++) {
    const x  = (i * 2) / n - 1
    curve[i] = ((Math.PI + amount) * x) / (Math.PI + amount * Math.abs(x))
  }
  return curve
}

// ── Engine class ──────────────────────────────────────────────────────────

class V8EngineSound {
  private ctx:        AudioContext | null      = null
  private osc1:       OscillatorNode | null   = null
  private osc2:       OscillatorNode | null   = null
  private lfo:        OscillatorNode | null   = null
  private lfo2:       OscillatorNode | null   = null
  private masterGain: GainNode | null         = null
  private bpf:        BiquadFilterNode | null = null
  private _running    = false
  private unsubGps:   (() => void) | null     = null

  constructor(private readonly cfg: V8Config) {}

  get isRunning(): boolean { return this._running }

  /** Must be called from a user-gesture handler (onClick). */
  start(): void {
    if (this._running) return

    this.ctx = new AudioContext()
    const ctx = this.ctx
    // Tesla Chromium may suspend AudioContext even inside a gesture — force resume.
    void ctx.resume()

    const initHz = rpmToHz(speedToRpm(gpsStore.getPosition()?.speedKmh ?? 0, this.cfg.gears))

    // ── Oscillators ──────────────────────────────────────────────────────
    this.osc1 = ctx.createOscillator()
    this.osc1.type = 'sawtooth'
    this.osc1.frequency.value = initHz

    this.osc2 = ctx.createOscillator()
    this.osc2.type = 'sawtooth'
    this.osc2.frequency.value = initHz * this.cfg.osc2Ratio

    this.lfo = ctx.createOscillator()
    this.lfo.type = 'sine'
    this.lfo.frequency.value = initHz

    const g1      = ctx.createGain(); g1.gain.value      = this.cfg.osc1Vol
    const g2      = ctx.createGain(); g2.gain.value      = this.cfg.osc2Vol
    const lfoGain = ctx.createGain(); lfoGain.gain.value = this.cfg.lfoDepth

    // ── Optional secondary LFO (muscle cam beat) ─────────────────────────
    if (this.cfg.lfo2Ratio !== null) {
      this.lfo2 = ctx.createOscillator()
      this.lfo2.type = 'sine'
      this.lfo2.frequency.value = initHz * this.cfg.lfo2Ratio
    }

    // ── Waveshaper ───────────────────────────────────────────────────────
    const shaper = ctx.createWaveShaper()
    shaper.curve      = makeClipCurve(this.cfg.distAmount)
    shaper.oversample = '2x'

    // ── Filters ──────────────────────────────────────────────────────────
    this.bpf = ctx.createBiquadFilter()
    this.bpf.type            = 'bandpass'
    this.bpf.frequency.value = Math.min(initHz * this.cfg.bpfMult, 1400)
    this.bpf.Q.value         = this.cfg.bpfQ

    const lpf = ctx.createBiquadFilter()
    lpf.type            = 'lowpass'
    lpf.frequency.value = this.cfg.lpfFreq

    this.masterGain = ctx.createGain()
    this.masterGain.gain.value = 0    // start silent

    // ── Wire ─────────────────────────────────────────────────────────────
    this.osc1.connect(g1); g1.connect(shaper)
    this.osc2.connect(g2); g2.connect(shaper)
    shaper.connect(this.bpf)
    this.bpf.connect(lpf)
    lpf.connect(this.masterGain)

    this.lfo.connect(lfoGain)
    lfoGain.connect(this.masterGain.gain)

    if (this.lfo2 && this.cfg.lfo2Depth > 0) {
      const lg2 = ctx.createGain(); lg2.gain.value = this.cfg.lfo2Depth
      this.lfo2.connect(lg2)
      lg2.connect(this.masterGain.gain)
      this.lfo2.start()
    }

    this.masterGain.connect(ctx.destination)

    this.osc1.start(); this.osc2.start(); this.lfo.start()
    this._running = true
    this.masterGain.gain.setTargetAtTime(this.cfg.masterVol, ctx.currentTime, 0.25)

    // Subscribe to live GPS speed
    this.unsubGps = gpsStore.onPosition((pos) => {
      if (pos?.speedKmh != null) {
        this._updateHz(rpmToHz(speedToRpm(pos.speedKmh, this.cfg.gears)))
      }
    })
  }

  stop(): void {
    if (!this._running) return
    this._running = false
    this.unsubGps?.(); this.unsubGps = null

    if (this.masterGain && this.ctx) {
      this.masterGain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.22)
    }
    const ctx = this.ctx
    const o1 = this.osc1, o2 = this.osc2, lfo = this.lfo, lfo2 = this.lfo2
    setTimeout(() => {
      try { o1?.stop(); o2?.stop(); lfo?.stop(); lfo2?.stop() } catch { /* already stopped */ }
      void ctx?.close()
    }, 700)

    this.ctx = null; this.osc1 = null; this.osc2 = null
    this.lfo = null; this.lfo2 = null; this.masterGain = null; this.bpf = null
  }

  private _updateHz(hz: number): void {
    if (!this.ctx || !this.osc1 || !this.osc2 || !this.lfo || !this.bpf) return
    const T  = this.ctx.currentTime
    const TC = 0.38

    this.osc1.frequency.setTargetAtTime(hz,                         T, TC)
    this.osc2.frequency.setTargetAtTime(hz * this.cfg.osc2Ratio,    T, TC)
    this.lfo.frequency.setTargetAtTime(hz,                          T, TC)
    this.bpf.frequency.setTargetAtTime(Math.min(hz * this.cfg.bpfMult, 1400), T, TC)

    if (this.lfo2 && this.cfg.lfo2Ratio !== null) {
      this.lfo2.frequency.setTargetAtTime(hz * this.cfg.lfo2Ratio, T, TC)
    }
  }
}

// ── Exported singletons ───────────────────────────────────────────────────
export const v8SportEngine  = new V8EngineSound(SPORT_CONFIG)
export const v8MuscleEngine = new V8EngineSound(MUSCLE_CONFIG)
