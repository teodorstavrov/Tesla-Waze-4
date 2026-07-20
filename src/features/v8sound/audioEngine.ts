// ─── Real-audio Engine Sound Player ──────────────────────────────────────
//
// Plays a pre-recorded engine MP3 in a loop and adjusts playback rate
// based on live GPS speed, simulating RPM changes (pitch + tempo shift).
//
// Speed → 6-gear RPM simulation → rate = RPM / baseRpm
// The baseRpm is tuned per recording so rate=1.0 sounds most natural
// at typical driving speeds.

import { gpsStore } from '@/features/gps/gpsStore'

// ── Types (duplicated from v8Engine.ts to keep files independent) ─────────

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

// ── Gear maps ─────────────────────────────────────────────────────────────

// Open Header V8: big raw engine, wide gear bands
const HEADER_GEARS: ReadonlyArray<GearBand> = [
  { maxKmh:   5, minRpm:  700, maxRpm:  700 },
  { maxKmh:  40, minRpm:  750, maxRpm: 4000 },
  { maxKmh:  70, minRpm: 1100, maxRpm: 3800 },
  { maxKmh: 100, minRpm: 1100, maxRpm: 3800 },
  { maxKmh: 135, minRpm: 1100, maxRpm: 4000 },
  { maxKmh: 170, minRpm: 1400, maxRpm: 4500 },
  { maxKmh: 999, minRpm: 1700, maxRpm: 5500 },
]

// S63 AMG V8 Biturbo: high-revving, sport-oriented
const S63_GEARS: ReadonlyArray<GearBand> = [
  { maxKmh:   5, minRpm:  750, maxRpm:  750 },
  { maxKmh:  35, minRpm:  900, maxRpm: 5000 },
  { maxKmh:  60, minRpm: 1400, maxRpm: 4500 },
  { maxKmh:  90, minRpm: 1400, maxRpm: 4500 },
  { maxKmh: 120, minRpm: 1400, maxRpm: 4500 },
  { maxKmh: 155, minRpm: 1700, maxRpm: 5000 },
  { maxKmh: 999, minRpm: 2000, maxRpm: 6500 },
]

// ── Engine class ──────────────────────────────────────────────────────────

export class AudioEngine {
  private ctx:      AudioContext | null          = null
  private src:      AudioBufferSourceNode | null = null
  private gainNode: GainNode | null              = null
  private _running  = false
  private _loading  = false
  private unsubGps: (() => void) | null          = null
  private onLoadChange: (() => void) | null      = null

  constructor(
    private readonly url:     string,
    private readonly baseRpm: number,
    private readonly gears:   ReadonlyArray<GearBand>,
    private readonly volume:  number = 0.85,
  ) {}

  get isRunning():  boolean { return this._running  }
  get isLoading():  boolean { return this._loading  }

  /** Subscribe to loading state changes for UI updates. */
  onLoading(fn: () => void): () => void {
    this.onLoadChange = fn
    return () => { this.onLoadChange = null }
  }

  /** Must be called from a user-gesture handler (onClick). */
  async start(): Promise<void> {
    if (this._running || this._loading) return
    this._loading = true
    this.onLoadChange?.()

    try {
      this.ctx = new AudioContext()
      // Tesla Chromium may suspend AudioContext even inside gesture handler.
      void this.ctx.resume()

      const res      = await fetch(this.url)
      const arrayBuf = await res.arrayBuffer()
      const buffer   = await this.ctx.decodeAudioData(arrayBuf)

      // Source node — loop the entire clip
      this.src             = this.ctx.createBufferSource()
      this.src.buffer      = buffer
      this.src.loop        = true
      this.src.playbackRate.value = this._kmhToRate(gpsStore.getPosition()?.speedKmh ?? 0)

      this.gainNode = this.ctx.createGain()
      this.gainNode.gain.value = 0

      this.src.connect(this.gainNode)
      this.gainNode.connect(this.ctx.destination)
      this.src.start()

      this.gainNode.gain.setTargetAtTime(this.volume, this.ctx.currentTime, 0.3)
      this._running = true

      // Subscribe to live speed updates
      this.unsubGps = gpsStore.onPosition((pos) => {
        if (pos?.speedKmh != null) this._updateRate(pos.speedKmh)
      })
    } catch {
      // Fetch or decode failed — clean up silently
      void this.ctx?.close()
      this.ctx = null
    } finally {
      this._loading = false
      this.onLoadChange?.()
    }
  }

  stop(): void {
    if (!this._running) return
    this._running = false
    this.unsubGps?.(); this.unsubGps = null

    if (this.gainNode && this.ctx) {
      this.gainNode.gain.setTargetAtTime(0, this.ctx.currentTime, 0.22)
    }
    const ctx = this.ctx; const src = this.src
    setTimeout(() => {
      try { src?.stop() } catch { /* already stopped */ }
      void ctx?.close()
    }, 700)
    this.ctx = null; this.src = null; this.gainNode = null
  }

  private _kmhToRate(kmh: number): number {
    const rpm = speedToRpm(kmh, this.gears)
    // Clamp to audibly useful range
    return Math.max(0.3, Math.min(3.0, rpm / this.baseRpm))
  }

  private _updateRate(kmh: number): void {
    if (!this.ctx || !this.src) return
    this.src.playbackRate.setTargetAtTime(this._kmhToRate(kmh), this.ctx.currentTime, 0.38)
  }
}

// ── Exported singletons ───────────────────────────────────────────────────

// baseRpm: the RPM at which playbackRate=1.0 sounds most natural for that recording.
// Open header recordings typically have a mid-rev baseline around 1400 RPM.
export const v8HeaderEngine = new AudioEngine(
  '/engine-sounds/open-header-v8.mp3',
  1400,
  HEADER_GEARS,
  0.90,
)

// S63 AMG is a high-strung twin-turbo V8; recording sounds lively around 2000 RPM.
export const v8S63Engine = new AudioEngine(
  '/engine-sounds/s63-amg-v8.mp3',
  2000,
  S63_GEARS,
  0.88,
)
