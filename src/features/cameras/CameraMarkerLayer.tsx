// ─── Speed Camera Marker Layer ─────────────────────────────────────────
//
// Renders static speed cameras as MapLibre DOM-element markers.
// Null-render React component — all DOM manipulation is imperative.
//
// Icon design: square sign, 📷 emoji + speed limit number if known.
// Hidden below zoom 10.

import { useEffect, useRef } from 'react'
import * as maplibregl from 'maplibre-gl'
import { getMap } from '@/components/MapShell'
import { cameraStore } from './cameraStore'
import { getLang, t } from '@/lib/locale'
import { getActivePerformanceProfile } from '@/config/performanceProfiles'
import type { SpeedCamera } from './types'

const MIN_ZOOM = 10
const VIEWPORT_PAD = 0.05

function makeCameraElement(cam: SpeedCamera): HTMLDivElement {
  const speed = cam.maxspeed
  const wrap = document.createElement('div')
  wrap.className = 'marker-scale-wrap'
  wrap.style.cssText = 'width:44px;height:44px;display:flex;align-items:center;justify-content:center;cursor:pointer'

  const sign = document.createElement('div')
  sign.style.cssText = [
    'width:36px', 'height:36px', 'border-radius:6px',
    'background:#f97316',
    'border:2px solid rgba(255,255,255,0.85)',
    'box-shadow:0 2px 8px rgba(0,0,0,0.55)',
    'display:flex', 'flex-direction:column', 'align-items:center', 'justify-content:center',
    'user-select:none', '-webkit-user-select:none',
  ].join(';')

  const icon = document.createElement('span')
  icon.style.cssText = 'font-size:14px;line-height:1'
  icon.textContent = '📷'
  sign.appendChild(icon)

  if (speed != null) {
    const lbl = document.createElement('span')
    lbl.style.cssText = 'font-size:9px;font-weight:700;color:#fff;line-height:1;margin-top:1px'
    lbl.textContent = `${speed}`
    sign.appendChild(lbl)
  }

  wrap.appendChild(sign)
  return wrap
}

function buildCameraPopupEl(cam: SpeedCamera): HTMLElement {
  const directionLabel = cam.direction != null ? compassLabel(cam.direction) : null
  const container = document.createElement('div')
  container.style.cssText = [
    'font-family:system-ui,sans-serif',
    'background:rgba(18,18,26,0.97)',
    'border:1px solid rgba(255,255,255,0.12)',
    'border-radius:14px',
    'padding:18px 20px 14px',
    'min-width:160px',
    'box-shadow:0 8px 32px rgba(0,0,0,0.6)',
  ].join(';')

  if (cam.maxspeed != null) {
    const ring = document.createElement('div')
    ring.style.cssText = [
      'display:flex', 'align-items:center', 'justify-content:center',
      'width:56px', 'height:56px', 'border-radius:50%',
      'border:4px solid #e31937',
      'background:rgba(227,25,55,0.08)',
      'margin:0 auto 10px', 'flex-shrink:0',
    ].join(';')
    const sp = document.createElement('span')
    sp.style.cssText = 'font-size:20px;font-weight:900;color:#fff;line-height:1'
    sp.textContent = `${cam.maxspeed}`
    ring.appendChild(sp)
    container.appendChild(ring)

    const kmh = document.createElement('div')
    kmh.style.cssText = 'font-size:11px;color:rgba(255,255,255,0.45);text-align:center;margin-top:-6px;margin-bottom:8px;letter-spacing:0.05em'
    kmh.textContent = t('sections.kmh')
    container.appendChild(kmh)
  } else {
    const icon = document.createElement('div')
    icon.style.cssText = 'font-size:28px;text-align:center;margin-bottom:8px'
    icon.textContent = '📷'
    container.appendChild(icon)
  }

  const title = document.createElement('div')
  title.style.cssText = 'font-size:14px;font-weight:700;color:#f2f2f2;text-align:center;margin-bottom:4px'
  title.textContent = getLang() === 'bg' ? 'Скоростна камера' : 'Speed camera'
  container.appendChild(title)

  if (directionLabel) {
    const dir = document.createElement('div')
    dir.style.cssText = 'font-size:12px;color:rgba(255,255,255,0.5);text-align:center'
    dir.textContent = `${getLang() === 'bg' ? 'Посока' : 'Direction'}: ${directionLabel}`
    container.appendChild(dir)
  }

  const coords = document.createElement('div')
  coords.style.cssText = 'font-size:11px;color:rgba(255,255,255,0.28);text-align:center;margin-top:6px'
  coords.textContent = `${cam.lat.toFixed(5)}, ${cam.lng.toFixed(5)}`
  container.appendChild(coords)

  return container
}

function compassLabel(deg: number): string {
  const bg = ['С', 'СИ', 'И', 'ЮИ', 'Ю', 'ЮЗ', 'З', 'СЗ']
  const en = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW']
  const dirs = getLang() === 'bg' ? bg : en
  return dirs[Math.round(deg / 45) % 8] ?? `${deg}°`
}

export function CameraMarkerLayer() {
  const registryRef  = useRef<Map<string, maplibregl.Marker>>(new Map())
  const zoomRef      = useRef<number>(16)
  const moveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    let cancelled = false

    function init(map: maplibregl.Map): () => void {
      const registry = registryRef.current
      zoomRef.current = map.getZoom()

      function clearAll(): void {
        for (const m of registry.values()) m.remove()
        registry.clear()
      }

      function getBoundsWithPad() {
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

        if (zoomRef.current < MIN_ZOOM) { clearAll(); return }

        const bounds = getBoundsWithPad()
        const visible = cameras.filter(
          (c) => c.lat >= bounds.minLat && c.lat <= bounds.maxLat &&
                 c.lng >= bounds.minLng && c.lng <= bounds.maxLng,
        )

        const incoming = new Set(visible.map((c) => c.id))

        for (const [id, marker] of registry) {
          if (!incoming.has(id)) { marker.remove(); registry.delete(id) }
        }

        for (const cam of visible) {
          if (registry.has(cam.id)) continue

          const el = makeCameraElement(cam)

          el.addEventListener('click', () => {
            const popup = new maplibregl.Popup({
              className:   'camera-popup',
              maxWidth:    '220px',
              closeButton: true,
              offset:      [0, -14] as [number, number],
            }).setLngLat([cam.lng, cam.lat])
            popup.setDOMContent(buildCameraPopupEl(cam)).addTo(map)
          })

          const marker = new maplibregl.Marker({ element: el, anchor: 'center' })
            .setLngLat([cam.lng, cam.lat])
            .addTo(map)

          registry.set(cam.id, marker)
        }
      }

      function onZoomEnd(): void {
        zoomRef.current = map.getZoom()
        syncMarkers()
      }

      function onMoveEnd(): void {
        if (moveTimerRef.current) clearTimeout(moveTimerRef.current)
        const debounce = getActivePerformanceProfile().cameraDebounceMs
        moveTimerRef.current = setTimeout(syncMarkers, debounce)
      }

      const unsubCameras = cameraStore.subscribe(syncMarkers)
      map.on('zoomend', onZoomEnd)
      map.on('moveend', onMoveEnd)

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
