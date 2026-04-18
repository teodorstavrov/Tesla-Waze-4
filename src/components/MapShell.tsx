// ─── MapShell ─────────────────────────────────────────────────────────
//
// Owns the Leaflet map instance and wires together:
//  • tile layer (reacts to theme/satellite changes)
//  • follow mode (disables on user drag, pans on GPS when following)
//
// IMPORTANT: mapInstance is module-level, not React state.
// Putting a Leaflet map in React state would cause the map to be
// destroyed and recreated on every render — catastrophic for Tesla.
// The module-level singleton is accessed via getMap() by other modules
// (ZoomControls, HeadingAvatar, LocationButton).
//
// HMR SAFETY
// ──────────────────────────────────────────────────────────────────────
// In Vite dev mode, HMR replaces the module, resetting all module-level
// `let` variables to their initial values (null). But the Leaflet map
// instance lives in the DOM and cannot be re-initialized on the same
// container. We use import.meta.hot.dispose / import.meta.hot.data to
// carry the singletons across hot-reload boundaries without destroying
// the live map.

import { useEffect, useRef } from 'react'
import { L } from '@/lib/leaflet'
import { logger } from '@/lib/logger'
import {
  MIN_ZOOM, MAX_ZOOM,
  TILE_DARK, TILE_LIGHT, TILE_VOYAGER, TILE_VOYAGER_DARK, TILE_SATELLITE,
  TILE_ATTRIBUTION, TILE_SATELLITE_ATTRIBUTION,
} from '@/lib/constants'
import { countryStore } from '@/lib/countryStore'
import { useThemeStore } from '@/features/theme/store'
import { followStore } from '@/features/follow/followStore'
import { gpsStore } from '@/features/gps/gpsStore'
import { routeStore } from '@/features/route/routeStore'
import { savedPlacesStore } from '@/features/places/savedPlacesStore'
import { settingsStore } from '@/features/settings/settingsStore'
import { isTeslaBrowser } from '@/lib/browser'
import { t } from '@/lib/locale'

// ── Course-up (heading-up) map rotation helpers ───────────────────
// When navigating, the map rotates so the direction of travel is always
// "up" on screen. The HeadingAvatar arrow rotates by +heading, which
// combined with the map's -heading CSS rotation cancels to 0° — always
// pointing up on screen.
//
// CONTINUOUS ROTATION: We track the accumulated rotation value instead
// of raw heading (0-360). This ensures we always take the shortest path:
// heading 350°→10° rotates +20°, not -340°. Without this, the CSS
// transition would spin the map the wrong way around.
//
// DYNAMIC SCALE: scale(1.42) = √2 only covers square screens.
// For rectangular screens (e.g. Tesla Model 3: 1920×1200) the required
// scale is hypot(W,H)/min(W,H) ≈ 1.887. We compute this once at startup
// and on resize (debounced) — never per GPS tick.

let _rotationDeg = 0  // accumulated, unbounded (can exceed 360)
let _lastWrittenTransform = ''  // dedup: skip style.transform write when value unchanged
let _lastCounterScale = ''      // dedup: skip --marker-counter-scale write when value unchanged
let _geocodeTimer: ReturnType<typeof setTimeout> | null = null  // debounce Nominatim requests

// ── Scale computation ─────────────────────────────────────────────
// Cached module-level — zero cost per GPS tick.
// scale = hypot(W,H) / min(W,H) × 1.02 safety margin
// Clamped to 2.2 to avoid extreme over-zoom on ultra-wide screens.
const MAX_SCALE = 2.2
const SCALE_MARGIN = 1.02

function computeMapScale(): number {
  const w = window.innerWidth
  const h = window.innerHeight
  const raw = Math.hypot(w, h) / Math.min(w, h)
  return Math.min(raw * SCALE_MARGIN, MAX_SCALE)
}

let _mapScale = computeMapScale()

// Debounced resize — recompute scale on orientation change / window resize.
// Runs outside React — no re-renders, no layout thrash per GPS tick.
let _resizeTimer: ReturnType<typeof setTimeout> | null = null
window.addEventListener('resize', () => {
  if (_resizeTimer) clearTimeout(_resizeTimer)
  _resizeTimer = setTimeout(() => { _mapScale = computeMapScale() }, 200)
}, { passive: true })

