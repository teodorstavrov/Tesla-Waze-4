// ─── GPS Avatar / Heading Marker ─────────────────────────────────────
//
// Architecture: fixed-position HTML overlay on the map container.
// Avatar stays at a constant CSS coordinate; map pans underneath.
// This eliminates all GPS-to-screen projection errors permanently.
//
// Position formula (north-up, Tesla):
//   topPad = 0 (centered); non-Tesla dev: h * 0.4 for perspective view
//   avatarCenterY = h / 2 + topPad / 2
//
// Bearing pipeline:
//   1. snapToRoute() → nearest forward route segment bearing
//      - Progress tracking: only searches from (currentSegIdx-3) forward
//        so snap never jumps back to already-passed segments
//      - Direction-guard: if bearing >90° off reference, flip 180°
//      - NO EMA on snap bearing — segment bearing is stable within a
//        segment; EMA lag causes the road to appear at an angle in
//        course-up mode (lateral drift)
//   2. Fallback: raw GPS heading with small EMA (alpha=0.2) — noisy
//
// Course-up: MapShell.easeTo(bearing=-navBearing, duration=0).
//            Arrow CSS = 0° always — tip stays at screen-top while the map
//            rotates so the vehicle's direction of travel faces upward.
//            duration=0 is REQUIRED — 500ms animation lag causes lateral drift.
// North-up:  map bearing=0. Arrow CSS = navBearing (direction of travel).
// ─────────────────────────────────────────────────────────────────────

import { useEffect, useRef } from 'react'
import { getMap } from '@/components/MapShell'
import { gpsStore } from '@/features/gps/gpsStore'
import { routeStore } from '@/features/route/routeStore'
import { isTeslaBrowser } from '@/lib/browser'
import { followStore } from '@/features/follow/followStore'
import { settingsStore } from '@/features/settings/settingsStore'
import { bearingDiff, lerpBearing } from '@/lib/bearingUtils'
import type { GpsPosition } from '@/features/gps/types'
import type * as maplibregl from 'maplibre-gl'


// Shared nav state exported for MapShell
let _navBearing: number | null = null
let _navLat:     number | null = null
let _navLng:     number | null = null
export function getNavBearing():  number | null { return _navBearing }
export function getNavPosition(): { lat: number; lng: number } | null {
  return _navLat !== null && _navLng !== null ? { lat: _navLat, lng: _navLng } : null
}

// Route segment progress — advances monotonically so snap never jumps backward.
// Reset to 0 when route polyline reference changes (new route loaded).
let _currentSegmentIdx = 0

const ICON_SIZE   = 76
const SNAP_DIST_M = 60

// ── DOM factory ───────────────────────────────────────────────────────────────

function makeElement(): HTMLDivElement {
  const root = document.createElement('div')
  root.className = 'gps-avatar-root'
  root.style.cssText = [
    `width:${ICON_SIZE}px`,
    `height:${ICON_SIZE}px`,
    'position:absolute',
    'pointer-events:none',
    'z-index:10',
  ].join(';')
  // 3D mirror-chrome arrow in Tesla red (#e31937 — matches the Report button).
  // Mirror effect: alternating light-dark-light bands simulate a polished surface
  // reflecting sky (bright tip) → colour body → horizon (lighter mid-band) → shadow.
  root.innerHTML = `<div class="gps-avatar-arrow" style="transform:rotate(0deg);transform-origin:50% 50%">
    <svg width="${ICON_SIZE}" height="${ICON_SIZE}" viewBox="0 0 28 28" fill="none" aria-hidden="true">
      <defs>
        <!-- Mirror-metallic body gradient: bright tip → red → lighter horizon band → dark base -->
        <linearGradient id="nav-ag" x1="14" y1="3" x2="14" y2="22" gradientUnits="userSpaceOnUse">
          <stop offset="0%"   stop-color="#ffcdd2"/>
          <stop offset="14%"  stop-color="#ff4d5e"/>
          <stop offset="40%"  stop-color="#e31937"/>
          <stop offset="58%"  stop-color="#f0364f"/>
          <stop offset="80%"  stop-color="#8c0d1b"/>
          <stop offset="100%" stop-color="#4a0610"/>
        </linearGradient>
        <!-- Diagonal gloss overlay: bright upper-left → transparent lower-right -->
        <linearGradient id="nav-gl" x1="8" y1="3" x2="20" y2="20" gradientUnits="userSpaceOnUse">
          <stop offset="0%"   stop-color="rgba(255,255,255,0.68)"/>
          <stop offset="38%"  stop-color="rgba(255,255,255,0.22)"/>
          <stop offset="70%"  stop-color="rgba(255,255,255,0.04)"/>
          <stop offset="100%" stop-color="rgba(255,255,255,0)"/>
        </linearGradient>
        <!-- Red-tinted drop shadow -->
        <filter id="nav-as" x="-40%" y="-20%" width="180%" height="160%">
          <feDropShadow dx="0" dy="3" stdDeviation="3" flood-color="rgba(110,0,18,0.82)"/>
        </filter>
      </defs>
      <!-- Ambient red glow ring -->
      <circle cx="14" cy="14" r="13" fill="rgba(227,25,55,0.16)"/>
      <circle cx="14" cy="14" r="12.2" fill="none" stroke="rgba(227,25,55,0.42)" stroke-width="0.7"/>
      <!-- 3D extrusion depth (shifted +1.5px right and +1.5px down) -->
      <polygon points="15.5,4.5 21.5,23.5 15.5,19.5 9.5,23.5" fill="rgba(45,0,8,0.85)"/>
      <!-- Main arrow face: mirror-metallic gradient + drop shadow -->
      <polygon points="14,3 20,22 14,18 8,22"
        fill="url(#nav-ag)" filter="url(#nav-as)"/>
      <!-- Diagonal gloss overlay (upper-left light source reflection) -->
      <polygon points="14,3 20,22 14,18 8,22"
        fill="url(#nav-gl)"/>
      <!-- Hot-spot specular: bright white at the very tip (mirror highlight) -->
      <polygon points="14,3 16.5,9.5 14,8.5 11.5,9.5"
        fill="rgba(255,255,255,0.78)"/>
      <!-- White outline for contrast on any background -->
      <polygon points="14,3 20,22 14,18 8,22"
        fill="none" stroke="rgba(255,255,255,0.78)" stroke-width="1.2" stroke-linejoin="round"/>
    </svg>
  </div>`
  return root
}

