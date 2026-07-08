// ─── Average Speed Section Engine ─────────────────────────────────────
//
// Runs outside React — subscribes directly to gpsStore.onPosition.
// Per GPS tick:
//   1. Pre-filter sections to those within 10km (cheap bbox check first).
//   2. For each candidate: check if within ENTRY_M of start or EXIT_M of end.
//   3. On zone entry: record timestamp, start accumulating GPS distance.
//   4. On zone exit: compute final avg speed, fire exit toast.
//   5. During section: update avgKmh and fire warning if exceeded.
//
// State is exposed via sectionStore (pub/sub, no React).
// React components subscribe with useSyncExternalStore.

import { gpsStore } from '@/features/gps/gpsStore'
import { haversineMeters } from '@/lib/geo'
import { isTeslaBrowser } from '@/lib/browser'
import { audioManager } from '@/features/audio/audioManager'
import { getSectionsForCountry } from './sections'
import { countryStore } from '@/lib/countryStore'
import type { SpeedSection, SectionSession, SectionExit } from './sectionTypes'
import type { GpsPosition } from '@/features/gps/types'

// ── Constants ─────────────────────────────────────────────────────────

const ENTRY_M         = 350   // enter section when within 350m of start camera
const EXIT_M          = 200   // exit section when within 200m of end camera
const PREWARN_M       = 2000  // show approach warning when 2km from start
const NEARBY_KM       = 10    // only process sections within 10km (pre-filter)
const WARN_COOLDOWN_S = 30    // re-warn at most every 30s if still over limit
const MIN_SPEED_KMH   = 5     // ignore GPS noise below 5 km/h

// ── State ─────────────────────────────────────────────────────────────

export interface SectionState {
  session:  SectionSession | null   // active section, or null if none
  lastExit: SectionExit | null      // most recent exit — cleared after 15s (brief notification)
  preWarn: {                        // approaching a section (within PREWARN_M)
    section: SpeedSection
    distM:   number
  } | null
  history:  SectionExit[]           // all completed sections this session (never auto-cleared)
}

let _state: SectionState = { session: null, lastExit: null, preWarn: null, history: [] }

type Listener = () => void
const _listeners = new Set<Listener>()

function _emit(): void {
  _listeners.forEach((fn) => fn())
}

export const sectionStore = {
  getState: (): Readonly<SectionState> => _state,
  subscribe(fn: Listener): () => void {
    _listeners.add(fn)
    return () => { _listeners.delete(fn) }
  },
  clearHistory(): void {
    _state = { ..._state, history: [], lastExit: null }
    _emit()
  },
}

// ── Prev position (for GPS distance accumulation) ─────────────────────

let _prevPos: GpsPosition | null = null
let _lastWarnAt = 0
// sectionId → true once pre-warn fired; reset when driver exits PREWARN_M zone
const _preWarnedIds = new Set<string>()

// ── Jitter-reduction helpers ───────────────────────────────────────────
// Track last emitted values so we skip pointless re-renders
let _lastEmittedAvg      = -1
let _lastEmittedDistBkt  = -1  // Math.floor(distM / 30) — bucket per 30m
let _lastEmittedWarned   = false

// Exponential moving average for avgKmh (α=0.35) — smooths GPS noise
let _emaAvg: number | null = null
const EMA_ALPHA = 0.35

// ── Engine ────────────────────────────────────────────────────────────

