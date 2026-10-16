// ─── GPS Avatar / Heading Marker ─────────────────────────────────────
//
// Fixed-position overlay — avatar sits at a constant CSS position on screen.
// The map pans underneath via MapShell's easeTo so the GPS coordinate appears
// exactly at the avatar's location.  This eliminates all GPS drift and
// coordinate-projection errors permanently.
//
// Position formula (must mirror MapShell's padding formula exactly):
//   topPad = (courseUp || !isTeslaBrowser) ? round(h * 0.4) : 0
//   avatarCenterY = h / 2 + topPad / 2
//
// Heading sources (priority when route is active):
//   1. Bearing of the nearest route polyline segment → always forward
//   2. GPS heading (fallback when no route)
//   Never rotates > 100° from previous bearing → no backwards movement.
// ─────────────────────────────────────────────────────────────────────

import { useEffect, useRef } from 'react'
import { getMap } from '@/components/MapShell'
import { gpsStore } from '@/features/gps/gpsStore'
import { routeStore } from '@/features/route/routeStore'
import { settingsStore } from '@/features/settings/settingsStore'
import { isTeslaBrowser } from '@/lib/browser'
import type { GpsPosition } from '@/features/gps/types'

// Shared nav state for MapShell — snapped bearing + position.
// Updated each GPS tick after snap + anti-jitter filtering.
let _navBearing:  number | null = null
let _navLat:      number | null = null
let _navLng:      number | null = null
export function getNavBearing():  number | null { return _navBearing }
export function getNavPosition(): { lat: number; lng: number } | null {
  return _navLat !== null && _navLng !== null ? { lat: _navLat, lng: _navLng } : null
}

const ICON_SIZE       = 76
const SNAP_DIST_M     = 60
const MAX_HEADING_JUMP_DEG = 100

// ── Element factory ───────────────────────────────────────────────────────────

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

  // Original arrow: tip at (14,3), circle at center fills element for location dot.
  // CSS rotate() around 50% 50% = center of element = GPS point on screen.
  root.innerHTML = `<div class="gps-avatar-arrow" style="transform:rotate(0deg);transform-origin:50% 50%">
    <svg width="${ICON_SIZE}" height="${ICON_SIZE}" viewBox="0 0 28 28" fill="none" aria-hidden="true">
      <circle cx="14" cy="14" r="13" fill="rgba(41,121,255,0.15)"/>
      <polygon points="14,3 20,22 14,18 8,22"
        fill="#2979ff" stroke="white" stroke-width="1.5" stroke-linejoin="round"/>
    </svg>
  </div>`

  return root
}

// Place avatar at the map's visual GPS center (mirrors MapShell's easeTo padding).
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
  const y   = Math.sin(Δλ) * Math.cos(φ2)
  const x   = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ)
  return (toDeg(Math.atan2(y, x)) + 360) % 360
}

function distM(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R   = 6_371_000
  const dlat = toRad(lat2 - lat1)
  const dlng = toRad(lng2 - lng1)
  const mlat = toRad((lat1 + lat2) / 2)
  return Math.sqrt((dlat * R) ** 2 + (dlng * R * Math.cos(mlat)) ** 2)
}

function projectOnSegment(
  pLat: number, pLng: number,
  aLat: number, aLng: number,
  bLat: number, bLng: number,
): { lat: number; lng: number; t: number } {
  const abLat = bLat - aLat, abLng = bLng - aLng
  const apLat = pLat - aLat, apLng = pLng - aLng
  const denom = abLat * abLat + abLng * abLng
  if (denom === 0) return { lat: aLat, lng: aLng, t: 0 }
  const t = Math.max(0, Math.min(1, (apLat * abLat + apLng * abLng) / denom))
  return { lat: aLat + t * abLat, lng: aLng + t * abLng, t }
}

