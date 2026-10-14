// ─── Route Layer ───────────────────────────────────────────────────────
// Null-render component. Draws/removes route lines on the MapLibre map.
// Primary route: bright blue. Alternatives: dimmed dashed, tap to switch.

import { useEffect, useRef } from 'react'
import * as maplibregl from 'maplibre-gl'
import { getMap } from '@/components/MapShell'
import { routeStore } from './routeStore.js'
import { followStore } from '@/features/follow/followStore'
import { isTeslaBrowser } from '@/lib/browser'

function routeGeoJSON(polyline: [number, number][]): GeoJSON.Feature<GeoJSON.LineString> {
  return {
    type:     'Feature',
    geometry: { type: 'LineString', coordinates: polyline.map(([lat, lng]) => [lng, lat]) },
    properties: {},
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

export function RouteLayer() {
  const activeIdsRef   = useRef<string[]>([])   // [sourceId, layerId] pairs
  const destMarkerRef  = useRef<maplibregl.Marker | null>(null)
  const prevIndexRef   = useRef<number>(-1)

  useEffect(() => {
    let cancelled = false

    function init(map: maplibregl.Map): () => void {

      function removeRoutes(): void {
        for (const id of activeIdsRef.current) {
          if (map.getLayer(id))  map.removeLayer(id)
          if (map.getSource(id)) map.removeSource(id)
        }
        activeIdsRef.current = []
        destMarkerRef.current?.remove()
        destMarkerRef.current = null
      }

      function syncRoute(): void {
        if (!map.isStyleLoaded()) { map.once('style.load', syncRoute); return }

        const { routes, activeRouteIndex, destination } = routeStore.getState()

        removeRoutes()

        if (!routes.length || !destination) return

        const ids: string[] = []

        // Draw alternatives first (below primary) — add in reverse order
        // so primary renders on top
        for (let i = routes.length - 1; i >= 0; i--) {
          if (i === activeRouteIndex) continue
          const srcId = `route-alt-src-${i}`
          const lyrId = `route-alt-layer-${i}`

          map.addSource(srcId, { type: 'geojson', data: routeGeoJSON(routes[i]!.polyline) })
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
          map.on('click', lyrId, () => { routeStore.selectRoute(i) })
          ids.push(srcId, lyrId)
        }

        // Draw active route on top
        const active = routes[activeRouteIndex]!
        const pSrcId = 'route-primary-src'
        const pLyrId = 'route-primary-layer'
        map.addSource(pSrcId, { type: 'geojson', data: routeGeoJSON(active.polyline) })
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
        ids.push(pSrcId, pLyrId)
        activeIdsRef.current = ids

        // Destination marker
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
            padding: { top: 80, bottom: 80, left: 80, right: 80 },
            maxZoom: 15,
            animate: !isTeslaBrowser,
          })
        }
        prevIndexRef.current = activeRouteIndex
      }

      const unsub = routeStore.subscribe(syncRoute)
      syncRoute()

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