function _onPosition(pos: GpsPosition): void {
  // Use wall-clock time, not pos.timestamp — GPS timestamps can be in seconds
  // on some WebKit builds (Tesla browser), making elapsedS always ~0.001 and
  // breaking the avgKmh calculation entirely.
  const now = Date.now()

  // ── Active session: update distance + avg speed ──────────────────
  if (_state.session) {
    const sess = _state.session

    // Accumulate GPS distance (metres driven since entry)
    if (_prevPos) {
      const step = haversineMeters(
        [_prevPos.lat, _prevPos.lng],
        [pos.lat, pos.lng],
      )
      // Only add if it looks like actual movement (< 200m per tick avoids teleport)
      if (step > 0 && step < 200) {
        sess.distM += step
      }
    }

    // Rolling avg speed: distance accumulated / elapsed time
    const elapsedS = (now - sess.enteredAt) / 1000
    if (elapsedS > 2 && sess.distM > 0) {
      const rawAvg = (sess.distM / elapsedS) * 3.6
      // EMA smoothing to reduce GPS noise oscillation
      _emaAvg = _emaAvg === null ? rawAvg : _emaAvg + EMA_ALPHA * (rawAvg - _emaAvg)
      sess.avgKmh = Math.round(_emaAvg)
    } else if (sess.avgKmh === 0 && pos.speedKmh !== null && pos.speedKmh > 0) {
      // Fallback for first few seconds: GPS instantaneous speed until
      // distance-based average stabilises (avoids showing 0 on entry)
      _emaAvg = _emaAvg === null ? pos.speedKmh : _emaAvg + EMA_ALPHA * (pos.speedKmh - _emaAvg)
      sess.avgKmh = Math.round(_emaAvg)
    }

    // Over-limit warning (throttled)
    if (
      sess.avgKmh > sess.section.limitKmh &&
      !isTeslaBrowser &&
      now - _lastWarnAt > WARN_COOLDOWN_S * 1000
    ) {
      _lastWarnAt = now
      sess.warned = true
      audioManager.beep(1000, 120)
    }

    // ── Check exit ───────────────────────────────────────────────────
    const distToEnd = haversineMeters(
      [pos.lat, pos.lng],
      [sess.section.endLat, sess.section.endLng],
    )

    if (distToEnd <= EXIT_M) {
      // Finalise: compute avg speed from section road length
      const elapsedFinalS = (now - sess.enteredAt) / 1000
      const finalAvg = elapsedFinalS > 0
        ? Math.round((sess.section.lengthM / elapsedFinalS) * 3.6)
        : sess.avgKmh

      // Beep on exit — higher pitch if OK, lower if violation
      const exitOk = finalAvg <= sess.section.limitKmh
      audioManager.beep(exitOk ? 880 : 440, exitOk ? 160 : 280)

      _emaAvg = null   // reset EMA for next section
      _lastEmittedAvg = -1; _lastEmittedDistBkt = -1; _lastEmittedWarned = false
      const exitEntry: SectionExit = {
        section:   sess.section,
        avgKmh:    finalAvg,
        limitKmh:  sess.section.limitKmh,
        timestamp: now,
      }
      _state = {
        session:  null,
        preWarn:  null,
        lastExit: exitEntry,
        history:  [..._state.history, exitEntry],
      }
      _prevPos = pos
      _emit()

      // Clear lastExit after 20s — history bar is the persistent record
      setTimeout(() => {
        _state = { ..._state, lastExit: null }
        _emit()
      }, 20_000)

      return
    }

    // Only emit when something visually meaningful changed (reduces re-renders)
    const distBkt = Math.floor(sess.distM / 30)
    if (
      sess.avgKmh !== _lastEmittedAvg ||
      distBkt     !== _lastEmittedDistBkt ||
      sess.warned  !== _lastEmittedWarned
    ) {
      _lastEmittedAvg     = sess.avgKmh
      _lastEmittedDistBkt = distBkt
      _lastEmittedWarned  = sess.warned
      _state = { ..._state }
      _emit()
    }

    _prevPos = pos
    return
  }

  // ── No active session: check for entry or approach ──────────────────

  // Skip if moving too slowly (parked, GPS drift)
  if ((pos.speedKmh ?? 0) < MIN_SPEED_KMH) {
    _prevPos = pos
    return
  }

  // Pre-filter by 10km bounding box (avoids O(n) haversine calls in open country)
  const LAT_DEG_PER_KM = 1 / 111
  const LNG_DEG_PER_KM = 1 / (111 * Math.cos((pos.lat * Math.PI) / 180))
  const latDelta = NEARBY_KM * LAT_DEG_PER_KM
  const lngDelta = NEARBY_KM * LNG_DEG_PER_KM

  const SPEED_SECTIONS = getSectionsForCountry(countryStore.getCode() ?? 'BG')
  const nearby = SPEED_SECTIONS.filter(
    (s) =>
      Math.abs(s.startLat - pos.lat) < latDelta &&
      Math.abs(s.startLng - pos.lng) < lngDelta,
  )

  let closestPreWarn: { section: SpeedSection; distM: number } | null = null

  for (const section of nearby) {
    const distToStart = haversineMeters(
      [pos.lat, pos.lng],
      [section.startLat, section.startLng],
    )

    // ── Zone entry ──────────────────────────────────────────────────
    if (distToStart <= ENTRY_M) {
      _preWarnedIds.delete(section.id)   // reset so next approach works
      _emaAvg = null   // fresh EMA for this section
      _lastEmittedAvg = -1; _lastEmittedDistBkt = -1; _lastEmittedWarned = false
      _state = {
        session: {
          section,
          enteredAt: Date.now(),  // wall clock — consistent with how elapsed time is measured
          distM:     0,
          avgKmh:    0,
          warned:    false,
        },
        lastExit: null,
        preWarn:  null,
        history:  _state.history,
      }
      _prevPos = pos
      _emit()
      audioManager.beep(660, 100)
      return
    }

    // ── Approach warning (2km) ──────────────────────────────────────
    if (distToStart <= PREWARN_M) {
      // Reset pre-warn tracking when driver moves away (> PREWARN_M)
      // so next approach fires again — handled below by absence in nearby

      if (!_preWarnedIds.has(section.id)) {
        _preWarnedIds.add(section.id)
        audioManager.beep(550, 80)
      }

      // Track closest section for the card (update every tick)
      if (!closestPreWarn || distToStart < closestPreWarn.distM) {
        closestPreWarn = { section, distM: Math.round(distToStart) }
      }
    } else {
      // Driver is beyond PREWARN_M for this section — reset so it warns again next time
      _preWarnedIds.delete(section.id)
    }
  }

  // Remove sections that left the nearby list from the preWarn set
  // (handles the case where driver drives past without entering)
  const nearbyIds = new Set(nearby.map((s) => s.id))
  for (const id of _preWarnedIds) {
    if (!nearbyIds.has(id)) _preWarnedIds.delete(id)
  }

  // Update preWarn state (null if no section in approach range)
  const newPreWarn = closestPreWarn ?? null
  const changed =
    newPreWarn?.section.id !== _state.preWarn?.section.id ||
    Math.abs((newPreWarn?.distM ?? 0) - (_state.preWarn?.distM ?? 0)) >= 50

  if (changed) {
    _state = { ..._state, preWarn: newPreWarn }
    _emit()
  }

  _prevPos = pos
}

// ── Public API ────────────────────────────────────────────────────────

let _unsub: (() => void) | null = null

export const sectionEngine = {
  start(): void {
    if (_unsub) return
    _unsub = gpsStore.onPosition(_onPosition)
  },
  stop(): void {
    _unsub?.()
    _unsub = null
    _prevPos = null
  },
}