function positionElement(el: HTMLElement, map: maplibregl.Map, courseUp: boolean): void {
  const container = map.getContainer()
  const w = container.offsetWidth
  const h = container.offsetHeight
  const cx = Math.round(w / 2)
  // course-up: avatar at 70% (matches camera padding top=0.4*h → anchor at 70%)
  // north-up + Tesla: avatar at 50% (centered); north-up + non-Tesla: 70% (perspective)
  const cy = (courseUp || !isTeslaBrowser)
    ? Math.round(h * 0.70)
    : Math.round(h * 0.50)
  el.style.left = `${cx - ICON_SIZE / 2}px`
  el.style.top  = `${cy - ICON_SIZE / 2}px`
}

// ── Geo helpers ───────────────────────────────────────────────────────────────

function toRad(d: number): number { return d * Math.PI / 180 }
function toDeg(r: number): number { return r * 180 / Math.PI }

function bearingDeg(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const φ1 = toRad(lat1), φ2 = toRad(lat2)
  const Δλ = toRad(lng2 - lng1)
  const y  = Math.sin(Δλ) * Math.cos(φ2)
  const x  = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ)
  return (toDeg(Math.atan2(y, x)) + 360) % 360
}

function distM(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R    = 6_371_000
  const dlat = toRad(lat2 - lat1)
  const dlng = toRad(lng2 - lng1)
  const mlat = toRad((lat1 + lat2) / 2)
  return Math.sqrt((dlat * R) ** 2 + (dlng * R * Math.cos(mlat)) ** 2)
}

function projectOnSegment(
  pLat: number, pLng: number,
  aLat: number, aLng: number,
  bLat: number, bLng: number,
): { lat: number; lng: number } {
  const abLat = bLat - aLat, abLng = bLng - aLng
  const apLat = pLat - aLat, apLng = pLng - aLng
  const denom = abLat * abLat + abLng * abLng
  if (denom === 0) return { lat: aLat, lng: aLng }
  const t = Math.max(0, Math.min(1, (apLat * abLat + apLng * abLng) / denom))
  return { lat: aLat + t * abLat, lng: aLng + t * abLng }
}

// bearingDiff and lerpBearing imported from @/lib/bearingUtils (pure math, testable).

function snapToRoute(
  lat: number, lng: number,
  polyline: [number, number][],
  refBearing: number | null,
): { lat: number; lng: number; bearing: number } | null {
  if (polyline.length < 2) return null

  // Only search from (progress - 3) forward — prevents snapping back to
  // already-passed segments which would give wrong bearing or flip direction.
  const startIdx = Math.max(0, _currentSegmentIdx - 3)

  let bestDist = Infinity
  let bestSnap: { lat: number; lng: number; bearing: number; idx: number } | null = null

  for (let i = startIdx; i < polyline.length - 1; i++) {
    const [aLat, aLng] = polyline[i]!
    const [bLat, bLng] = polyline[i + 1]!
    const snap = projectOnSegment(lat, lng, aLat, aLng, bLat, bLng)
    const d    = distM(lat, lng, snap.lat, snap.lng)
    if (d < bestDist) {
      bestDist = d
      bestSnap = { lat: snap.lat, lng: snap.lng, bearing: bearingDeg(aLat, aLng, bLat, bLng), idx: i }
    }
  }

  if (bestDist > SNAP_DIST_M || !bestSnap) return null

  // Advance progress monotonically — never go backward
  if (bestSnap.idx > _currentSegmentIdx) _currentSegmentIdx = bestSnap.idx

  // Safety direction-guard: snap landed on U-turn return leg → flip 180°
  if (refBearing !== null) {
    const diff = Math.abs(bearingDiff(refBearing, bestSnap.bearing))
    if (diff > 90) {
      return { lat: bestSnap.lat, lng: bestSnap.lng, bearing: (bestSnap.bearing + 180) % 360 }
    }
  }

  return { lat: bestSnap.lat, lng: bestSnap.lng, bearing: bestSnap.bearing }
}

