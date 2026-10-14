// ─── Route Layer ───────────────────────────────────────────────────────
// Draws the active route and alternatives as MapLibre GL line layers.
//
// PATTERN (v5 — mirrors SectionLayer which is confirmed working):
//  • Sources + layers are added ONCE at setup with empty GeoJSON.
//  • Route data is updated via setData() — never remove/re-add.
//  • On style reload the layers are re-added (getSource/getLayer guards).
//  • isStyleLoaded() + map.once('style.load', setup) for initial retry.

import { useEffect, useRef } from 'react'
import * as maplibregl from 'maplibre-gl'
import { getMap } from '@/components/MapShell'
import { routeStore } from './routeStore.js'
import { followStore } from '@/features/follow/followStore'
import { isTeslaBrowser } from '@/lib/browser'

const P_SRC = 'route-primary-src'
const P_LYR = 'route-primary-lyr'
const A_SRC = (n: number) => `route-alt${n}-src`
const A_LYR = (n: number) => `route-alt${n}-lyr`
const MAX_ALT = 2

function emptyFC(): GeoJSON.FeatureCollection {
  return { type: 'FeatureCollection', features: [] }
}

function routeGeoJSON(polyline: [number, number][]): GeoJSON.FeatureCollection {
  return {
    type: 'FeatureCollection',
    features: [{
      type:     'Feature',
      geometry: {
        type:        'LineString',
        coordinates: polyline.map(([lat, lng]) => [lng, lat]),
      },
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

// ─────────────────────────────────────────────────────────────────────────
export function RouteLayer() {
  const destMarkerRef = useRef<maplibregl.Marker | null>(null)
  const prevIndexRef  = useRef<number>(-1)

  useEffect(() => {
    let cancelled = false

    function init(map: maplibregl.Map): () => void {

      // ── Setup: add sources + layers once with empty data ────────────────
      function setup(): void {
        if (!map.isStyleLoaded()) { map.once('style.load', setup); return }

        // Alt layers (drawn first → below primary)
        for (let n = 0; n < MAX_ALT; n++) {
          if (!map.getSource(A_SRC(n))) {
            map.addSource(A_SRC(n), { type: 'geojson', data: emptyFC() })
          }
          if (!map.getLayer(A_LYR(n))) {
            map.addLayer({
              id:     A_LYR(n),
              type:   'line',
              source: A_SRC(n),
              layout: { 'line-join': 'round', 'line-cap': 'round' },
              paint:  {
                'line-color':     '#2B7FFF',
                'line-width':     4,
                'line-opacity':   0.35,
                'line-dasharray': [8, 6],
              },
            })
            // Click captured at time of click — reads current store state
            const idx = n
            map.on('click', A_LYR(idx), () => {
              const { routes, activeRouteIndex } = routeStore.getState()
              const alts = routes.map((r, i) => ({ r, i })).filter(({ i }) => i !== activeRouteIndex)
              const alt = alts[idx]
              if (alt) routeStore.selectRoute(alt.i)
            })
          }
        }

        // Primary route layer (on top)
        if (!map.getSource(P_SRC)) {
          map.addSource(P_SRC, { type: 'geojson', data: emptyFC() })
        }
        if (!map.getLayer(P_LYR)) {
          map.addLayer({
            id:     P_LYR,
            type:   'line',
            source: P_SRC,
            layout: { 'line-join': 'round', 'line-cap': 'round' },
            paint:  {
              'line-color':   '#2B7FFF',
              'line-width':   6,
              'line-opacity': 1,
            },
          })
        }

        sync()
      }

      // ── Sync: update source data without removing/re-adding layers ──────
      function sync(): void {
        const pSrc = map.getSource(P_SRC) as maplibregl.GeoJSONSource | undefined
        if (!pSrc) return   // setup not done yet

        const { routes, activeRouteIndex, destination } = routeStore.getState()

        if (!routes.length || !destination) {
          pSrc.setData(emptyFC())
          for (let n = 0; n < MAX_ALT; n++) {
            (map.getSource(A_SRC(n)) as maplibregl.GeoJSONSource | undefined)?.setData(emptyFC())
          }
          destMarkerRef.current?.remove()
          destMarkerRef.current = null
          return
        }

        const active = routes[activeRouteIndex]!
        const alts   = routes.map((r, i) => ({ r, i })).filter(({ i }) => i !== activeRouteIndex)

        // Update primary route data
        pSrc.setData(routeGeoJSON(active.polyline))

        // Update alt route data
        for (let n = 0; n < MAX_ALT; n++) {
          const aSrc = map.getSource(A_SRC(n)) as maplibregl.GeoJSONSource | undefined
          if (!aSrc) continue
          aSrc.setData(n < alts.length ? routeGeoJSON(alts[n]!.r.polyline) : emptyFC())
        }

        // Destination marker: move if exists, create if not
        if (destMarkerRef.current) {
          destMarkerRef.current.setLngLat([destination.lng, destination.lat])
        } else {
          destMarkerRef.current = new maplibregl.Marker({
            element: makeDestElement(),
            anchor:  'center',
          }).setLngLat([destination.lng, destination.lat]).addTo(map)
        }

        // Fit bounds on first route or active-route switch in preview mode
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

        map.triggerRepaint()
      }

      // Re-add layers after a style reload (tile theme switch)
      map.on('style.load', setup)

      setup()
      const unsub = routeStore.subscribe(sync)

      return () => {
        map.off('style.load', setup)
        unsub()
        prevIndexRef.current = -1
        destMarkerRef.current?.remove()
        destMarkerRef.current = null
        for (let n = 0; n < MAX_ALT; n++) {
          if (map.getLayer(A_LYR(n))) map.removeLayer(A_LYR(n))
          if (map.getSource(A_SRC(n))) map.removeSource(A_SRC(n))
        }
        if (map.getLayer(P_LYR)) map.removeLayer(P_LYR)
        if (map.getSource(P_SRC)) map.removeSource(P_SRC)
      }
    }

    // MapShell (sibling, comes first in JSX) sets mapInstance before this runs,
    // so getMap() is typically valid. rAF is a safety net for edge cases.
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
