// ─── Route Layer ───────────────────────────────────────────────────────
// Draws the active route as a canvas overlay on top of the MapLibre map.
//
// After 5 failed attempts with addSource/addLayer (v1–v5), we bypass
// MapLibre's GeoJSON/vector layer system entirely. We create a plain
// <canvas> element positioned over the map container and draw the route
// using the Canvas 2D API. map.project([lng,lat]) converts geo coordinates
// to screen pixels accounting for zoom, bearing and pitch — so this works
// correctly in both north-up and course-up modes.

import { useEffect, useRef } from 'react'
import * as maplibregl from 'maplibre-gl'
import { getMap } from '@/components/MapShell'
import { routeStore } from './routeStore.js'
import { followStore } from '@/features/follow/followStore'
import { isTeslaBrowser } from '@/lib/browser'

const MAX_ALT = 2

function makeDestElement(): HTMLDivElement {
  const wrap = document.createElement('div')
  wrap.className = 'marker-scale-wrap'
  const circle = document.createElement('div')
  circle.style.cssText = [
    'width:32px', 'height:32px', 'border-radius:50%',
    'background:#e31937', 'border:3px solid #fff',
    'box-shadow:0 2px 10px rgba(227,25,55,0.6)',
    'display:flex', 'align-items:center', 'justify-content:center',
    'font-size:14px', 'line-height:1',
  ].join(';')
  circle.textContent = '🏁'
  wrap.appendChild(circle)
  return wrap
}

function drawPolyline(
  ctx:      CanvasRenderingContext2D,
  map:      maplibregl.Map,
  polyline: [number, number][],
): void {
  if (polyline.length < 2) return
  ctx.beginPath()
  for (let i = 0; i < polyline.length; i++) {
    const [lat, lng] = polyline[i]!
    const pt = map.project([lng, lat])
    if (i === 0) ctx.moveTo(pt.x, pt.y)
    else         ctx.lineTo(pt.x, pt.y)
  }
  ctx.stroke()
}

// ─────────────────────────────────────────────────────────────────────────
export function RouteLayer() {
  const destMarkerRef = useRef<maplibregl.Marker | null>(null)
  const prevIndexRef  = useRef<number>(-1)

  useEffect(() => {
    let cancelled = false

    function init(map: maplibregl.Map): () => void {
      // ── Canvas overlay ───────────────────────────────────────────────────
      const container = map.getContainer()
      const canvas    = document.createElement('canvas')
      canvas.style.cssText = 'position:absolute;inset:0;pointer-events:none;z-index:2'
      container.appendChild(canvas)

      function resize(): void {
        canvas.width  = container.offsetWidth
        canvas.height = container.offsetHeight
        redraw()
      }
      resize()

      // ── Redraw route on canvas ────────────────────────────────────────────
      function redraw(): void {
        const ctx = canvas.getContext('2d')
        if (!ctx) return
        ctx.clearRect(0, 0, canvas.width, canvas.height)

        const { routes, activeRouteIndex, destination } = routeStore.getState()
        if (!routes.length || !destination) return

        const active = routes[activeRouteIndex]!
        const alts   = routes
          .map((r, i) => ({ r, i }))
          .filter(({ i }) => i !== activeRouteIndex)
          .slice(0, MAX_ALT)

        // Alt routes (dashed, semi-transparent)
        ctx.save()
        ctx.strokeStyle = 'rgba(43,127,255,0.4)'
        ctx.lineWidth   = 4
        ctx.lineJoin    = 'round'
        ctx.lineCap     = 'round'
        ctx.setLineDash([10, 7])
        for (const { r } of alts) {
          drawPolyline(ctx, map, r.polyline)
        }
        ctx.restore()

        // Primary route (solid blue)
        ctx.save()
        ctx.strokeStyle = '#2B7FFF'
        ctx.lineWidth   = 7
        ctx.lineJoin    = 'round'
        ctx.lineCap     = 'round'
        ctx.shadowColor = 'rgba(43,127,255,0.5)'
        ctx.shadowBlur  = 6
        drawPolyline(ctx, map, active.polyline)
        ctx.restore()

        // Destination marker: update or create
        if (destMarkerRef.current) {
          destMarkerRef.current.setLngLat([destination.lng, destination.lat])
        } else {
          destMarkerRef.current = new maplibregl.Marker({
            element: makeDestElement(),
            anchor:  'center',
          }).setLngLat([destination.lng, destination.lat]).addTo(map)
        }
      }

      // ── Route-change subscription ─────────────────────────────────────────
      function onRouteChange(): void {
        const { routes, activeRouteIndex, destination } = routeStore.getState()

        // Fit bounds when route first appears or active route switches in preview
        if (routes.length && destination) {
          const active = routes[activeRouteIndex]!
          const isFirstLoad  = prevIndexRef.current === -1
          const routeChanged = prevIndexRef.current !== -1 && prevIndexRef.current !== activeRouteIndex
          const { mode } = routeStore.getState()
          if (isFirstLoad || (routeChanged && mode === 'preview')) {
            followStore.setFollowing(false)
            const bounds = new maplibregl.LngLatBounds()
            for (const [lat, lng] of active.polyline) bounds.extend([lng, lat])
            map.fitBounds(bounds, {
              padding:  { top: 80, bottom: 80, left: 80, right: 80 },
              maxZoom:  15,
              duration: isTeslaBrowser ? 0 : 600,
            })
          }
          prevIndexRef.current = activeRouteIndex
        } else {
          // Route cleared
          prevIndexRef.current = -1
          destMarkerRef.current?.remove()
          destMarkerRef.current = null
        }

        redraw()
      }

      // Redraw on every map render frame (handles pan/zoom/rotate)
      map.on('render', redraw)

      // Resize canvas when window resizes
      window.addEventListener('resize', resize)

      const unsub = routeStore.subscribe(onRouteChange)
      redraw()   // sync current state

      return () => {
        map.off('render', redraw)
        window.removeEventListener('resize', resize)
        unsub()
        canvas.remove()
        prevIndexRef.current = -1
        destMarkerRef.current?.remove()
        destMarkerRef.current = null
      }
    }

    // MapShell (sibling, earlier in JSX) sets mapInstance before this runs.
    // rAF is a safety net for edge cases.
    let cleanupFn: (() => void) | null = null
    const map = getMap()
    if (map) {
      cleanupFn = init(map)
    } else {
      const frame = requestAnimationFrame(() => {
        if (cancelled) return
        const m = getMap()
        if (m) cleanupFn = init(m)
      })
      return () => { cancelled = true; cancelAnimationFrame(frame) }
    }

    return () => { cancelled = true; cleanupFn?.() }
  }, [])

  return null
}
