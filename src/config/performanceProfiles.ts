// ─── Vehicle Performance Profiles ──────────────────────────────────────────
// Centralized config for rendering intensity. One object per profile —
// no scattered AMD / Intel checks across component files.
//
// Profile hierarchy (lightest → heaviest):
//   tesla_intel_legacy  — MCU1/MCU2 Intel Atom — most constrained
//   tesla_amd_lite      — AMD Ryzen (2021+ Model 3/Y) — fast CPU, weaker GPU
//   auto / normal       — balanced default
//   high_performance    — desktop / non-Tesla browser

export type PerformanceMode =
  | 'auto'
  | 'normal'
  | 'tesla_intel_legacy'
  | 'tesla_amd_lite'
  | 'high_performance'

export interface PerformanceProfile {
  id: PerformanceMode

  // ── Tile layer ──────────────────────────────────────────────────────────
  /** Extra tile columns/rows to keep loaded outside viewport (Leaflet keepBuffer).
   *  Higher → smoother pan; lower → less GPU memory pressure. */
  tileKeepBuffer: number
  /** Only request new tiles after pan/zoom fully settles — reduces tile-load
   *  pressure during movement, key to avoiding AMD checkerboard. */
  tileUpdateWhenIdle: boolean
  /** Request tiles while a zoom animation is running. */
  tileUpdateWhenZooming: boolean
  /** Cross-fade between tile layers on theme/satellite switch. */
  tileFadeAnimation: boolean

  // ── Map movement ────────────────────────────────────────────────────────
  /** Animate the GPS-follow pan (smooth vs instant). */
  panAnimate: boolean
  /** Debounce (ms) between moveend event and events/EV station fetch. */
  mapMoveDebounceMs: number

  // ── Course-up rotation ──────────────────────────────────────────────────
  /** Minimum heading change (°) that triggers a CSS rotation write.
   *  Higher = fewer redundant style mutations per GPS tick. */
  rotationThresholdDeg: number

  // ── Overlays ────────────────────────────────────────────────────────────
  /** Allow backdrop-filter blur on .glass panels and .icon-btn.
   *  Disabling eliminates GPU compositing layer rebuilds on panel mount. */
  useOverlayBlur: boolean

  // ── Markers ─────────────────────────────────────────────────────────────
  /** CSS pulse animation on newly-reported event markers. */
  useMarkerAnimations: boolean

  // ── Refresh debounces ───────────────────────────────────────────────────
  evDebounceMs: number
  cameraDebounceMs: number
}

// ── Profile definitions ─────────────────────────────────────────────────────

const _profiles: Record<PerformanceMode, PerformanceProfile> = {
  auto: {
    id:                    'auto',
    tileKeepBuffer:        4,
    tileUpdateWhenIdle:    false,
    tileUpdateWhenZooming: false,
    tileFadeAnimation:     true,
    panAnimate:            true,
    mapMoveDebounceMs:     400,
    rotationThresholdDeg:  0.8,
    useOverlayBlur:        true,
    useMarkerAnimations:   true,
    evDebounceMs:          400,
    cameraDebounceMs:      200,
  },
  normal: {
    id:                    'normal',
    tileKeepBuffer:        4,
    tileUpdateWhenIdle:    false,
    tileUpdateWhenZooming: false,
    tileFadeAnimation:     true,
    panAnimate:            true,
    mapMoveDebounceMs:     400,
    rotationThresholdDeg:  0.8,
    useOverlayBlur:        true,
    useMarkerAnimations:   true,
    evDebounceMs:          400,
    cameraDebounceMs:      200,
  },
  tesla_intel_legacy: {
    id:                    'tesla_intel_legacy',
    tileKeepBuffer:        1,
    tileUpdateWhenIdle:    true,
    tileUpdateWhenZooming: false,
    tileFadeAnimation:     false,
    panAnimate:            false,
    mapMoveDebounceMs:     700,
    rotationThresholdDeg:  2.5,
    useOverlayBlur:        false,
    useMarkerAnimations:   false,
    evDebounceMs:          700,
    cameraDebounceMs:      500,
  },
  tesla_amd_lite: {
    id:                    'tesla_amd_lite',
    // Reduced buffer: fewer tiles in DOM → less compositor memory pressure
    tileKeepBuffer:        2,
    // Wait until movement ends before loading new tiles —
    // eliminates mid-pan tile-request bursts that cause checkerboard on AMD
    tileUpdateWhenIdle:    true,
    tileUpdateWhenZooming: false,
    // No cross-fade: avoids double-layer opacity animation during theme switch
    tileFadeAnimation:     false,
    // Instant pan: eliminates the 500ms animation window where tile loads
    // overlap with the Leaflet pan transition (main source of AMD jitter)
    panAnimate:            false,
    // Longer debounce: let the user settle before firing backend fetches
    mapMoveDebounceMs:     600,
    // Higher rotation threshold: fewer CSS style mutations per GPS tick
    rotationThresholdDeg:  2.0,
    // No blur: eliminates backdrop-filter compositor layer rebuild on panel mount
    useOverlayBlur:        false,
    // No pulse animation: CSS @keyframes on markers trigger paint/composite
    useMarkerAnimations:   false,
    evDebounceMs:          600,
    cameraDebounceMs:      400,
  },
  high_performance: {
    id:                    'high_performance',
    tileKeepBuffer:        6,
    tileUpdateWhenIdle:    false,
    tileUpdateWhenZooming: true,
    tileFadeAnimation:     true,
    panAnimate:            true,
    mapMoveDebounceMs:     200,
    rotationThresholdDeg:  0.3,
    useOverlayBlur:        true,
    useMarkerAnimations:   true,
    evDebounceMs:          200,
    cameraDebounceMs:      120,
  },
}

// ── Helpers ─────────────────────────────────────────────────────────────────

const _SETTINGS_KEY = 'teslaradar:settings'

/** Read the active performance profile synchronously from localStorage.
 *  Safe to call outside React — zero imports, no circular deps. */
export function getActivePerformanceProfile(): PerformanceProfile {
  try {
    const raw = localStorage.getItem(_SETTINGS_KEY)
    if (raw) {
      const s = JSON.parse(raw) as { performanceMode?: PerformanceMode }
      if (s.performanceMode && s.performanceMode in _profiles) {
        return _profiles[s.performanceMode]
      }
    }
  } catch { /* ignore */ }
  return _profiles.auto
}

export function isAmdLiteMode(): boolean {
  return getActivePerformanceProfile().id === 'tesla_amd_lite'
}

export function shouldUseFlatOverlayMode(): boolean {
  return !getActivePerformanceProfile().useOverlayBlur
}

export function getMapTileOptionsForProfile(
  p: PerformanceProfile,
): { keepBuffer: number; updateWhenIdle: boolean; updateWhenZooming: boolean } {
  return {
    keepBuffer:        p.tileKeepBuffer,
    updateWhenIdle:    p.tileUpdateWhenIdle,
    updateWhenZooming: p.tileUpdateWhenZooming,
  }
}

export { _profiles as ALL_PROFILES }