// ── Zoom compensation ─────────────────────────────────────────────
// scale(~1.924) makes tiles appear ~1 zoom level higher than reality.
// We compensate by zooming Leaflet out by exactly 1 level on entry,
// and restoring on exit. This keeps perceived zoom = normal mode.
// log2(1.924) ≈ 0.944 ≈ 1 level — constant offset works for all screens.
let _courseUpActive = false
let _savedZoom: number | null = null

// ── Perspective navigation (lookahead pan) ────────────────────────────
// During active navigation + course-up, pan to a point N meters ahead of
// the car instead of the car's exact position. This places the avatar in
// the lower portion of the viewport (~65% from top) so more road ahead
// is visible — the essential "navigation camera" feel.
//
// HOW IT WORKS:
//   Normal follow: map.panTo([car.lat, car.lng]) → car appears at 50% / 50%.
//   Perspective:   map.panTo(lookahead) → lookahead at 50%; car at ~65%.
//
// SCALE COMPENSATION:
//   Course-up adds CSS scale(~1.887) to the map container. A displacement of
//   N Leaflet pixels translates to N × scale visual pixels on screen. Dividing
//   the desired visual fraction by _mapScale undoes the amplification so the
//   car ends up at PERSPECTIVE_VISUAL_FRACTION below center visually.
//
// COST:
//   Two cheap trig ops per GPS tick (same as existing haversineM helper).
//   No DOM work, no extra elements, no layout reflow. Pure Leaflet panTo.
//
// ACTIVE ONLY WHEN:
//   - routeStore mode === 'navigating'  (not preview, not idle)
//   - headingMode === 'course-up'
//   - GPS heading is known
//   Otherwise falls back to normal centered follow.

/** Fraction of screen height the car should sit BELOW center (visual pixels). */
const PERSPECTIVE_VISUAL_FRACTION = 0.15  // car at ~65% from top (50% + 15%)

/**
 * Compute how many meters ahead of the car to center the map,
 * so the car appears PERSPECTIVE_VISUAL_FRACTION below center visually.
 * Accounts for CSS scale already applied to the map container.
 */
function _lookaheadMeters(lat: number, zoom: number): number {
  const metersPerLeafletPx =
    (156543.03392 * Math.cos(lat * Math.PI / 180)) / Math.pow(2, zoom)
  // Desired visual offset → Leaflet pixel offset (undo CSS scale effect)
  const lookaheadLeafletPx =
    (window.innerHeight * PERSPECTIVE_VISUAL_FRACTION) / _mapScale
  return lookaheadLeafletPx * metersPerLeafletPx
}

/**
 * Return a lat/lng that is `meters` ahead of [lat, lng] in `heading` direction.
 * Pure equirectangular approximation — accurate enough at navigation scale.
 */
function _offsetInHeading(
  lat: number, lng: number, heading: number, meters: number,
): [number, number] {
  const R      = 6371000
  const hdgRad = (heading * Math.PI) / 180
  const latRad = (lat * Math.PI) / 180
  const dLat   = (meters * Math.cos(hdgRad)) / R
  const dLng   = (meters * Math.sin(hdgRad)) / (R * Math.cos(latRad))
  return [lat + (dLat * 180) / Math.PI, lng + (dLng * 180) / Math.PI]
}