function snapToRoute(
  lat: number, lng: number,
  polyline: [number, number][],
): { lat: number; lng: number; bearing: number } | null {
  if (polyline.length < 2) return null

  let bestDist = Infinity
  let bestSnap: { lat: number; lng: number; bearing: number } | null = null

  for (let i = 0; i < polyline.length - 1; i++) {
    const [aLat, aLng] = polyline[i]!
    const [bLat, bLng] = polyline[i + 1]!
    const { lat: sLat, lng: sLng } = projectOnSegment(lat, lng, aLat, aLng, bLat, bLng)
    const d = distM(lat, lng, sLat, sLng)
    if (d < bestDist) {
      bestDist = d
      bestSnap = { lat: sLat, lng: sLng, bearing: bearingDeg(aLat, aLng, bLat, bLng) }
    }
  }

  if (bestDist > SNAP_DIST_M) return null
  return bestSnap
}

function bearingDiff(a: number, b: number): number {
  return ((b - a) + 540) % 360 - 180
}

// ─────────────────────────────────────────────────────────────────────────────
export function HeadingAvatar() {
  const prevBearingRef = useRef<number | null>(null)

  useEffect(() => {
    const map = getMap()
    if (!map) return

    const el = makeElement()
    map.getContainer().appendChild(el)
    positionElement(el)

    // Re-position when viewport resizes
    function onResize(): void {
      positionElement(el)
    }
    window.addEventListener('resize', onResize, { passive: true })

    // Re-position when heading mode toggles (topPad formula changes)
    const unsubSettings = settingsStore.subscribe(() => {
      positionElement(el)
    })

    const unsubGps = gpsStore.onPosition((pos: GpsPosition) => {
      // ── Determine display position + bearing ──────────────────────────────
      let displayLat  = pos.lat
      let displayLng  = pos.lng
      let newBearing: number | null = null
      let bearingFromSnap = false

      const { routes, activeRouteIndex } = routeStore.getState()
      const activeRoute = routes[activeRouteIndex]
      if (activeRoute?.polyline.length) {
        const snap = snapToRoute(pos.lat, pos.lng, activeRoute.polyline)
        if (snap) {
          displayLat = snap.lat
          displayLng = snap.lng
          newBearing = snap.bearing
          bearingFromSnap = true
        }
      }

      if (newBearing === null && pos.heading !== null && pos.heading !== undefined) {
        newBearing = pos.heading
      }

      // Anti-jitter guard only for raw GPS heading — snap bearing is authoritative
      // (polyline is ordered in direction of travel, so snap always points forward).
      // Applying the guard to snap bearing causes the arrow to lock to old direction
      // on turns > 100°, making it appear to point backwards.
      if (!bearingFromSnap && newBearing !== null && prevBearingRef.current !== null) {
        const diff = Math.abs(bearingDiff(prevBearingRef.current, newBearing))
        if (diff > MAX_HEADING_JUMP_DEG) {
          newBearing = prevBearingRef.current
        }
      }
      if (newBearing !== null) {
        prevBearingRef.current = newBearing
        _navBearing = newBearing
      }
      _navLat = displayLat
      _navLng = displayLng

      // ── Rotate arrow ──────────────────────────────────────────────────────
      const wrap = el.querySelector<HTMLElement>('.gps-avatar-arrow')
      if (wrap) {
        const courseUp = settingsStore.get().headingMode === 'course-up'
        // course-up: map already rotated so travel direction = viewport UP → CSS 0°.
        //            Applying bearing here would double-rotate the arrow off the road.
        // north-up:  map bearing = 0 → arrow must rotate by geographic bearing.
        const arrowDeg = courseUp ? 0 : Math.round(newBearing ?? 0)
        wrap.style.transform = `rotate(${arrowDeg}deg)`
      }
    })

    return () => {
      unsubGps()
      unsubSettings()
      window.removeEventListener('resize', onResize)
      el.remove()
      _navBearing = null
      _navLat     = null
      _navLng     = null
    }
  }, [])

  return null
}
