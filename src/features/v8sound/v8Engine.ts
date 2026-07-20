// ─── V8 Engine Sound Synthesizer ─────────────────────────────────────────
//
// Three V8 synthesizers (sport, muscle, AMG S63) built on Web Audio API.
//
// Low-latency design:
//   GPS updates are 1 Hz at best — using setTargetAtTime with a long TC would
//   add ~1 second of extra lag on top of the GPS lag itself.
//   Instead, a requestAnimationFrame loop runs at display refresh rate (~60 fps)
//   and continuously interpolates _currentHz toward _targetHz using an
//   exponential approach (k = 1 - exp(-dt × rate), rate=14 → 95% in ~214 ms).
//   GPS position updates merely set _targetHz; the rAF loop does the rest.
//
// AMG only: exhaust pops on sudden deceleration (>15 km/h per second).

import { gpsStore } from '@/features/gps/gpsStore'

// ── Config ────────────────────────────────────────────────────────────────

interface GearBand { maxKmh: number; minRpm: number; maxRpm: number }

interface V8Config {
  idleRpm:          number
  gears:            ReadonlyArray<GearBand>
  distAmount:       number
  osc1Vol:          number
  osc2Ratio:        number
  osc2Vol:          number
  lfoDepth:         number
  lfo2Ratio:        number | null
  lfo2Depth:        number
  bpfQ:             number
  bpfMult:          number
  bpfMaxHz:         number
  lpfFreq:          number
  masterVol:        number
  enableExhaustPop: boolean
}

// ── Helpers ───────────────────────────────────────────────────────────────

function rpmToHz(rpm: number): number { return (rpm / 60) * 4 }

function speedToRpm(kmh: number, gears: ReadonlyArray<GearBand>): number {
  const speed = Math.max(0, kmh)
  let idx = gears.findIndex((g) => speed <= g.maxKmh)
  if (idx < 0) idx = gears.length - 1
  const g = gears[idx]; const prevMax = idx === 0 ? 0 : gears[idx - 1].maxKmh
  const span = g.maxKmh - prevMax
  return g.minRpm + (span === 0 ? 0 : (speed - prevMax) / span) * (g.maxRpm - g.minRpm)
}

function makeClipCurve(amount: number): Float32Array {
  const n = 512; const c = new Float32Array(n)
  for (let i = 0; i < n; i++) {
    const x = (i * 2) / n - 1
    c[i] = ((Math.PI + amount) * x) / (Math.PI + amount * Math.abs(x))
  }
  return c
}

// ── Gear configs ──────────────────────────────────────────────────────────

const SPORT_GEARS: ReadonlyArray<GearBand> = [
  { maxKmh:   5, minRpm:  800, maxRpm:  800 },
  { maxKmh:  30, minRpm:  900, maxRpm: 4500 },
  { maxKmh:  55, minRpm: 1200, maxRpm: 4000 },
  { maxKmh:  80, minRpm: 1200, maxRpm: 4000 },
  { maxKmh: 110, minRpm: 1200, maxRpm: 4000 },
  { maxKmh: 140, minRpm: 1500, maxRpm: 4200 },
  { maxKmh: 999, minRpm: 1800, maxRpm: 5500 },
]

const MUSCLE_GEARS: ReadonlyArray<GearBand> = [
  { maxKmh:   5, minRpm:  680, maxRpm:  680 },
  { maxKmh:  40, minRpm:  750, maxRpm: 3800 },
  { maxKmh:  70, minRpm: 1100, maxRpm: 3600 },
  { maxKmh: 100, minRpm: 1100, maxRpm: 3600 },
  { maxKmh: 135, minRpm: 1100, maxRpm: 3800 },
  { maxKmh: 170, minRpm: 1400, maxRpm: 4000 },
  { maxKmh: 999, minRpm: 1600, maxRpm: 5000 },
]

const AMG_GEARS: ReadonlyArray<GearBand> = [
  { maxKmh:   5, minRpm:  780, maxRpm:  780 },
  { maxKmh:  25, minRpm:  900, maxRpm: 5000 },
  { maxKmh:  45, minRpm: 1500, maxRpm: 5000 },
  { maxKmh:  70, minRpm: 1500, maxRpm: 5200 },
  { maxKmh:  95, minRpm: 1500, maxRpm: 5200 },
  { maxKmh: 120, minRpm: 1500, maxRpm: 5200 },
  { maxKmh: 155, minRpm: 1800, maxRpm: 5500 },
  { maxKmh: 200, minRpm: 2000, maxRpm: 6000 },
  { maxKmh: 999, minRpm: 2500, maxRpm: 6500 },
]

