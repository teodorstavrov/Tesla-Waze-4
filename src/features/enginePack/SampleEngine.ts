// ─── Sample-based Engine Runtime ─────────────────────────────────────────────
//
// Plays real pre-recorded WAV loops at multiple RPM points.
// As speed changes, crossfades between adjacent samples using constant-power
// curves. Fine-grained pitch correction via playbackRate between zone boundaries.
//
// Audio graph:
//   [srcA.node] → [srcA.gain] ─┐
//   [srcB.node] → [srcB.gain] ─┤─▶ [masterGain] ─▶ destination
//
// Only 2 sources are ever active simultaneously.
// Crossfade duration: 180ms with cos/sin equal-power curve.

import { gpsStore } from '@/features/gps/gpsStore'

// ── Types ─────────────────────────────────────────────────────────────────────

interface GearBand { maxKmh: number; minRpm: number; maxRpm: number }

interface SampleZone { rpm: number; file: string }

interface EngineProfile {
  id:          string
  name:        string
  cylPairs:    number
  idleRPM:     number
  redlineRPM:  number
  sampleZones: SampleZone[]
  gears:       GearBand[]
}

interface ActiveSrc {
  node: AudioBufferSourceNode
  gain: GainNode
  rpm:  number
}

// ── Constants ─────────────────────────────────────────────────────────────────

const XFADE_TIME  = 0.18   // crossfade duration (seconds)
const XFADE_N     = 64     // curve resolution
const RPM_INTERP  = 6      // rAF RPM approach rate (accel)
const RPM_DECEL   = 2.5    // rAF RPM approach rate (decel)

// Pre-compute constant-power crossfade curves
const CURVE_OUT = new Float32Array(XFADE_N)
const CURVE_IN  = new Float32Array(XFADE_N)
for (let i = 0; i < XFADE_N; i++) {
  const a = i / (XFADE_N - 1)
  CURVE_OUT[i] = Math.cos(a * Math.PI / 2)
  CURVE_IN[i]  = Math.sin(a * Math.PI / 2)
}

// ── SampleEngine class ────────────────────────────────────────────────────────

export class SampleEngine {
  private readonly packPath: string

  private ctx:        AudioContext | null = null
  private masterGain: GainNode | null     = null
  private profile:    EngineProfile | null = null
  private buffers     = new Map<number, AudioBuffer>()

  private srcA: ActiveSrc | null = null
  private srcB: ActiveSrc | null = null
  private xfading = false

  private _running  = false
  private _loading  = false
  private _volMult  = 1.0

  // rAF state
  private _targetKmh    = 0
  private _currentKmh   = 0
  private _currentRPM   = 0
  private _decel        = false
  private _prevKmh      = 0
  private _rafId: number | null = null
  private unsubGps: (() => void) | null = null

  constructor(packPath: string) { this.packPath = packPath }

  get isRunning() { return this._running }
  get isLoading() { return this._loading }

  // ── Public API ──────────────────────────────────────────────────────────────

  async start(): Promise<void> {
    if (this._running || this._loading) return
    this._loading = true

    try {
      // Load profile + all samples on first start
      if (!this.profile) {
        const res = await fetch(`${this.packPath}/engine.json`)
        if (!res.ok) throw new Error(`engine.json not found at ${this.packPath}`)
        this.profile = await res.json() as EngineProfile
      }

      if (this.buffers.size < this.profile.sampleZones.length) {
        const tmpCtx = new AudioContext()
        await Promise.all(this.profile.sampleZones.map(async zone => {
          if (this.buffers.has(zone.rpm)) return
          const r  = await fetch(`${this.packPath}/${zone.file}`)
          const ab = await r.arrayBuffer()
          const buf = await tmpCtx.decodeAudioData(ab)
          this.buffers.set(zone.rpm, buf)
        }))
        await tmpCtx.close()
      }

      this.ctx = new AudioContext()
      void this.ctx.resume()

      this.masterGain = this.ctx.createGain()
      this.masterGain.gain.setValueAtTime(0, this.ctx.currentTime)
      this.masterGain.connect(this.ctx.destination)

      const initKmh = gpsStore.getPosition()?.speedKmh ?? 0
      this._targetKmh  = initKmh
      this._currentKmh = initKmh
      this._currentRPM = this._kmhToRPM(initKmh)
      this._prevKmh    = initKmh
      this._decel      = false

      this._running = true

      this._launchSrc('A', this._nearestRPM(this._currentRPM))
      this.masterGain.gain.setTargetAtTime(this._volMult, this.ctx.currentTime, 0.30)

      this.unsubGps = gpsStore.onPosition(pos => {
        if (pos?.speedKmh != null) {
          this._decel    = pos.speedKmh < this._prevKmh
          this._prevKmh  = pos.speedKmh
          this._targetKmh = pos.speedKmh
        }
      })

      this._startRaf()
    } catch (e) {
      this._cleanup()
      throw e
    } finally {
      this._loading = false
    }
  }

  stop(): void {
    if (!this._running) return
    this._running = false
    this._stopRaf()
    this.unsubGps?.()
    this.unsubGps = null

    if (this.masterGain && this.ctx)
      this.masterGain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.20)

