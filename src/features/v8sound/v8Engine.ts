// ─── V8 Engine Sound Synthesizer ─────────────────────────────────────────
//
// Synthesizes a V8 petrol-engine sound using Web Audio API oscillators.
// GPS speed → simulated gear/RPM → firing frequency → synthesis.
//
// Signal chain:
//   [osc1 sawtooth] ─┐
//                     ├─→ [WaveShaper] → [BPF] → [LPF] → [masterGain] → out
//   [osc2 sawtooth] ─┘
//   [lfo sine] ──────────────────────────→ [lfoGain] → masterGain.gain  (AM thump)

import { gpsStore } from '@/features/gps/gpsStore'

// ── Gear map — RPM range per speed band (simulates 6-speed automatic) ──────
const GEARS = [
  { maxKmh:   5, minRpm:  800, maxRpm:  800 },  // idle / standstill
  { maxKmh:  30, minRpm:  900, maxRpm: 4500 },  // 1st
  { maxKmh:  55, minRpm: 1200, maxRpm: 4000 },  // 2nd
  { maxKmh:  80, minRpm: 1200, maxRpm: 4000 },  // 3rd
  { maxKmh: 110, minRpm: 1200, maxRpm: 4000 },  // 4th
  { maxKmh: 140, minRpm: 1500, maxRpm: 4200 },  // 5th
  { maxKmh: 999, minRpm: 1800, maxRpm: 5500 },  // 6th
] as const

function speedToRpm(kmh: number): number {
  const speed = Math.max(0, kmh)
  let idx = GEARS.findIndex((g) => speed <= g.maxKmh)
  if (idx < 0) idx = GEARS.length - 1
  const g       = GEARS[idx]
  const prevMax = idx === 0 ? 0 : GEARS[idx - 1].maxKmh
  const span    = g.maxKmh - prevMax
  const t       = span === 0 ? 0 : (speed - prevMax) / span
  return g.minRpm + t * (g.maxRpm - g.minRpm)
}

// V8 = 4 firing events per crank revolution → Hz = RPM / 60 * 4
function rpmToHz(rpm: number): number { return (rpm / 60) * 4 }

// Soft-clip curve — adds harmonic grit / engine growl
function makeClipCurve(amount: number): Float32Array {
  const n     = 512
  const curve = new Float32Array(n)
  for (let i = 0; i < n; i++) {
    const x  = (i * 2) / n - 1
    curve[i] = ((Math.PI + amount) * x) / (Math.PI + amount * Math.abs(x))
  }
  return curve
}

// ── Singleton engine class ────────────────────────────────────────────────
class V8EngineSound {
  private ctx:        AudioContext | null      = null
  private osc1:       OscillatorNode | null   = null
  private osc2:       OscillatorNode | null   = null
  private lfo:        OscillatorNode | null   = null
  private masterGain: GainNode | null         = null
  private bpf:        BiquadFilterNode | null = null
  private _running    = false
  private unsubGps:   (() => void) | null     = null

  get isRunning(): boolean { return this._running }

  /** Call from a user-gesture handler (onClick) so AudioContext is allowed. */
  start(): void {
    if (this._running) return

    this.ctx = new AudioContext()
    const ctx = this.ctx

    // Tesla Chromium may suspend AudioContext even inside a gesture handler.
    void ctx.resume()

    const initHz = rpmToHz(speedToRpm(gpsStore.getPosition()?.speedKmh ?? 0))

    // ── Oscillators ──────────────────────────────────────────────────────
    this.osc1 = ctx.createOscillator()
    this.osc1.type = 'sawtooth'
    this.osc1.frequency.value = initHz

    this.osc2 = ctx.createOscillator()      // slightly detuned for width
    this.osc2.type = 'sawtooth'
    this.osc2.frequency.value = initHz * 1.015

    this.lfo = ctx.createOscillator()       // AM modulator → V8 "thump" pulse
    this.lfo.type = 'sine'
    this.lfo.frequency.value = initHz

    // ── Gain nodes ───────────────────────────────────────────────────────
    const g1      = ctx.createGain(); g1.gain.value      = 0.65
    const g2      = ctx.createGain(); g2.gain.value      = 0.35
    const lfoGain = ctx.createGain(); lfoGain.gain.value = 0.10

    // ── Waveshaper ───────────────────────────────────────────────────────
    const shaper = ctx.createWaveShaper()
    shaper.curve      = makeClipCurve(100)
    shaper.oversample = '2x'

    // ── Filters ──────────────────────────────────────────────────────────
    this.bpf = ctx.createBiquadFilter()
    this.bpf.type            = 'bandpass'
    this.bpf.frequency.value = Math.min(initHz * 2.5, 1400)
    this.bpf.Q.value         = 1.2

    const lpf = ctx.createBiquadFilter()
    lpf.type            = 'lowpass'
    lpf.frequency.value = 900

    this.masterGain = ctx.createGain()
    this.masterGain.gain.value = 0          // start silent

    // ── Wire ─────────────────────────────────────────────────────────────
    this.osc1.connect(g1);      g1.connect(shaper)
    this.osc2.connect(g2);      g2.connect(shaper)
    shaper.connect(this.bpf)
    this.bpf.connect(lpf)
    lpf.connect(this.masterGain)

    this.lfo.connect(lfoGain)
    lfoGain.connect(this.masterGain.gain)   // LFO modulates master gain

    this.masterGain.connect(ctx.destination)

    // Start oscillators and fade in
    this.osc1.start(); this.osc2.start(); this.lfo.start()
    this._running = true
    this.masterGain.gain.setTargetAtTime(0.30, ctx.currentTime, 0.25)

    // Subscribe to GPS speed updates
    this.unsubGps = gpsStore.onPosition((pos) => {
      if (pos?.speedKmh != null) {
        this._updateHz(rpmToHz(speedToRpm(pos.speedKmh)))
      }
    })
  }

  stop(): void {
    if (!this._running) return
    this._running = false
    this.unsubGps?.()
    this.unsubGps = null

    // Fade out, then close AudioContext to release resources
    if (this.masterGain && this.ctx) {
      this.masterGain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.22)
    }
    const ctx = this.ctx
    const o1 = this.osc1, o2 = this.osc2, lfo = this.lfo
    setTimeout(() => {
      try { o1?.stop(); o2?.stop(); lfo?.stop() } catch { /* already stopped */ }
      void ctx?.close()
    }, 700)

    this.ctx = null; this.osc1 = null; this.osc2 = null
    this.lfo = null; this.masterGain = null; this.bpf = null
  }

  private _updateHz(hz: number): void {
    if (!this.ctx || !this.osc1 || !this.osc2 || !this.lfo || !this.bpf) return
    const T  = this.ctx.currentTime
    const TC = 0.38                          // seconds to glide to new frequency

    this.osc1.frequency.setTargetAtTime(hz,               T, TC)
    this.osc2.frequency.setTargetAtTime(hz * 1.015,       T, TC)
    this.lfo.frequency.setTargetAtTime(hz,                T, TC)
    this.bpf.frequency.setTargetAtTime(Math.min(hz * 2.5, 1400), T, TC)
  }
}

export const v8Engine = new V8EngineSound()