const SPORT_CONFIG: V8Config = {
  idleRpm: 800, gears: SPORT_GEARS,
  distAmount: 100, osc1Vol: 0.65, osc2Ratio: 1.015, osc2Vol: 0.35,
  lfoDepth: 0.10, lfo2Ratio: null, lfo2Depth: 0,
  bpfQ: 1.2, bpfMult: 2.5, bpfMaxHz: 1400, lpfFreq: 900,
  masterVol: 0.30, enableExhaustPop: false,
}

const MUSCLE_CONFIG: V8Config = {
  idleRpm: 680, gears: MUSCLE_GEARS,
  distAmount: 220, osc1Vol: 0.58, osc2Ratio: 2.0, osc2Vol: 0.42,
  lfoDepth: 0.18, lfo2Ratio: 0.875, lfo2Depth: 0.06,
  bpfQ: 1.9, bpfMult: 1.7, bpfMaxHz: 1400, lpfFreq: 650,
  masterVol: 0.36, enableExhaustPop: false,
}

const AMG_CONFIG: V8Config = {
  idleRpm: 780, gears: AMG_GEARS,
  distAmount: 145, osc1Vol: 0.60, osc2Ratio: 1.50, osc2Vol: 0.40,
  lfoDepth: 0.10, lfo2Ratio: null, lfo2Depth: 0,
  bpfQ: 1.7, bpfMult: 3.0, bpfMaxHz: 1800, lpfFreq: 1100,
  masterVol: 0.30, enableExhaustPop: true,
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

  // rAF interpolation — runs at display refresh rate, not GPS rate
  private _targetHz  = 50
  private _currentHz = 50
  private _rafId:    number | null = null

  // Exhaust pop deceleration detection
  private _prevKmh   = 0
  private _prevTs    = 0
  private _braking   = false

  constructor(private readonly cfg: V8Config) {}

  get isRunning(): boolean { return this._running }

  start(): void {
    if (this._running) return

    this.ctx = new AudioContext()
    const ctx = this.ctx
    void ctx.resume()

    const initKmh = gpsStore.getPosition()?.speedKmh ?? 0
    const initHz  = rpmToHz(speedToRpm(initKmh, this.cfg.gears))
    this._targetHz = initHz; this._currentHz = initHz

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

    this.bpf = ctx.createBiquadFilter(); this.bpf.type = 'bandpass'
    this.bpf.frequency.value = Math.min(initHz * this.cfg.bpfMult, this.cfg.bpfMaxHz)
    this.bpf.Q.value = this.cfg.bpfQ

    const lpf = ctx.createBiquadFilter(); lpf.type = 'lowpass'; lpf.frequency.value = this.cfg.lpfFreq

    this.masterGain = ctx.createGain(); this.masterGain.gain.value = 0

    this.osc1.connect(g1); g1.connect(shaper)
    this.osc2.connect(g2); g2.connect(shaper)
    shaper.connect(this.bpf); this.bpf.connect(lpf); lpf.connect(this.masterGain)
    this.lfo.connect(lfoGain); lfoGain.connect(this.masterGain.gain)

    if (this.cfg.lfo2Ratio !== null && this.cfg.lfo2Depth > 0) {
      this.lfo2 = ctx.createOscillator(); this.lfo2.type = 'sine'
      this.lfo2.frequency.value = initHz * this.cfg.lfo2Ratio
      const lg2 = ctx.createGain(); lg2.gain.value = this.cfg.lfo2Depth
      this.lfo2.connect(lg2); lg2.connect(this.masterGain.gain)
      this.lfo2.start()
    }

    this.masterGain.connect(ctx.destination)
    this.osc1.start(); this.osc2.start(); this.lfo.start()
    this._running = true
    this.masterGain.gain.setTargetAtTime(this.cfg.masterVol, ctx.currentTime, 0.25)

    // Start rAF interpolation loop
    this._startRaf()

    this._prevKmh = initKmh; this._prevTs = Date.now(); this._braking = false

    // GPS only sets target — rAF handles smooth frequency tracking
    this.unsubGps = gpsStore.onPosition((pos) => {
      const kmh = pos?.speedKmh ?? 0
      this._targetHz = rpmToHz(speedToRpm(kmh, this.cfg.gears))
      if (this.cfg.enableExhaustPop) this._checkDecel(kmh)
    })
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
    const o1 = this.osc1, o2 = this.osc2, lfo = this.lfo, lfo2 = this.lfo2
    setTimeout(() => {
      try { o1?.stop(); o2?.stop(); lfo?.stop(); lfo2?.stop() } catch { /* ok */ }
      void ctx?.close()
    }, 700)
    this.ctx = null; this.osc1 = null; this.osc2 = null
    this.lfo = null; this.lfo2 = null; this.masterGain = null; this.bpf = null
  }

  // ── rAF loop — frequency interpolation at display refresh rate ────────

  private _startRaf(): void {
    let lastMs = 0

    const tick = (ms: number) => {
      if (!this._running || !this.osc1 || !this.osc2 || !this.lfo || !this.bpf) {
        this._rafId = null
        return
      }

      // Frame-rate-independent exponential approach:
      //   rate=14 → 95% of target reached in ~214 ms regardless of FPS
      const dt = lastMs > 0 ? Math.min((ms - lastMs) / 1000, 0.1) : 0.016
      lastMs   = ms
      const k  = 1 - Math.exp(-dt * 14)

      this._currentHz += (this._targetHz - this._currentHz) * k

      // Direct .value assignment — no AudioParam lag, updates every frame
      this.osc1.frequency.value = this._currentHz
      this.osc2.frequency.value = this._currentHz * this.cfg.osc2Ratio
      this.lfo.frequency.value  = this._currentHz
      if (this.lfo2 && this.cfg.lfo2Ratio !== null) {
        this.lfo2.frequency.value = this._currentHz * this.cfg.lfo2Ratio
      }
      this.bpf.frequency.value = Math.min(
        this._currentHz * this.cfg.bpfMult,
        this.cfg.bpfMaxHz,
      )

      this._rafId = requestAnimationFrame(tick)
    }

    this._rafId = requestAnimationFrame(tick)
  }

  private _stopRaf(): void {
    if (this._rafId !== null) { cancelAnimationFrame(this._rafId); this._rafId = null }
  }

  // ── Exhaust pop (AMG only) ────────────────────────────────────────────

  private _checkDecel(kmh: number): void {
    const now = Date.now(); const dtMs = now - this._prevTs
    if (this._prevTs > 0 && dtMs > 50 && dtMs < 3000) {
      const decelRate = (this._prevKmh - kmh) / (dtMs / 1000)
      if (decelRate > 15 && this._prevKmh > 20) {
        if (!this._braking) {
          this._braking = true
          this._triggerPops(decelRate > 45 ? 3 : decelRate > 28 ? 2 : 1)
        }
      } else if (decelRate < 5) {
        this._braking = false
      }
    }
    this._prevKmh = kmh; this._prevTs = now
  }

  private _triggerPops(count: number): void {
    if (!this.ctx || !this.masterGain) return
    const ctx = this.ctx; const master = this.masterGain

    for (let i = 0; i < count; i++) {
      setTimeout(() => {
        if (!ctx || ctx.state === 'closed') return
        const T = ctx.currentTime

        // Crack: filtered white noise
        const nLen = Math.floor(ctx.sampleRate * 0.09)
        const nBuf = ctx.createBuffer(1, nLen, ctx.sampleRate)
        const nd = nBuf.getChannelData(0)
        for (let j = 0; j < nLen; j++) nd[j] = Math.random() * 2 - 1
        const ns = ctx.createBufferSource(); ns.buffer = nBuf
        const crack = ctx.createBiquadFilter()
        crack.type = 'bandpass'; crack.frequency.value = 280 + Math.random() * 200; crack.Q.value = 4.5
        const crackGain = ctx.createGain()
        crackGain.gain.setValueAtTime(0.80, T)
        crackGain.gain.exponentialRampToValueAtTime(0.001, T + 0.08)
        ns.connect(crack); crack.connect(crackGain); crackGain.connect(master)
        ns.start(T); ns.stop(T + 0.10)

        // Thump: decaying 90 Hz sine (exhaust thunder)
        const tLen = Math.floor(ctx.sampleRate * 0.08)
        const tBuf = ctx.createBuffer(1, tLen, ctx.sampleRate)
        const td = tBuf.getChannelData(0)
        for (let j = 0; j < tLen; j++) {
          td[j] = Math.sin(2 * Math.PI * 90 * j / ctx.sampleRate) * Math.exp(-j / (tLen * 0.28))
        }
        const ts = ctx.createBufferSource(); ts.buffer = tBuf
        const thumpGain = ctx.createGain()
        thumpGain.gain.setValueAtTime(0.60, T)
        thumpGain.gain.exponentialRampToValueAtTime(0.001, T + 0.08)
        ts.connect(thumpGain); thumpGain.connect(master)
        ts.start(T); ts.stop(T + 0.09)

      }, i * (55 + Math.random() * 85))
    }
  }
}

// ── Exported singletons ───────────────────────────────────────────────────
export const v8SportEngine  = new V8EngineSound(SPORT_CONFIG)
export const v8MuscleEngine = new V8EngineSound(MUSCLE_CONFIG)
export const v8AmgEngine    = new V8EngineSound(AMG_CONFIG)
