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
//   1. snapToRoute() → nearest route segment bearing
//      + direction-check: if >90° off current heading, flip 180°
//        (handles U-turns where snap grabs the return leg)
//   2. Fallback: raw GPS heading (no active route)
//   3. EMA smoothing — replaces hard anti-jitter cut-off;
//      smooths turns instead of locking to old bearing.
//      alpha=0.5 for snap (authoritative), 0.25 for raw GPS (noisy).
//
// Course-up: map rotates (MapShell.easeTo bearing=-smoothedBearing).
//            Arrow CSS = 0° (always points up = direction of travel).
// North-up:  map bearing=0. Arrow CSS = smoothedBearing.
// ─────────────────────────────────────────────────────────────────────

import { useEffect, useRef } from 'react'
import { getMap } from '@/components/MapShell'
import { gpsStore } from '@/features/gps/gpsStore'
import { routeStore } from '@/features/route/routeStore'
import { settingsStore } from '@/features/settings/settingsStore'
import { isTeslaBrowser } from '@/lib/browser'
import type { GpsPosition } from '@/features/gps/types'

// Shared nav state exported for MapShell
let _navBearing: number | null = null
let _navLat:     number | null = null
let _navLng:     number | null = null
export function getNavBearing():  number | null { return _navBearing }
export function getNavPosition(): { lat: number; lng: number } | null {
  return _navLat !== null && _navLng !== null ? { lat: _navLat, lng: _navLng } : null
}

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
  // Original SVG: tip at (14,3), GPS dot circle at center (14,14).
  // CSS rotate() pivots around 50% 50% = center = GPS point.
  root.innerHTML = `<div class="gps-avatar-arrow" style="transform:rotate(0deg);transform-origin:50% 50%">
    <svg width="${ICON_SIZE}" height="${ICON_SIZE}" viewBox="0 0 28 28" fill="none" aria-hidden="true">
      <circle cx="14" cy="14" r="13" fill="rgba(41,121,255,0.15)"/>
      <polygon points="14,3 20,22 14,18 8,22"
        fill="#2979ff" stroke="white" stroke-width="1.5" stroke-linejoin="round"/>
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

// EMA that handles 360° wrap-around — never locks, only smooths.
// alpha: 0 = no change, 1 = instant snap.
function lerpBearing(from: number, to: number, alpha: number): number {
  const diff = bearingDiff(from, to)  // shortest arc [-180, 180]
  return (from + diff * alpha + 360) % 360
}

function snapToRoute(
  lat: number, lng: number,
  polyline: [number, number][],
  refBearing: number | null,   // current smoothed bearing for direction check
): { lat: number; lng: number; bearing: number } | null {
  if (polyline.length < 2) return null

  let bestDist = Infinity
  let bestSnap: { lat: number; lng: number; bearing: number } | null = null

  for (let i = 0; i < polyline.length - 1; i++) {
    const [aLat, aLng] = polyline[i]!
    const [bLat, bLng] = polyline[i + 1]!
    const snap = projectOnSegment(lat, lng, aLat, aLng, bLat, bLng)
    const d    = distM(lat, lng, snap.lat, snap.lng)
    if (d < bestDist) {
      bestDist = d
      bestSnap = { lat: snap.lat, lng: snap.lng, bearing: bearingDeg(aLat, aLng, bLat, bLng) }
    }
  }

  if (bestDist > SNAP_DIST_M || !bestSnap) return null

  // Direction guard: if snap bearing is >90° from our reference, the snap
  // landed on the return leg of a U-turn — flip to match direction of travel.
  if (refBearing !== null) {
    const diff = Math.abs(bearingDiff(refBearing, bestSnap.bearing))
    if (diff > 90) {
      bestSnap = { ...bestSnap, bearing: (bestSnap.bearing + 180) % 360 }
    }
  }

  return bestSnap
}

// ── Component ─────────────────────────────────────────────────────────────────

export function HeadingAvatar() {
  const smoothedBearingRef = useRef<number | null>(null)

  useEffect(() => {
    const map = getMap()
    if (!map) return

    const el = makeElement()
    map.getContainer().appendChild(el)
    positionElement(el)

    function onResize(): void { positionElement(el) }
    window.addEventListener('resize', onResize, { passive: true })

    const unsubSettings = settingsStore.subscribe(() => { positionElement(el) })

    const unsubGps = gpsStore.onPosition((pos: GpsPosition) => {
      // ── 1. Position + raw bearing ─────────────────────────────────────────
      let displayLat = pos.lat
      let displayLng = pos.lng
      let rawBearing: number | null = null
      let fromSnap   = false

      const { routes, activeRouteIndex } = routeStore.getState()
      const activeRoute = routes[activeRouteIndex]
      if (activeRoute?.polyline.length) {
        const snap = snapToRoute(
          pos.lat, pos.lng,
          activeRoute.polyline,
          smoothedBearingRef.current ?? pos.heading ?? null,
        )
        if (snap) {
          displayLat = snap.lat
          displayLng = snap.lng
          rawBearing = snap.bearing
          fromSnap   = true
        }
      }

      if (!fromSnap && pos.heading !== null && pos.heading !== undefined) {
        rawBearing = pos.heading
      }

      // ── 2. EMA smoothing ──────────────────────────────────────────────────
      // Replaces hard cutoff — turns are followed smoothly, never locked.
      // Snap is authoritative (alpha=0.5); raw GPS is noisier (alpha=0.25).
      if (rawBearing !== null) {
        if (smoothedBearingRef.current === null) {
          smoothedBearingRef.current = rawBearing
        } else {
          const alpha = fromSnap ? 0.5 : 0.25
          smoothedBearingRef.current = lerpBearing(smoothedBearingRef.current, rawBearing, alpha)
        }
        _navBearing = smoothedBearingRef.current
      }
      _navLat = displayLat
      _navLng = displayLng

      // ── 3. Rotate arrow ───────────────────────────────────────────────────
      const wrap = el.querySelector<HTMLElement>('.gps-avatar-arrow')
      if (wrap && smoothedBearingRef.current !== null) {
        const courseUp = settingsStore.get().headingMode === 'course-up'
        // course-up: MapShell rotates the map by -smoothedBearing so travel
        //   direction faces UP — arrow must stay at 0° (no double-rotation).
        // north-up: map is fixed north — arrow rotates to geographic bearing.
        const arrowDeg = courseUp ? 0 : Math.round(smoothedBearingRef.current)
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
