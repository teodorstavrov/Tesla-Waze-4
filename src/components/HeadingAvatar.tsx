// ─── GPS Avatar / Heading Marker ─────────────────────────────────────
//
// This is a "null React component" — it renders nothing to the DOM.
// All work is done imperatively on the Leaflet layer.
//
// PERFORMANCE DESIGN
// ─────────────────────────────────────────────────────────────────────
// GPS fires ~1 Hz. We CANNOT recreate a DivIcon on every tick.
// DivIcon creation forces Leaflet to remove and reinsert a DOM node,
// which causes a visible flash.
//
// Instead we use three tiers of update cost:
//
//   Tier 1 (cheapest) — marker.setLatLng([lat, lng])
//     Always called. Moves the marker via CSS transform — no DOM change.
//
//   Tier 2 (cheap) — direct DOM style mutation
//     When heading mode hasn't changed (arrow→arrow), we mutate the
//     arrow div's transform property directly. Zero Leaflet involvement.
//
//   Tier 3 (moderate, rare) — marker.setIcon(newIcon)
//     Only when mode switches (dot↔arrow). Forces a DOM replacement but
//     this only happens when you start/stop moving. Acceptable.
//
// This is the correct pattern for Tesla browser: minimize DOM churn.
// ─────────────────────────────────────────────────────────────────────

import { useEffect, useRef } from 'react'
import { L } from '@/lib/leaflet'
import { getMap, getCourseUpScale } from '@/components/MapShell'
import { gpsStore } from '@/features/gps/gpsStore'
import type { GpsPosition } from '@/features/gps/types'

const ICON_SIZE = 56
const ICON_ANCHOR: L.PointExpression = [28, 28]

// ── Icon HTML builders ────────────────────────────────────────────

function dotHtml(): string {
  return `<div class="gps-avatar-dot">
    <div class="gps-avatar-halo"></div>
    <div class="gps-avatar-circle"></div>
  </div>`
}

function arrowHtml(heading: number): string {
  return `<div class="gps-avatar-arrow" style="transform:rotate(${Math.round(heading)}deg)">
    <svg width="${ICON_SIZE}" height="${ICON_SIZE}" viewBox="0 0 28 28" fill="none" aria-hidden="true">
      <circle cx="14" cy="14" r="13" fill="rgba(41,121,255,0.15)"/>
      <polygon points="14,3 20,22 14,18 8,22"
        fill="#2979ff" stroke="white" stroke-width="1.5" stroke-linejoin="round"/>
    </svg>
  </div>`
}

function makeIcon(heading: number | null): L.DivIcon {
  return L.divIcon({
    html: arrowHtml(heading ?? 0),
    className: 'gps-avatar-root',
    iconSize: [ICON_SIZE, ICON_SIZE],
    iconAnchor: ICON_ANCHOR,
  })
}

// ─────────────────────────────────────────────────────────────────
export function HeadingAvatar() {
  const markerRef = useRef<L.Marker | null>(null)
  const addedRef  = useRef(false)

  useEffect(() => {
    const map = getMap()
    if (!map) return

    // Create marker at a dummy position — it won't be added to the map
    // until the first real GPS position arrives.
    const marker = L.marker([0, 0], {
      icon: makeIcon(null),
      zIndexOffset: 1000,
      interactive: false, // not clickable — improves touch pass-through
    })
    markerRef.current = marker

    const unsub = gpsStore.onPosition((pos: GpsPosition) => {
      const m = markerRef.current
      if (!m) return

      // Tier 1: move the marker (CSS transform — no DOM change)
      m.setLatLng([pos.lat, pos.lng])

      // Add to map on first position
      if (!addedRef.current) {
        m.addTo(map)
        addedRef.current = true
      }

      // Tier 2: mutate arrow rotation + counter-scale directly — no icon recreation.
      // In course-up mode the #map container is CSS-scaled by ~1.887 to fill the
      // screen after rotation. That scale inflates every child including this marker.
      // We apply scale(1/mapScale) to cancel the enlargement so the avatar always
      // renders at its default visual size.
      const el = m.getElement()
      const wrap = el?.querySelector<HTMLElement>('.gps-avatar-arrow')
      if (wrap) {
        const counterScale = 1 / getCourseUpScale()
        wrap.style.transform = `rotate(${Math.round(pos.heading ?? 0)}deg) scale(${counterScale})`
      }
    })

    // Hide the arrow during zoom so the position-snap from markerZoomAnimation:false
    // is never visible. The marker reappears immediately after zoom settles.
    const onZoomStart = () => {
      const el = markerRef.current?.getElement()
      if (el) el.style.opacity = '0'
    }
    const onZoomEnd = () => {
      const el = markerRef.current?.getElement()
      if (el) el.style.opacity = '1'
    }
    map.on('zoomstart', onZoomStart)
    map.on('zoomend',   onZoomEnd)

    return () => {
      map.off('zoomstart', onZoomStart)
      map.off('zoomend',   onZoomEnd)
      unsub()
      marker.remove()
      markerRef.current = null
      addedRef.current = false
    }
  }, []) // runs once — map is stable

  return null
}