    const ctx = this.ctx
    const a = this.srcA, b = this.srcB
    setTimeout(() => {
      try { a?.node.stop(); b?.node.stop() } catch { /* ok */ }
      try { a?.gain.disconnect(); b?.gain.disconnect() } catch { /* ok */ }
      void ctx?.close()
    }, 500)

    this.srcA = null
    this.srcB = null
    this.xfading = false
    this._cleanup()
  }

  setVolumeMultiplier(m: number): void {
    this._volMult = Math.max(0, m)
    if (this.masterGain && this.ctx)
      this.masterGain.gain.setTargetAtTime(this._volMult, this.ctx.currentTime, 0.10)
  }

  // ── rAF loop ────────────────────────────────────────────────────────────────

  private _startRaf(): void {
    let lastMs = 0

    const tick = (ms: number) => {
      if (!this._running) { this._rafId = null; return }

      const dt   = lastMs > 0 ? Math.min((ms - lastMs) / 1000, 0.10) : 0.016
      lastMs     = ms
      const rate = this._decel ? RPM_DECEL : RPM_INTERP
      const k    = 1 - Math.exp(-dt * rate)

      this._currentKmh += (this._targetKmh - this._currentKmh) * k

      const targetRPM = this._kmhToRPM(this._currentKmh)
      this._currentRPM += (targetRPM - this._currentRPM) * k

      // Pitch correction: stretch the active sample to match exact current RPM
      if (this.srcA) {
        const rate = Math.max(0.45, Math.min(2.20, this._currentRPM / this.srcA.rpm))
        this.srcA.node.playbackRate.value = rate
      }

      // Zone switch: crossfade when nearest sample changes
      if (!this.xfading && this.srcA) {
        const nearest = this._nearestRPM(this._currentRPM)
        if (nearest !== this.srcA.rpm) this._crossfadeTo(nearest)
      }

      this._rafId = requestAnimationFrame(tick)
    }

    this._rafId = requestAnimationFrame(tick)
  }

  private _stopRaf(): void {
    if (this._rafId !== null) { cancelAnimationFrame(this._rafId); this._rafId = null }
  }

  // ── Audio helpers ───────────────────────────────────────────────────────────

  private _launchSrc(slot: 'A' | 'B', rpm: number, gainValue = 1.0): void {
    if (!this.ctx || !this.masterGain) return
    const buf = this.buffers.get(rpm)
    if (!buf) return

    const gainNode = this.ctx.createGain()
    gainNode.gain.setValueAtTime(gainValue, this.ctx.currentTime)
    gainNode.connect(this.masterGain)

    const node = this.ctx.createBufferSource()
    node.buffer = buf
    node.loop   = true
    node.connect(gainNode)
    node.start()

    const src: ActiveSrc = { node, gain: gainNode, rpm }
    if (slot === 'A') this.srcA = src
    else              this.srcB = src
  }

  private _crossfadeTo(targetRPM: number): void {
    if (!this.ctx || this.xfading || !this.buffers.has(targetRPM)) return
    this.xfading = true

    this._launchSrc('B', targetRPM, 0.001)
    if (!this.srcB) { this.xfading = false; return }

    const t = this.ctx.currentTime
    this.srcA?.gain.gain.setValueCurveAtTime(CURVE_OUT, t, XFADE_TIME)
    this.srcB.gain.gain.setValueCurveAtTime(CURVE_IN,  t, XFADE_TIME)

    const oldA = this.srcA
    const newA = this.srcB

    setTimeout(() => {
      try { oldA?.node.stop(); oldA?.gain.disconnect() } catch { /* ok */ }
      this.srcA    = newA
      this.srcB    = null
      this.xfading = false
    }, (XFADE_TIME + 0.06) * 1000)
  }

  // ── RPM / Gear model ────────────────────────────────────────────────────────

  private _kmhToRPM(kmh: number): number {
    const p = this.profile
    if (!p) return 1200

    const gears = p.gears
    if (kmh <= gears[0].maxKmh) return gears[0].minRpm

    let idx = gears.findIndex(g => kmh <= g.maxKmh)
    if (idx < 0) idx = gears.length - 1
    const g       = gears[idx]
    const prevMax = idx > 0 ? gears[idx - 1].maxKmh : 0
    const t       = (kmh - prevMax) / (g.maxKmh - prevMax)
    return Math.max(p.idleRPM, Math.min(p.redlineRPM, g.minRpm + t * (g.maxRpm - g.minRpm)))
  }

  private _nearestRPM(rpm: number): number {
    const zones = this.profile?.sampleZones
    if (!zones?.length) return 1200
    let best = zones[0].rpm, bestD = Math.abs(rpm - best)
    for (const z of zones) {
      const d = Math.abs(rpm - z.rpm)
      if (d < bestD) { bestD = d; best = z.rpm }
    }
    return best
  }

  private _cleanup(): void {
    this.ctx = null
    this.masterGain = null
    this.srcA = null
    this.srcB = null
  }
}

// ── Singleton ─────────────────────────────────────────────────────────────────
export const muscleCarEngine = new SampleEngine('/engine-packs/muscle-car')
