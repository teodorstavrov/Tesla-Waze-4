// ─── GPS Avatar / Heading Marker ─────────────────────────────────────
//
// Architecture: fixed-position HTML overlay on the map container.
// Avatar stays at a constant CSS coordinate; map pans underneath.
// This eliminates all GPS-to-screen projection errors permanently.
//
// Position formula (mirrors MapShell padding exactly):
//   topPad = (courseUp || !isTeslaBrowser) ? round(h * 0.4) : 0
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
import { settingsStore } from '@/features/settings/settingsStore'
import { isTeslaBrowser } from '@/lib/browser'
import { followStore } from '@/features/follow/followStore'
import type { GpsPosition } from '@/features/gps/types'

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
  // 3D arrow: extrusion shadow + gradient face + glossy highlight + drop-shadow.
  // Tip at (14,3); center at (14,14) = CSS rotation pivot = GPS point on screen.
  root.innerHTML = `<div class="gps-avatar-arrow" style="transform:rotate(0deg);transform-origin:50% 50%">
    <svg width="${ICON_SIZE}" height="${ICON_SIZE}" viewBox="0 0 28 28" fill="none" aria-hidden="true">
      <defs>
        <linearGradient id="nav-ag" x1="14" y1="3" x2="14" y2="22" gradientUnits="userSpaceOnUse">
          <stop offset="0%"   stop-color="#93c5fd"/>
          <stop offset="50%"  stop-color="#2979ff"/>
          <stop offset="100%" stop-color="#1251c5"/>
        </linearGradient>
        <filter id="nav-as" x="-30%" y="-30%" width="160%" height="160%">
          <feDropShadow dx="0" dy="2" stdDeviation="2.5" flood-color="rgba(0,20,80,0.65)"/>
        </filter>
      </defs>
      <!-- Ambient glow ring -->
      <circle cx="14" cy="14" r="13" fill="rgba(41,121,255,0.13)"/>
      <!-- Extrusion depth face (shifted +1px right, +1.5px down) -->
      <polygon points="15,4.5 21,23.5 15,19.5 9,23.5" fill="rgba(8,28,95,0.70)"/>
      <!-- Main arrow face: gradient + drop shadow -->
      <polygon points="14,3 20,22 14,18 8,22"
        fill="url(#nav-ag)" filter="url(#nav-as)"/>
      <!-- Glossy specular highlight on upper third -->
      <polygon points="14,3 17,13 14,12 11,13"
        fill="rgba(255,255,255,0.38)"/>
      <!-- White outline for contrast on any background -->
      <polygon points="14,3 20,22 14,18 8,22"
        fill="none" stroke="rgba(255,255,255,0.85)" stroke-width="1.2" stroke-linejoin="round"/>
    </svg>
  </div>`
  return root
}

function positionElement(el: HTMLElement): void {
  const courseUp = settingsStore.get().headingMode === 'course-up'
  const w = window.innerWidth
  const h = window.innerHeight
  const topPad = (courseUp || !isTeslaBrowser) ? Math.round(h * 0.4) : 0
  const cx = w / 2
  const cy = h / 2 + topPad / 2
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

// Normalise bearing difference to [-180, 180]
function bearingDiff(a: number, b: number): number {
  return ((b - a) + 540) % 360 - 180
}

// EMA with 360° wrap-around. Used ONLY for raw GPS heading (noisy fallback).
// NOT used for snap bearing — snap is exact and must update instantly.
// alpha=0.8: fast enough to track a real turn within 2 GPS ticks while
// still damping sub-degree noise. (alpha=0.2 took 10+ ticks → diagonal road.)
function lerpBearing(from: number, to: number, alpha: number): number {
  const diff = bearingDiff(from, to)
  return (from + diff * alpha + 360) % 360
}

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

  useEffect(() => {
    const map = getMap()
    if (!map) return

    const el = makeElement()
    map.getContainer().appendChild(el)

    // When following: avatar is pinned to the padded center (map pans underneath).
    // When not following (user panned/zoomed): avatar tracks GPS coordinates on
    // every map render frame so it stays over the actual GPS location on screen.
    function updateAvatarPosition(): void {
      if (followStore.isFollowing()) {
        positionElement(el)
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

    const unsubSettings = settingsStore.subscribe(() => { updateAvatarPosition() })
    const unsubFollow   = followStore.subscribe(() => { updateAvatarPosition() })

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
          // EMA lag on snap bearing is the root cause of lateral road drift
          // in course-up mode: the map rotation is wrong for 2-3 ticks after
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

      // No route snap + course-up: project GPS onto forward direction.
      // Raw GPS has ±5m lateral noise relative to the road; in course-up mode
      // that noise is perpendicular to "up", so it appears as rapid left/right
      // map oscillation every GPS tick.  Projecting onto the bearing direction
      // keeps the displayed position advancing only forward — no lateral drift.
      // 30m safety limit resets to raw GPS if the projection drifts too far
      // (e.g. a turn where the bearing update hasn't caught up yet).
      if (!fromSnap && _navBearing !== null && _navLat !== null && _navLng !== null) {
        const courseUp = settingsStore.get().headingMode === 'course-up'
        if (courseUp) {
          const rad     = _navBearing * Math.PI / 180
          const dLat    = pos.lat - _navLat
          const dLng    = pos.lng - _navLng
          const fwd     = dLat * Math.cos(rad) + dLng * Math.sin(rad)
          const projLat = _navLat + fwd * Math.cos(rad)
          const projLng = _navLng + fwd * Math.sin(rad)
          if (distM(pos.lat, pos.lng, projLat, projLng) < 30) {
            displayLat = projLat
            displayLng = projLng
          }
        }
      }
      _navLat = displayLat
      _navLng = displayLng

      // ── 3. Rotate arrow ───────────────────────────────────────────────────
      const wrap = el.querySelector<HTMLElement>('.gps-avatar-arrow')
      if (wrap && smoothedBearingRef.current !== null) {
        const courseUp = settingsStore.get().headingMode === 'course-up'
        // course-up: MapShell rotates the map by -navBearing so the vehicle's
        //   direction of travel always faces screen-top.  Arrow stays at 0°
        //   (tip points up) — it is already aligned with the road ahead.
        // north-up: map is north-up — rotate arrow to show direction of travel.
        const arrowDeg = courseUp ? 0 : Math.round(smoothedBearingRef.current)
        wrap.style.transform = `rotate(${arrowDeg}deg)`
      }
    })

    return () => {
      unsubGps()
      unsubSettings()
      unsubFollow()
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
