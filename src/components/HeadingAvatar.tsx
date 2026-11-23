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
import { xpStore } from '@/features/xp/xpStore'
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

const ICON_SIZE   = 54
const SNAP_DIST_M = 60

// ── GTA VI map marker ─────────────────────────────────────────────────────────

interface _GtaRank { color: string; bg0: string; bg1: string; sunglasses: boolean; crown: boolean; pulse: boolean }

function _gtaRank(xp: number): _GtaRank {
  if (xp >= 5000) return { color: '#F329A7', bg0: '#1a0018', bg1: '#0a0010', sunglasses: true,  crown: true,  pulse: true  }
  if (xp >= 1500) return { color: '#FFB52E', bg0: '#1a1200', bg1: '#0a0800', sunglasses: true,  crown: false, pulse: false }
  if (xp >= 500)  return { color: '#8B42FF', bg0: '#180a2e', bg1: '#0a0518', sunglasses: true,  crown: false, pulse: false }
  if (xp >= 100)  return { color: '#00D9FF', bg0: '#001e2e', bg1: '#000d1a', sunglasses: true,  crown: false, pulse: false }
  return                  { color: '#6B7280', bg0: '#1c1c1c', bg1: '#111111', sunglasses: false, crown: false, pulse: false }
}

function _gtaSVG(xp: number): string {
  const rk = _gtaRank(xp)
  const c = rk.color
  // 54×54 viewBox. Chevron at top (tip y=1, base y=12). Circle center (27,33) r=18.
  const cx = 27, cy = 33, r = 18

  const crown = rk.crown ? `
    <polygon points="27,17 23,22 25,21 27,19 29,21 31,22" fill="${c}" opacity="0.95"/>
    <circle cx="27" cy="19" r="1.2" fill="#FFB52E"/>
    <circle cx="23" cy="22" r="0.9" fill="#FFB52E"/>
    <circle cx="31" cy="22" r="0.9" fill="#FFB52E"/>` : ''

  const eyes = rk.sunglasses ? `
    <rect x="17" y="31" width="5" height="2.4" rx="1.2" fill="${rk.bg0}" stroke="${c}" stroke-width="0.9"/>
    <rect x="32" y="31" width="5" height="2.4" rx="1.2" fill="${rk.bg0}" stroke="${c}" stroke-width="0.9"/>
    <line x1="22" y1="32.2" x2="32" y2="32.2" stroke="${c}" stroke-width="0.9"/>
    <line x1="17" y1="32.2" x2="14" y2="31.4" stroke="${c}" stroke-width="0.7"/>
    <line x1="37" y1="32.2" x2="40" y2="31.4" stroke="${c}" stroke-width="0.7"/>` : `
    <circle cx="21" cy="32.2" r="1.8" fill="#2a2a40"/>
    <circle cx="33" cy="32.2" r="1.8" fill="#2a2a40"/>
    <circle cx="21.6" cy="31.6" r="0.6" fill="rgba(255,255,255,0.4)"/>
    <circle cx="33.6" cy="31.6" r="0.6" fill="rgba(255,255,255,0.4)"/>`

  const pulse = rk.pulse ? `
    <circle cx="${cx}" cy="${cy}" r="${r+2}" fill="none" stroke="${c}" stroke-width="1">
      <animate attributeName="r" values="${r+1};${r+7}" dur="1.8s" repeatCount="indefinite"/>
      <animate attributeName="opacity" values="0.5;0" dur="1.8s" repeatCount="indefinite"/>
    </circle>` : ''

  return `<svg width="${ICON_SIZE}" height="${ICON_SIZE}" viewBox="0 0 54 54" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
  <defs>
    <radialGradient id="gtabg" cx="50%" cy="35%">
      <stop offset="0%" stop-color="${rk.bg0}"/>
      <stop offset="100%" stop-color="${rk.bg1}"/>
    </radialGradient>
  </defs>
  ${pulse}
  <!-- drop shadow -->
  <circle cx="${cx}" cy="${cy+2}" r="${r}" fill="rgba(0,0,0,0.38)"/>
  <!-- direction chevron -->
  <polygon points="27,1 33,12 21,12" fill="${c}" opacity="0.92"/>
  <!-- circle body -->
  <circle cx="${cx}" cy="${cy}" r="${r}" fill="url(#gtabg)"/>
  <!-- border ring -->
  <circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${c}" stroke-width="1.8"/>
  <!-- hair -->
  <path d="M${cx-r*.72},${cy-1} a${r*.72},${r*.75} 0 0 1 ${r*1.44},0 Q${cx+r*.58},${cy-r*.72} ${cx},${cy-r*.8} Q${cx-r*.58},${cy-r*.72} ${cx-r*.72},${cy-1} Z" fill="#111" opacity="0.9"/>
  ${crown}
  ${eyes}
  <!-- mouth -->
  <path d="M24,38 Q27,40.5 30,38" fill="none" stroke="${c}" stroke-width="0.9" opacity="0.45"/>
  <!-- gloss -->
  <ellipse cx="21" cy="26" rx="4" ry="2.5" fill="rgba(255,255,255,0.07)"/>
</svg>`
}

