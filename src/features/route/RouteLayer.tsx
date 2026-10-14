// ─── Route Layer ───────────────────────────────────────────────────────
// Null-render component. Draws/removes route lines on the MapLibre map.
// Primary route: bright blue. Alternatives: dimmed dashed, tap to switch.

import { useEffect, useRef } from 'react'
import * as maplibregl from 'maplibre-gl'
import { getMap } from '@/components/MapShell'
import { routeStore } from './routeStore.js'
import { followStore } from '@/features/follow/followStore'
import { isTeslaBrowser } from '@/lib/browser'

function routeGeoJSON(polyline: [number, number][]): GeoJSON.FeatureCollection {
  return {
    type: 'FeatureCollection',
    features: [{
      type:     'Feature',
      geometry: { type: 'LineString', coordinates: polyline.map(([lat, lng]) => [lng, lat]) },
      properties: {},
    }],
  }
}

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

interface ClickEntry { lyrId: string; fn: () => void }

export function RouteLayer() {
  const activeIdsRef  = useRef<string[]>([])
  const clicksRef     = useRef<ClickEntry[]>([])
  const destMarkerRef = useRef<maplibregl.Marker | null>(null)
  const prevIndexRef  = useRef<number>(-1)

  useEffect(() => {
    let cancelled = false

    function init(map: maplibregl.Map): () => void {

      function removeRoutes(): void {
        // Remove click handlers
        for (const { lyrId, fn } of clicksRef.current) {
          try { map.off('click', lyrId, fn) } catch (_) { /* noop */ }
        }
        clicksRef.current = []

        // Remove layers first, then sources
        for (const id of activeIdsRef.current) {
          try { if (map.getLayer(id)) map.removeLayer(id) } catch (_) { /* noop */ }
        }
        for (const id of activeIdsRef.current) {
          try { if (map.getSource(id)) map.removeSource(id) } catch (_) { /* noop */ }
        }
        activeIdsRef.current = []
        destMarkerRef.current?.remove()
        destMarkerRef.current = null
      }

      function drawRoute(): void {
        if (!map.isStyleLoaded()) { map.once('style.load', drawRoute); return }

        const { routes, activeRouteIndex, destination } = routeStore.getState()

        removeRoutes()

        if (!routes.length || !destination) return

        try {
          const ids: string[] = []

          // Draw alternatives first (below primary) — reverse order so primary is on top
          for (let i = routes.length - 1; i >= 0; i--) {
            if (i === activeRouteIndex) continue
            const srcId = `route-alt-src-${i}`
            const lyrId = `route-alt-layer-${i}`

            if (!map.getSource(srcId)) {
              map.addSource(srcId, { type: 'geojson', data: routeGeoJSON(routes[i]!.polyline) })
            }
            if (!map.getLayer(lyrId)) {
              map.addLayer({
                id:     lyrId,
                type:   'line',
                source: srcId,
                layout: { 'line-join': 'round', 'line-cap': 'round' },
                paint:  {
                  'line-color':     '#2B7FFF',
                  'line-width':     4,
                  'line-opacity':   0.35,
                  'line-dasharray': [8, 6],
                },
              })
            }
            const idx = i
            const fn = () => { routeStore.selectRoute(idx) }
            map.on('click', lyrId, fn)
            clicksRef.current.push({ lyrId, fn })
            ids.push(srcId, lyrId)
          }

          // Draw active route on top
          const active = routes[activeRouteIndex]!
          const pSrcId = 'route-primary-src'
          const pLyrId = 'route-primary-layer'

          if (!map.getSource(pSrcId)) {
            map.addSource(pSrcId, { type: 'geojson', data: routeGeoJSON(active.polyline) })
          } else {
            // Source already exists (e.g. on re-route) — update data in place
            const src = map.getSource<maplibregl.GeoJSONSource>(pSrcId)
            src?.setData(routeGeoJSON(active.polyline))
          }
          if (!map.getLayer(pLyrId)) {
            map.addLayer({
              id:     pLyrId,
              type:   'line',
              source: pSrcId,
              layout: { 'line-join': 'round', 'line-cap': 'round' },
              paint:  {
                'line-color':   '#2B7FFF',
                'line-width':   5,
                'line-opacity': 0.85,
              },
            })
          }
          ids.push(pSrcId, pLyrId)
          activeIdsRef.current = ids

          // Destination marker
          destMarkerRef.current?.remove()
          const destEl = makeDestElement()
          destMarkerRef.current = new maplibregl.Marker({ element: destEl, anchor: 'center' })
            .setLngLat([destination.lng, destination.lat])
            .addTo(map)

          // Fit bounds — on first load or alternative switch in preview mode
          const isFirstLoad  = prevIndexRef.current === -1
          const routeChanged = prevIndexRef.current !== activeRouteIndex
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

          map.triggerRepaint()

        } catch (err) {
          console.error('[RouteLayer] draw error:', err)
          // Force-clean any partial state so the next call can try again cleanly
          removeRoutes()
        }
      }

      const unsub = routeStore.subscribe(drawRoute)
      drawRoute()

      return () => {
        unsub()
        prevIndexRef.current = -1
        removeRoutes()
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