function _applyCourseUp(container: HTMLElement, heading: number): void {
  // On first entry: save zoom and compensate for the CSS scale visual zoom
  if (!_courseUpActive && mapInstance) {
    _courseUpActive = true
    _savedZoom = mapInstance.getZoom()
    mapInstance.setZoom(
      Math.max(mapInstance.getMinZoom(), _savedZoom - 1),
      { animate: false }
    )
  }

  // Compute shortest-path delta from current accumulated rotation
  const target = heading  // 0-360
  const current = ((_rotationDeg % 360) + 360) % 360  // normalize to 0-360
  let delta = target - current
  if (delta > 180)  delta -= 360  // e.g. 350→10: delta = -340 → +20
  if (delta < -180) delta += 360  // e.g. 10→350: delta = 340 → -20

  // Tesla: skip style mutation when heading change is negligible (< 0.8°).
  // Redundant style.transform writes trigger style-recalc cycles even when the
  // computed value is identical — at highway speed on a straight road this fires
  // 1×/sec for a zero-change rotation, competing with tile load rasterization.
  // Non-Tesla keeps full precision for smooth animated rotation.
  if (isTeslaBrowser && Math.abs(delta) < 0.8) {
    // Still need to apply transformOrigin on first call
    if (!_lastWrittenTransform) container.style.transformOrigin = '50% 50%'
    return
  }

  _rotationDeg += delta

  const newTransform = `translateZ(0) rotate(${-_rotationDeg}deg) scale(${_mapScale})`
  // Dedup: only write to DOM if value actually changed
  if (newTransform !== _lastWrittenTransform) {
    _lastWrittenTransform = newTransform
    container.style.transform = newTransform
    container.style.transformOrigin = '50% 50%'
    // Keep CSS counter-scale in sync — marker inner divs read this variable
    // via .marker-scale-wrap to cancel the map container's CSS scale enlargement.
    // Deduplicated: _mapScale only changes on resize, so the value is almost always
    // identical between calls. Skipping redundant setProperty avoids style invalidation.
    const counterScaleStr = (1 / _mapScale).toFixed(6)
    if (counterScaleStr !== _lastCounterScale) {
      _lastCounterScale = counterScaleStr
      container.style.setProperty('--marker-counter-scale', counterScaleStr)
    }
  }
}

function _clearCourseUp(container: HTMLElement): void {
  if (_courseUpActive && mapInstance && _savedZoom !== null) {
    mapInstance.setZoom(_savedZoom, { animate: false })
  }
  _courseUpActive = false
  _savedZoom = null
  _rotationDeg = 0
  _lastWrittenTransform = ''
  _lastCounterScale = ''
  container.style.removeProperty('--marker-counter-scale')
  if (container.style.transform) {
    container.style.transform = 'translateZ(0)'
    container.style.transformOrigin = ''
  }
}

// ── HMR-safe module-level singletons ──────────────────────────────
// On cold start: null. On HMR reload: recovered from the previous
// module's dispose callback so the live map is never destroyed.
type HotData = { mapInstance: L.Map | null; tileLayer: L.TileLayer | null }

let mapInstance: L.Map | null =
  (import.meta.hot?.data as Partial<HotData> | undefined)?.mapInstance ?? null
let tileLayer: L.TileLayer | null =
  (import.meta.hot?.data as Partial<HotData> | undefined)?.tileLayer ?? null

// Save state before this module is replaced by HMR
if (import.meta.hot) {
  import.meta.hot.dispose((data) => {
    (data as HotData).mapInstance = mapInstance
    ;(data as HotData).tileLayer  = tileLayer
  })
}

export function getMap(): L.Map | null { return mapInstance }

/** Returns the CSS scale currently applied to the map container in course-up mode.
 *  HeadingAvatar uses this to apply a reciprocal scale so the avatar stays at its
 *  default visual size regardless of the map container's CSS scale transform. */
export function getCourseUpScale(): number {
  return _courseUpActive ? _mapScale : 1
}

