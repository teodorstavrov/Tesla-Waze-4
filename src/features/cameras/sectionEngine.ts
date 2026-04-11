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
import type { SpeedSection, SectionSession } from './sectionTypes'
import type { GpsPosition } from '@/features/gps/types'

// ── Constants ─────────────────────────────────────────────────────────

const ENTRY_M         = 150   // enter section when within 150m of start camera
const EXIT_M          = 150   // exit section when within 150m of end camera
const PREWARN_M       = 2000  // show approach warning when 2km from start
const NEARBY_KM       = 10    // only process sections within 10km (pre-filter)
const WARN_COOLDOWN_S = 30    // re-warn at most every 30s if still over limit
const MIN_SPEED_KMH   = 5     // ignore GPS noise below 5 km/h

// ── State ─────────────────────────────────────────────────────────────

export interface SectionState {
  session:  SectionSession | null   // active section, or null if none
  lastExit: {                       // result of last completed section
    section: SpeedSection
    avgKmh:  number
    limitKmh: number
  } | null
  preWarn: {                        // approaching a section (within PREWARN_M)
    section: SpeedSection
    distM:   number
  } | null
}

let _state: SectionState = { session: null, lastExit: null, preWarn: null }

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
  const now = pos.timestamp

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
      if (step < 200) {
        sess.distM += step
      }
    }

    // Rolling avg speed: use elapsed time + GPS-accumulated distance
    const elapsedS = (now - sess.enteredAt) / 1000
    if (elapsedS > 2) {
      const effectiveDist = Math.max(sess.distM, 1)
      const rawAvg = (effectiveDist / elapsedS) * 3.6
      // EMA smoothing to reduce GPS noise oscillation
      _emaAvg = _emaAvg === null ? rawAvg : _emaAvg + EMA_ALPHA * (rawAvg - _emaAvg)
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

      _emaAvg = null   // reset EMA for next section
      _lastEmittedAvg = -1; _lastEmittedDistBkt = -1; _lastEmittedWarned = false
      _state = {
        session:  null,
        preWarn:  null,
        lastExit: {
          section:  sess.section,
          avgKmh:   finalAvg,
          limitKmh: sess.section.limitKmh,
        },
      }
      _prevPos = pos
      _emit()

      // Clear lastExit after 15s so card disappears
      setTimeout(() => {
        _state = { ..._state, lastExit: null }
        _emit()
      }, 15_000)

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
          enteredAt: now,
          distM:     0,
          avgKmh:    0,
          warned:    false,
        },
        lastExit: null,
        preWarn:  null,
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