function _updateArrow(el: HTMLDivElement): void {
  const wrap = el.querySelector<HTMLElement>('.gps-avatar-arrow')
  if (!wrap) return
  const isGta = document.documentElement.hasAttribute('data-gta')
  if (isGta) {
    wrap.innerHTML = _gtaSVG(xpStore.getState().xp)
    wrap.style.filter = `drop-shadow(0 0 6px ${_gtaRank(xpStore.getState().xp).color})`
  } else {
    wrap.style.filter = ''
    wrap.innerHTML = _stdArrowSVG()
  }
}

function _stdArrowSVG(): string {
  return `<svg width="${ICON_SIZE}" height="${ICON_SIZE}" viewBox="0 0 28 28" fill="none" aria-hidden="true">
      <defs>
        <linearGradient id="nav-ag" x1="14" y1="3" x2="14" y2="22" gradientUnits="userSpaceOnUse">
          <stop offset="0%"   stop-color="#ffcdd2"/>
          <stop offset="14%"  stop-color="#ff4d5e"/>
          <stop offset="40%"  stop-color="#e31937"/>
          <stop offset="58%"  stop-color="#f0364f"/>
          <stop offset="80%"  stop-color="#8c0d1b"/>
          <stop offset="100%" stop-color="#4a0610"/>
        </linearGradient>
        <linearGradient id="nav-gl" x1="8" y1="3" x2="20" y2="20" gradientUnits="userSpaceOnUse">
          <stop offset="0%"   stop-color="rgba(255,255,255,0.68)"/>
          <stop offset="38%"  stop-color="rgba(255,255,255,0.22)"/>
          <stop offset="70%"  stop-color="rgba(255,255,255,0.04)"/>
          <stop offset="100%" stop-color="rgba(255,255,255,0)"/>
        </linearGradient>
        <filter id="nav-as" x="-40%" y="-20%" width="180%" height="160%">
          <feDropShadow dx="0" dy="2.5" stdDeviation="2.2" flood-color="rgba(110,0,18,0.95)"/>
        </filter>
      </defs>
      <polygon points="15.5,4.5 21.5,23.5 15.5,19.5 9.5,23.5" fill="rgba(45,0,8,0.85)"/>
      <polygon points="14,3 20,22 14,18 8,22" fill="url(#nav-ag)" filter="url(#nav-as)"/>
      <polygon points="14,3 20,22 14,18 8,22" fill="url(#nav-gl)"/>
      <polygon points="14,3 16.5,9.5 14,8.5 11.5,9.5" fill="rgba(255,255,255,0.78)"/>
      <polygon points="14,3 20,22 14,18 8,22" fill="none" stroke="rgba(255,255,255,0.88)" stroke-width="1.5" stroke-linejoin="round"/>
    </svg>`
}

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
  root.innerHTML = `<div class="gps-avatar-arrow" style="transform:rotate(0deg);transform-origin:50% 50%"></div>`
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
  // Return GPS position (lat, lng) instead of snap position to prevent the
  // avatar from drifting backward along the route when the driver reverses.
  if (refBearing !== null) {
    const diff = Math.abs(bearingDiff(refBearing, bestSnap.bearing))
    if (diff > 90) {
      return { lat, lng, bearing: (bestSnap.bearing + 180) % 360 }
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

    // Render correct SVG immediately, then track mode + rank changes.
    _updateArrow(el)

    const gtaObserver = new MutationObserver(() => { _updateArrow(el) })
    gtaObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['data-gta'] })

    const unsubXp = xpStore.subscribe(() => {
      if (document.documentElement.hasAttribute('data-gta')) _updateArrow(el)
    })

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
        // Direction-guard reference: normally use smoothed bearing (stable, no GPS noise).
        // Exception: when GPS heading has diverged > 120° from smooth bearing, the driver
        // has reversed (U-turn). Switch to GPS heading so the guard flips the snap bearing.
        // The 120° threshold avoids false triggers on sharp route turns (< 120°).
        const snapRefBearing =
          (pos.heading !== null &&
           smoothedBearingRef.current !== null &&
           Math.abs(bearingDiff(pos.heading, smoothedBearingRef.current)) > 120)
            ? pos.heading
            : (smoothedBearingRef.current ?? pos.heading ?? null)
        const snap = snapToRoute(pos.lat, pos.lng, activeRoute.polyline, snapRefBearing)
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
      unsubXp()
      gtaObserver.disconnect()
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