// ─────────────────────────────────────────────────────────────────
export function MapShell() {
  const containerRef = useRef<HTMLDivElement>(null)
  const { theme, mapMode } = useThemeStore()

  // ── Initialize map (runs once per cold start) ─────────────────
  useEffect(() => {
    if (!containerRef.current || mapInstance) return

    // Use the stored country's defaults; fall back to Bulgaria when no
    // country has been chosen yet (CountryPicker will pan after selection).
    const initCountry = countryStore.getCountryOrDefault()

    const map = L.map(containerRef.current, {
      center:              initCountry.center,
      zoom:                initCountry.zoom,
      minZoom:             MIN_ZOOM,
      maxZoom:             MAX_ZOOM,
      zoomControl:         false,  // custom controls provided
      attributionControl:  true,
      // Tesla browser: disable CSS-animated transitions that overwhelm
      // its software compositor and cause visible jitter during zoom/pan.
      fadeAnimation:       !isTeslaBrowser,
      zoomAnimation:       !isTeslaBrowser,  // true on Tesla triggers JS animation machinery even though CSS transition is suppressed
      markerZoomAnimation: !isTeslaBrowser,
      // preferCanvas NOT set: SVG renderer avoids the canvas clear→redraw blank
      // frame that is visible on Tesla's compositor when zooming with course-up
      // CSS scale active. Modern Chromium SVG is efficient enough for route lines.
      tapTolerance:        15,     // generous tap target for Tesla touchscreen
    })

    mapInstance = map

    // Disable follow on user-initiated drag.
    // Course-up is only cleared when NOT actively navigating — during navigation
    // the user may pan to look ahead without wanting to reset the heading rotation
    // and zoom compensation (which would cause a jarring zoom jump).
    map.on('dragstart', () => {
      if (!followStore.isProgrammaticMove()) {
        followStore.setFollowing(false)
        const isNavigating = routeStore.getState().mode === 'navigating'
        if (!isNavigating && containerRef.current) {
          _clearCourseUp(containerRef.current)
        }
        logger.follow.debug('Follow disabled by drag', { isNavigating })
      }
    })

    // Keep _savedZoom in sync when the user manually zooms while in course-up.
    // Without this, exiting course-up after a user zoom restores the stale
    // _savedZoom, snapping the map to the wrong zoom level.
    map.on('zoomend', () => {
      if (_courseUpActive) {
        _savedZoom = map.getZoom() + 1  // +1 undoes the course-up compensation offset
      }
    })

    // ── Long-press → navigate popup ───────────────────────────────
    // Leaflet fires 'contextmenu' on long-press (touch hold ≥ 500ms) and
    // on right-click. Both are valid entry points for "navigate here".
    map.on('contextmenu', (e: L.LeafletMouseEvent) => {
      const { lat, lng } = e.latlng

      const wrap = document.createElement('div')
      wrap.style.cssText = 'display:flex;flex-direction:column;align-items:center;gap:10px;padding:6px 2px'

      const addr = document.createElement('div')
      addr.style.cssText = 'font-size:12px;color:rgba(255,255,255,0.55);text-align:center;line-height:1.4;max-width:220px'
      addr.textContent = `${lat.toFixed(5)}, ${lng.toFixed(5)}`

      const btn = document.createElement('button')
      btn.textContent = t('map.navigate')
      btn.style.cssText = [
        'background:#e31937',
        'color:#fff',
        'border:none',
        'border-radius:10px',
        'padding:13px 32px',
        'font-size:17px',
        'font-weight:800',
        'letter-spacing:0.04em',
        'cursor:pointer',
        'touch-action:manipulation',
        'width:100%',
      ].join(';')

      // ── Place buttons row (Дом / Работа) ─────────────────────────
      const placeRow = document.createElement('div')
      placeRow.style.cssText = 'display:flex;gap:8px;width:100%'

      function makePlaceBtn(emoji: string, color: string, type: 'home' | 'work'): HTMLButtonElement {
        const existing = savedPlacesStore.get(type)
        const isSet = existing !== null
        const b = document.createElement('button')
        const placeLabel = isSet
          ? t(type === 'home' ? 'map.changeHome' : 'map.changeWork')
          : t(type === 'home' ? 'map.home' : 'map.work')
        b.textContent = `${emoji} ${placeLabel}`
        b.style.cssText = [
          `background:${isSet ? color + '33' : 'rgba(255,255,255,0.08)'}`,
          `color:${isSet ? color : 'rgba(255,255,255,0.7)'}`,
          `border:1.5px solid ${isSet ? color + '88' : 'rgba(255,255,255,0.15)'}`,
          'border-radius:10px', 'padding:10px 0',
          'font-size:13px', 'font-weight:700',
          'cursor:pointer', 'touch-action:manipulation', 'flex:1',
        ].join(';')
        b.addEventListener('click', () => {
          const name = addr.textContent ?? `${lat.toFixed(4)}, ${lng.toFixed(4)}`
          savedPlacesStore.set({ type, lat, lng, name })
          map.closePopup()
        })
        return b
      }

      placeRow.appendChild(makePlaceBtn('🏠', '#22c55e', 'home'))
      placeRow.appendChild(makePlaceBtn('💼', '#3b82f6', 'work'))

      wrap.appendChild(addr)
      wrap.appendChild(btn)
      wrap.appendChild(placeRow)

      L.popup({
        className:    'nav-popup',
        closeButton:  true,
        maxWidth:     280,
        offset:       [0, -6],
      })
        .setLatLng(e.latlng)
        .setContent(wrap)
        .openOn(map)

      // Reverse geocode — update address label when response arrives.
      // Debounced: if the user triggers multiple long-presses rapidly (accidental
      // double-tap on Tesla touchscreen) only the most recent fires a network request.
      if (_geocodeTimer) clearTimeout(_geocodeTimer)
      _geocodeTimer = setTimeout(() => {
        _geocodeTimer = null
        const revLang = countryStore.getCountryOrDefault().searchLang
        fetch(`https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=jsonv2&accept-language=${encodeURIComponent(revLang)}`, {
          headers: { 'User-Agent': 'TesRadar/1.0' },
        })
          .then((r) => r.json())
          .then((data: { display_name?: string; address?: { road?: string; suburb?: string; city?: string; town?: string; village?: string } }) => {
            const a = data.address
            const parts: string[] = []
            if (a?.road)    parts.push(a.road)
            if (a?.suburb)  parts.push(a.suburb)
            if (a?.city ?? a?.town ?? a?.village) parts.push((a?.city ?? a?.town ?? a?.village)!)
            addr.textContent = parts.length ? parts.join(', ') : (data.display_name?.split(',').slice(0, 2).join(', ') ?? addr.textContent)
          })
          .catch(() => { /* keep coords */ })
      }, 600)

      let destName = `${lat.toFixed(4)}, ${lng.toFixed(4)}`
      btn.addEventListener('click', () => {
        destName = addr.textContent ?? destName
        map.closePopup()
        void routeStore.navigateTo({ lat, lng, name: destName })
      })
    })

    // GPS → map pan when follow mode is active (pure imperative, no React)
    // Follow is only re-enabled explicitly via the recenter button or startNavigation().

    // Tesla: skip panTo when movement is negligible (<3m) — avoids firing
    // Leaflet map mutations + tile-load cycles for tiny GPS jitter corrections.
    // At standstill or slow speed the GPS noise is ~2-5m; skipping those
    // eliminates ~50% of compositor ops without affecting navigation accuracy.
    let _lastPanLat = 0
    let _lastPanLng = 0
    const PAN_MIN_M = isTeslaBrowser ? 3 : 0
    function _panDistM(a: number, b: number, c: number, d: number): number {
      const R = 6371000
      const dLat = (c - a) * Math.PI / 180
      const dLng = (d - b) * Math.PI / 180
      return R * Math.sqrt(dLat * dLat + dLng * dLng)
    }

    const unsubGps = gpsStore.onPosition((pos) => {
      if (!followStore.isFollowing()) return

      // Tesla: skip panTo if car hasn't moved enough to matter visually
      if (PAN_MIN_M > 0) {
        const moved = _panDistM(pos.lat, pos.lng, _lastPanLat, _lastPanLng)
        if (moved < PAN_MIN_M && (_lastPanLat !== 0 || _lastPanLng !== 0)) {
          // Still process course-up rotation even if we skip the pan
          const container = containerRef.current
          if (container) {
            const courseUp = settingsStore.get().headingMode === 'course-up'
            if (courseUp && pos.heading != null) _applyCourseUp(container, pos.heading)
            else _clearCourseUp(container)
          }
          return
        }
      }
      _lastPanLat = pos.lat
      _lastPanLng = pos.lng

      // Tesla: instant repositioning eliminates the 500ms animation window
      // that causes jitter when panel renders or tile loads overlap the pan.
      // Non-Tesla: keep smooth animated follow (current behavior unchanged).
      const panOptions: L.PanOptions = isTeslaBrowser
        ? { animate: false }
        : { animate: true, duration: 0.5 }
      // ── Course-up rotation ────────────────────────────────────────────────
      // Applied before panTo so _courseUpActive / _mapScale are up to date
      // when we compute the perspective lookahead below.
      const container = containerRef.current
      if (!container) return
      const courseUp = settingsStore.get().headingMode === 'course-up'
      if (courseUp && pos.heading != null) {
        _applyCourseUp(container, pos.heading)
      } else {
        _clearCourseUp(container)
      }

      // ── Perspective navigation pan ────────────────────────────────────────
      // During active navigation + course-up + known heading: pan to a point
      // N meters ahead of the car so the avatar lands at ~65% from screen top.
      // Fallback: standard centered follow (car at screen center).
      const isNavigating = routeStore.getState().mode === 'navigating'
      let panTarget: [number, number] = [pos.lat, pos.lng]
      if (isNavigating && courseUp && pos.heading != null && _courseUpActive) {
        const lm = _lookaheadMeters(pos.lat, map.getZoom())
        panTarget = _offsetInHeading(pos.lat, pos.lng, pos.heading, lm)
      }

      followStore.beginProgrammaticMove()
      map.once('moveend', () => followStore.endProgrammaticMove())
      map.panTo(panTarget, panOptions)
    })

    // React to heading mode changes immediately:
    // - north-up → clear rotation right away
    // - course-up → enable follow so the next GPS tick calls _applyCourseUp.
    //   Without this, _applyCourseUp is unreachable: in route-preview mode
    //   inPreview=true blocks auto-follow, so the GPS handler returns early
    //   and the rotation never fires even though the setting changed.
    const unsubSettings = settingsStore.subscribe(() => {
      const headingMode = settingsStore.get().headingMode
      if (headingMode === 'north-up' && containerRef.current) {
        _clearCourseUp(containerRef.current)
      } else if (headingMode === 'course-up') {
        followStore.setFollowing(true)
      }
    })

    logger.map.info('Map initialized', { country: initCountry.code, center: initCountry.center, zoom: initCountry.zoom })

    return () => {
      unsubGps()
      unsubSettings()
    }
  }, [])

  // ── Update tile layer when theme/satellite changes ────────────
  // Uses a crossfade: new layer starts at opacity 0, fades to 1 via the
  // CSS transition on .leaflet-layer; old layer is removed after 500 ms.
  useEffect(() => {
    if (!mapInstance) return

    const map = mapInstance  // stable local ref for async closures

    const url =
      mapMode === 'satellite'                    ? TILE_SATELLITE
      : mapMode === 'voyager' && theme === 'dark' ? TILE_VOYAGER_DARK
      : mapMode === 'voyager'                     ? TILE_VOYAGER
      : theme === 'dark'                          ? TILE_DARK
      :                                             TILE_LIGHT

    const attribution =
      mapMode === 'satellite' ? TILE_SATELLITE_ATTRIBUTION : TILE_ATTRIBUTION

    const tileOptions = {
      attribution,
      subdomains:        'abcd',
      maxZoom:           MAX_ZOOM,
      keepBuffer:        4,
      updateWhenIdle:    false,
      updateWhenZooming: false,
    }

    if (tileLayer) {
      const prev = tileLayer
      // New layer starts invisible and fades in via CSS transition
      const next = L.tileLayer(url, { ...tileOptions, opacity: 0 }).addTo(map)
      tileLayer = next

      // Double-RAF: browser paints opacity:0 before we trigger the transition
      requestAnimationFrame(() => requestAnimationFrame(() => next.setOpacity(1)))
      setTimeout(() => { if (map.hasLayer(prev)) map.removeLayer(prev) }, 500)
    } else {
      tileLayer = L.tileLayer(url, tileOptions).addTo(map)
    }

    logger.map.debug('Tile updated', { mapMode, theme })
  }, [theme, mapMode])

  // ── Sync data-theme attribute to <html> for CSS custom props ──
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
  }, [theme])

  return (
    <div
      ref={containerRef}
      id="map"
      role="application"
      aria-label="Navigation map"
    />
  )
}
