// ─── Speed Camera Marker Layer ─────────────────────────────────────────
//
// Renders static speed cameras as Leaflet DivIcon markers.
// Null-render React component — all DOM manipulation is imperative Leaflet.
//
// Icon design: square sign (distinct from circular EV/event markers),
// 📷 emoji + speed limit number if known.
// Hidden below zoom 10 — too many markers at country level.

import { useEffect, useRef } from 'react'
import { L } from '@/lib/leaflet'
import { getMap } from '@/components/MapShell'
import { cameraStore } from './cameraStore'
import type { SpeedCamera } from './types'

const MIN_ZOOM = 10   // don't show cameras at country-level zoom

// Margin beyond viewport to pre-render (degrees)
const VIEWPORT_PAD = 0.05

function makeCameraIcon(cam: SpeedCamera): L.DivIcon {
  const speed = cam.maxspeed
  const label = speed != null ? `${speed}` : '📷'

  return L.divIcon({
    className: '',
    html: `<div style="
      width:44px;height:44px;
      display:flex;align-items:center;justify-content:center;
      cursor:default;pointer-events:none;
    "><div style="
      width:36px;height:36px;border-radius:6px;
      background:#f97316;
      border:2px solid rgba(255,255,255,0.85);
      box-shadow:0 2px 8px rgba(0,0,0,0.55);
      display:flex;flex-direction:column;align-items:center;justify-content:center;
      gap:0;
      user-select:none;-webkit-user-select:none;
    ">
      <span style="font-size:14px;line-height:1;">📷</span>
      ${speed != null ? `<span style="font-size:9px;font-weight:700;color:#fff;line-height:1;margin-top:1px;">${label}</span>` : ''}
    </div></div>`,
    iconSize:   [44, 44],
    iconAnchor: [22, 22],
  })
}

export function CameraMarkerLayer() {
  const registryRef  = useRef<Map<string, L.Marker>>(new Map())
  const zoomRef      = useRef<number>(16)
  const moveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    let cancelled = false

    function init(map: L.Map): () => void {
      const registry = registryRef.current
      zoomRef.current = map.getZoom()

      function clearAll(): void {
        for (const m of registry.values()) m.remove()
        registry.clear()
      }

      function getBounds() {
        const b = map.getBounds()
        return {
          minLat: b.getSouth() - VIEWPORT_PAD,
          maxLat: b.getNorth() + VIEWPORT_PAD,
          minLng: b.getWest()  - VIEWPORT_PAD,
          maxLng: b.getEast()  + VIEWPORT_PAD,
        }
      }

      function syncMarkers(): void {
        const { cameras } = cameraStore.getState()

        // Hide all cameras when zoomed out
        if (zoomRef.current < MIN_ZOOM) {
          clearAll()
          return
        }

        const bounds = getBounds()

        // Only render cameras within current viewport + margin
        const visible = cameras.filter(
          (c) => c.lat >= bounds.minLat && c.lat <= bounds.maxLat &&
                 c.lng >= bounds.minLng && c.lng <= bounds.maxLng,
        )

        const incoming = new Set(visible.map((c) => c.id))

        // Remove cameras outside viewport
        for (const [id, marker] of registry) {
          if (!incoming.has(id)) { marker.remove(); registry.delete(id) }
        }

        // Add cameras inside viewport
        for (const cam of visible) {
          if (registry.has(cam.id)) continue
          const marker = L.marker([cam.lat, cam.lng], {
            icon:        makeCameraIcon(cam),
            zIndexOffset: 5,
            interactive: false,
          }).addTo(map)

          const tooltip = cam.maxspeed != null
            ? `Скоростна камера — ${cam.maxspeed} км/ч`
            : 'Скоростна камера'
          marker.bindTooltip(tooltip, { direction: 'top', offset: L.point(0, -6), sticky: false })
          registry.set(cam.id, marker)
        }
      }

      function onZoomEnd(): void {
        zoomRef.current = map.getZoom()
        syncMarkers()
      }

      function onMoveEnd(): void {
        if (moveTimerRef.current) clearTimeout(moveTimerRef.current)
        moveTimerRef.current = setTimeout(syncMarkers, 200)
      }

      const unsubCameras = cameraStore.subscribe(syncMarkers)
      map.on('zoomend', onZoomEnd)
      map.on('moveend', onMoveEnd)

      // Trigger initial fetch + render
      cameraStore.load()
      syncMarkers()

      return () => {
        if (moveTimerRef.current) clearTimeout(moveTimerRef.current)
        map.off('zoomend', onZoomEnd)
        map.off('moveend', onMoveEnd)
        unsubCameras()
        clearAll()
      }
    }

    let cleanup: (() => void) | null = null
    const map = getMap()
    if (map) {
      cleanup = init(map)
    } else {
      const frame = requestAnimationFrame(() => {
        if (cancelled) return
        const m = getMap()
        if (m) cleanup = init(m)
      })
      return () => { cancelled = true; cancelAnimationFrame(frame) }
    }

    return () => { cancelled = true; cleanup?.() }
  }, [])

  return null
}