// ── Component ─────────────────────────────────────────────────────────────────

export function HeadingAvatar() {
  const smoothedBearingRef = useRef<number | null>(null)
  const lastPolylineRef    = useRef<[number, number][] | null>(null)
  const headingModeRef     = useRef(settingsStore.get().headingMode)

  useEffect(() => {
    const map = getMap()
    if (!map) return

    const el = makeElement()
    map.getContainer().appendChild(el)

    // When following: avatar is pinned to the padded center (map pans underneath).
    // When not following (user panned/zoomed): avatar tracks GPS coordinates on
    // every map render frame so it stays over the actual GPS location on screen.
    function updateAvatarPosition(): void {
      if (!map) return
      if (followStore.isFollowing()) {
        positionElement(el, map, headingModeRef.current === 'course-up')
        return
      }
      if (_navLat === null || _navLng === null) return
      const pt = map.project([_navLng as number, _navLat as number])
      el.style.left = `${pt.x - ICON_SIZE / 2}px`
      el.style.top  = `${pt.y - ICON_SIZE / 2}px`
    }

    updateAvatarPosition()
    map.on('render', updateAvatarPosition)

    function onResize(): void { updateAvatarPosition() }
    window.addEventListener('resize', onResize, { passive: true })

    const unsubFollow = followStore.subscribe(() => { updateAvatarPosition() })

    const unsubSettings = settingsStore.subscribe(() => {
      headingModeRef.current = settingsStore.get().headingMode
      updateAvatarPosition()
    })

    const unsubGps = gpsStore.onPosition((pos: GpsPosition) => {
      // ── 1. Position + bearing ─────────────────────────────────────────────
      let displayLat = pos.lat
      let displayLng = pos.lng
      let newBearing: number | null = null
      let fromSnap   = false

      const { routes, activeRouteIndex } = routeStore.getState()
      const activeRoute = routes[activeRouteIndex]

      // Reset segment progress when route changes (new polyline reference)
      if (activeRoute?.polyline !== lastPolylineRef.current) {
        _currentSegmentIdx = 0
        lastPolylineRef.current = activeRoute?.polyline ?? null
      }

      if (activeRoute?.polyline.length) {
        const snap = snapToRoute(
          pos.lat, pos.lng,
          activeRoute.polyline,
          smoothedBearingRef.current ?? pos.heading ?? null,
        )
        if (snap) {
          displayLat = snap.lat
          displayLng = snap.lng
          // Snap bearing is exact (segment direction) — use directly, NO EMA.
          // EMA lag on snap bearing causes lateral road drift —
          // the map lags 2-3 ticks after
          // each segment change, making the road appear at an angle.
          newBearing = snap.bearing
          fromSnap   = true
        }
      }

      if (!fromSnap && pos.heading !== null && pos.heading !== undefined) {
        // Raw GPS heading is noisy — apply light EMA to filter jitter
        newBearing = pos.heading
      }

      // ── 2. Update bearing (EMA only for raw GPS) ──────────────────────────
      if (newBearing !== null) {
        if (smoothedBearingRef.current === null) {
          smoothedBearingRef.current = newBearing
        } else if (fromSnap) {
          // Snap: exact segment bearing, no smoothing needed
          smoothedBearingRef.current = newBearing
        } else {
          // Raw GPS: EMA alpha=0.8 — reaches correct bearing in ~2 ticks.
          // Lower values (0.2) caused the "diagonal road" bug: the map
          // took 10+ seconds to rotate after a turn when no route snap.
          smoothedBearingRef.current = lerpBearing(smoothedBearingRef.current, newBearing, 0.8)
        }
        _navBearing = smoothedBearingRef.current
      }

      _navLat = displayLat
      _navLng = displayLng

      // ── 3. Rotate arrow ───────────────────────────────────────────────────
      const wrap = el.querySelector<HTMLElement>('.gps-avatar-arrow')
      if (wrap && smoothedBearingRef.current !== null) {
        // course-up: map rotates to face direction of travel; arrow stays at 0° (screen-up)
        // north-up: map is fixed north; arrow rotates to show direction of travel
        const deg = headingModeRef.current === 'course-up'
          ? 0
          : Math.round(smoothedBearingRef.current)
        wrap.style.transform = `rotate(${deg}deg)`
      }
    })

    return () => {
      unsubGps()
      unsubFollow()
      unsubSettings()
      map.off('render', updateAvatarPosition)
      window.removeEventListener('resize', onResize)
      el.remove()
      _navBearing        = null
      _navLat            = null
      _navLng            = null
      _currentSegmentIdx = 0
      lastPolylineRef.current = null
    }
  }, [])

  return null
}
