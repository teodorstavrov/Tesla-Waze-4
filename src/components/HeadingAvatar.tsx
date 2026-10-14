// ─── GPS Avatar / Heading Marker ─────────────────────────────────────
//
// Null React component — all work done imperatively via MapLibre Marker.
//
// PERFORMANCE DESIGN (MapLibre version)
// ─────────────────────────────────────────────────────────────────────
// MapLibre Marker wraps a raw DOM element.
// On each GPS tick:
//   • marker.setLngLat([lng, lat]) — moves via CSS transform (no DOM change)
//   • wrap.style.transform = rotate(...)  — direct DOM mutation, no Marker API
//
// In course-up mode, map.setBearing(-heading) rotates the map natively.
// No CSS scale is applied to #map, so no counter-scale is needed on markers.
// HeadingAvatar arrow always points in the GPS heading direction.
// ─────────────────────────────────────────────────────────────────────

import { useEffect, useRef } from 'react'
import * as maplibregl from 'maplibre-gl'
import { getMap, getCourseUpScale } from '@/components/MapShell'
import { gpsStore } from '@/features/gps/gpsStore'
import type { GpsPosition } from '@/features/gps/types'

const ICON_SIZE = 66

function makeElement(): HTMLDivElement {
  const root = document.createElement('div')
  root.className = 'gps-avatar-root'
  root.style.cssText = `width:${ICON_SIZE}px;height:${ICON_SIZE}px;pointer-events:none`

  root.innerHTML = `<div class="gps-avatar-arrow" style="transform:rotate(0deg)">
    <svg width="${ICON_SIZE}" height="${ICON_SIZE}" viewBox="0 0 28 28" fill="none" aria-hidden="true">
      <circle cx="14" cy="14" r="13" fill="rgba(41,121,255,0.15)"/>
      <polygon points="14,3 20,22 14,18 8,22"
        fill="#2979ff" stroke="white" stroke-width="1.5" stroke-linejoin="round"/>
    </svg>
  </div>`

  return root
}

// ─────────────────────────────────────────────────────────────────
export function HeadingAvatar() {
  const markerRef = useRef<maplibregl.Marker | null>(null)
  const elemRef   = useRef<HTMLDivElement | null>(null)
  const addedRef  = useRef(false)

  useEffect(() => {
    const map = getMap()
    if (!map) return

    const el = makeElement()
    elemRef.current = el

    // Create MapLibre Marker with offset so anchor center = GPS point
    const marker = new maplibregl.Marker({
      element: el,
      anchor: 'center',
      rotationAlignment: 'viewport',
    })
      .setLngLat([0, 0])  // dummy position until first GPS fix
    markerRef.current = marker

    const unsub = gpsStore.onPosition((pos: GpsPosition) => {
      const m = markerRef.current
      if (!m) return

      // Move marker (CSS transform — no DOM change)
      m.setLngLat([pos.lng, pos.lat])

      // Add to map on first real GPS position
      if (!addedRef.current) {
        m.addTo(map)
        addedRef.current = true
      }

      // Rotate the arrow to GPS heading.
      // In course-up mode: map bearing = -heading, so arrow always points up
      // on screen. In north-up mode: arrow rotates to show direction of travel.
      // getCourseUpScale() always returns 1 in MapLibre (no CSS scale on #map).
      const counterScale = 1 / getCourseUpScale()
      const vpScale = parseFloat(
        getComputedStyle(document.documentElement).getPropertyValue('--marker-viewport-scale') || '1'
      )
      const wrap = el.querySelector<HTMLElement>('.gps-avatar-arrow')
      if (wrap) {
        wrap.style.transform =
          `rotate(${Math.round(pos.heading ?? 0)}deg) scale(${(counterScale * vpScale).toFixed(4)})`
      }
    })

    return () => {
      unsub()
      marker.remove()
      markerRef.current = null
      elemRef.current = null
      addedRef.current = false
    }
  }, []) // runs once — map is stable

  return null
}
