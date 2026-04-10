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
import { getLang, t } from '@/lib/locale'
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
      cursor:pointer;
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

function buildCameraPopup(cam: SpeedCamera): string {
  const directionLabel = cam.direction != null ? compassLabel(cam.direction) : null

  const rows: string[] = []

  if (cam.maxspeed != null) {
    rows.push(`
      <div style="display:flex;align-items:center;justify-content:center;
        width:56px;height:56px;border-radius:50%;
        border:4px solid #e31937;
        background:rgba(227,25,55,0.08);
        margin:0 auto 10px;flex-shrink:0;">
        <span style="font-size:20px;font-weight:900;color:#fff;line-height:1;">${cam.maxspeed}</span>
      </div>
      <div style="font-size:11px;color:rgba(255,255,255,0.45);text-align:center;margin-top:-6px;margin-bottom:8px;letter-spacing:0.05em;">${t('sections.kmh')}</div>
    `)
  } else {
    rows.push(`<div style="font-size:28px;text-align:center;margin-bottom:8px;">📷</div>`)
  }

  rows.push(`<div style="font-size:14px;font-weight:700;color:#f2f2f2;text-align:center;margin-bottom:4px;">${getLang() === 'bg' ? 'Скоростна камера' : 'Speed camera'}</div>`)

  if (directionLabel) {
    rows.push(`<div style="font-size:12px;color:rgba(255,255,255,0.5);text-align:center;">${getLang() === 'bg' ? 'Посока' : 'Direction'}: ${directionLabel}</div>`)
  }

  rows.push(`<div style="font-size:11px;color:rgba(255,255,255,0.28);text-align:center;margin-top:6px;">${cam.lat.toFixed(5)}, ${cam.lng.toFixed(5)}</div>`)

  return `<div style="
    font-family:system-ui,sans-serif;
    background:rgba(18,18,26,0.97);
    border:1px solid rgba(255,255,255,0.12);
    border-radius:14px;
    padding:18px 20px 14px;
    min-width:160px;
    box-shadow:0 8px 32px rgba(0,0,0,0.6);
  ">${rows.join('')}</div>`
}

function compassLabel(deg: number): string {
  const bg = ['С', 'СИ', 'И', 'ЮИ', 'Ю', 'ЮЗ', 'З', 'СЗ']
  const en = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW']
  const dirs = getLang() === 'bg' ? bg : en
  return dirs[Math.round(deg / 45) % 8] ?? `${deg}°`
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
        const { cameras, country } = cameraStore.getState()

        // Hide all cameras when zoomed out
        if (zoomRef.current < MIN_ZOOM) {
          console.log(`[NO_CAM] syncMarkers:hidden zoom=${zoomRef.current} < MIN_ZOOM=${MIN_ZOOM}`)
          clearAll()
          return
        }

        const bounds = getBounds()

        // Only render cameras within current viewport + margin
        const visible = cameras.filter(
          (c) => c.lat >= bounds.minLat && c.lat <= bounds.maxLat &&
                 c.lng >= bounds.minLng && c.lng <= bounds.maxLng,
        )

        console.log(`[NO_CAM] syncMarkers country=${country} stored=${cameras.length} zoom=${zoomRef.current} bounds=[${bounds.minLat.toFixed(3)},${bounds.minLng.toFixed(3)},${bounds.maxLat.toFixed(3)},${bounds.maxLng.toFixed(3)}] visible=${visible.length}`)

        const incoming = new Set(visible.map((c) => c.id))

        // Remove cameras outside viewport
        for (const [id, marker] of registry) {
          if (!incoming.has(id)) { marker.remove(); registry.delete(id) }
        }

        // Add cameras inside viewport
        for (const cam of visible) {
          if (registry.has(cam.id)) continue
          const marker = L.marker([cam.lat, cam.lng], {
            icon:         makeCameraIcon(cam),
            zIndexOffset: 5,
            interactive:  true,
          }).addTo(map)

          marker.bindPopup(buildCameraPopup(cam), {
            className:   'camera-popup',
            maxWidth:    220,
            offset:      L.point(0, -14),
            closeButton: true,
          })

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
