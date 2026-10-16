// ─── GPS Avatar / Heading Marker ─────────────────────────────────────
//
// Null React component — all work done imperatively via MapLibre Marker.
//
// Heading sources (priority order when route is active):
//   1. Bearing of the nearest route polyline segment → always forward
//   2. GPS heading (fallback when no route)
//   Never rotates >100° from previous bearing → no backwards movement.
//
// Position (when route is active): snapped to nearest route segment.
// ─────────────────────────────────────────────────────────────────────

import { useEffect, useRef } from 'react'
import * as maplibregl from 'maplibre-gl'
import { getMap, getCourseUpScale } from '@/components/MapShell'
import { gpsStore } from '@/features/gps/gpsStore'
import { routeStore } from '@/features/route/routeStore'
import { settingsStore } from '@/features/settings/settingsStore'
import type { GpsPosition } from '@/features/gps/types'

// Shared best-bearing for MapShell course-up rotation.
// Updated each GPS tick by HeadingAvatar after snap+anti-jitter filtering.
let _navBearing: number | null = null
export function getNavBearing(): number | null { return _navBearing }

const ICON_SIZE  = 76
const SNAP_DIST_M = 60   // snap avatar to route if within 60 m
const MAX_HEADING_JUMP_DEG = 100  // ignore heading if it jumps more than this

function makeElement(): HTMLDivElement {
  const root = document.createElement('div')
  root.className = 'gps-avatar-root'
  root.style.cssText = `width:${ICON_SIZE}px;height:${ICON_SIZE}px;pointer-events:none;z-index:10`

  // Tip is at (14,14) = center of element.
  // CSS rotate() defaults to transform-origin:50% 50% = center = tip.
  // So rotation always pivots around the tip → tip stays on the road centerline.
  root.innerHTML = `<div class="gps-avatar-arrow" style="transform:rotate(0deg)">
    <svg width="${ICON_SIZE}" height="${ICON_SIZE}" viewBox="0 0 28 28" fill="none" aria-hidden="true">
      <circle cx="14" cy="21" r="7" fill="rgba(41,121,255,0.18)"/>
      <polygon points="14,14 19,27 14,23 9,27"
        fill="#2979ff" stroke="white" stroke-width="1.5" stroke-linejoin="round"/>
    </svg>
  </div>`

  return root
}

// ── Geo helpers ──────────────────────────────────────────────────────────────

function toRad(d: number): number { return d * Math.PI / 180 }
function toDeg(r: number): number { return r * 180 / Math.PI }

/** Bearing (degrees, 0–360) from A→B */
function bearingDeg(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const φ1 = toRad(lat1), φ2 = toRad(lat2)
  const Δλ = toRad(lng2 - lng1)
  const y   = Math.sin(Δλ) * Math.cos(φ2)
  const x   = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ)
  return (toDeg(Math.atan2(y, x)) + 360) % 360
}

/** Approximate distance in metres (equirectangular) */
function distM(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R   = 6_371_000
  const dlat = toRad(lat2 - lat1)
  const dlng = toRad(lng2 - lng1)
  const mlat = toRad((lat1 + lat2) / 2)
  return Math.sqrt((dlat * R) ** 2 + (dlng * R * Math.cos(mlat)) ** 2)
}

/** Project point P onto segment A–B; returns snapped [lat,lng] + t∈[0,1] */
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

/**
 * Snap GPS position to the nearest route segment.
 * Returns snapped position + forward bearing of that segment.
 * Returns null if route is too far away (> SNAP_DIST_M).
 */
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

/** Smallest signed difference between two bearings (−180 … +180) */
function bearingDiff(a: number, b: number): number {
  let d = ((b - a) + 540) % 360 - 180
  return d
}

// ─────────────────────────────────────────────────────────────────────────────
export function HeadingAvatar() {
  const markerRef    = useRef<maplibregl.Marker | null>(null)
  const elemRef      = useRef<HTMLDivElement | null>(null)
  const addedRef     = useRef(false)
  const prevBearingRef = useRef<number | null>(null)

  useEffect(() => {
    const map = getMap()
    if (!map) return

    const el = makeElement()
    elemRef.current = el

    const marker = new maplibregl.Marker({
      element: el,
      anchor: 'center',
      rotationAlignment: 'viewport',
    })
      .setLngLat([0, 0])
    markerRef.current = marker

    const unsub = gpsStore.onPosition((pos: GpsPosition) => {
      const m = markerRef.current
      if (!m) return

      // ── Determine display position + bearing ────────────────────────────
      let displayLat  = pos.lat
      let displayLng  = pos.lng
      let newBearing: number | null = null

      const { routes, activeRouteIndex } = routeStore.getState()
      const activeRoute = routes[activeRouteIndex]
      if (activeRoute?.polyline.length) {
        const snap = snapToRoute(pos.lat, pos.lng, activeRoute.polyline)
        if (snap) {
          displayLat = snap.lat
          displayLng = snap.lng
          newBearing = snap.bearing
        }
      }

      // Fallback: use raw GPS heading
      if (newBearing === null && pos.heading !== null && pos.heading !== undefined) {
        newBearing = pos.heading
      }

      // Never-backwards guard: ignore bearing if it jumps >MAX_HEADING_JUMP_DEG
      if (newBearing !== null && prevBearingRef.current !== null) {
        const diff = Math.abs(bearingDiff(prevBearingRef.current, newBearing))
        if (diff > MAX_HEADING_JUMP_DEG) {
          newBearing = prevBearingRef.current   // keep old bearing
        }
      }
      if (newBearing !== null) {
        prevBearingRef.current = newBearing
        _navBearing = newBearing
      }

      // ── Move marker ─────────────────────────────────────────────────────
      m.setLngLat([displayLng, displayLat])

      if (!addedRef.current) {
        m.addTo(map)
        addedRef.current = true
      }

      // ── Rotate arrow ────────────────────────────────────────────────────
      const counterScale = 1 / getCourseUpScale()
      const vpScale = parseFloat(
        getComputedStyle(document.documentElement).getPropertyValue('--marker-viewport-scale') || '1'
      )
      const wrap = el.querySelector<HTMLElement>('.gps-avatar-arrow')
      if (wrap) {
        const courseUp = settingsStore.get().headingMode === 'course-up'
        // course-up: map already rotates to align travel direction with UP → arrow stays 0°
        // north-up:  use route-derived or GPS bearing so arrow points in travel direction
        const arrowDeg = courseUp ? 0 : Math.round(newBearing ?? 0)
        wrap.style.transform =
          `rotate(${arrowDeg}deg) scale(${(counterScale * vpScale).toFixed(4)})`
      }
    })

    return () => {
      unsub()
      marker.remove()
      markerRef.current      = null
      elemRef.current        = null
      addedRef.current       = false
      prevBearingRef.current = null
      _navBearing            = null
    }
  }, [])

  return null
}
