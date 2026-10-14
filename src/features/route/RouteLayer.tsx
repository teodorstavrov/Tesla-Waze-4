// ─── Route Layer ───────────────────────────────────────────────────────
// Draws the active route and alternatives as MapLibre GL line layers.
//
// DESIGN PRINCIPLES (v4 — root cause fix: rAF fallback for getMap() null):
//  1. useEffect children run BEFORE parent's (MapShell sets mapInstance in its
//     own useEffect). getMap() is null when RouteLayer's effect first runs.
//     rAF defers init to the next cycle after MapShell's effect has set the map.
//  2. cleanup() always unconditionally removes sources+layers via try-catch —
//     no getLayer/getSource guards. Prevents "source already exists" cascades.
//  3. draw() is idempotent: cleanup → add fresh with real data.
//  4. map.on('style.load', draw) persistent listener ensures route is redrawn
//     after any style reload during navigation.
//  5. draw() returns early if style not loaded — persistent listener retries.

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
      // Track alt click handler functions for proper cleanup
      const altClickFns: Array<(() => void) | null> = [null, null]

      // ── Unconditional cleanup ────────────────────────────────────────────
      // Uses bare try-catch WITHOUT getLayer/getSource guards —
      // the only foolproof way to prevent "source already exists" cascades.
      function cleanup(): void {
        for (let n = 0; n < MAX_ALT; n++) {
          const fn = altClickFns[n]
          if (fn) {
            try { map.off('click', A_LYR(n), fn) } catch { /* noop */ }
            altClickFns[n] = null
          }
          try { map.removeLayer(A_LYR(n)) } catch { /* noop */ }
          try { map.removeSource(A_SRC(n)) } catch { /* noop */ }
        }
        try { map.removeLayer(P_LYR) } catch { /* noop */ }
        try { map.removeSource(P_SRC) } catch { /* noop */ }
        destMarkerRef.current?.remove()
        destMarkerRef.current = null
      }

      // ── Draw current route state ─────────────────────────────────────────
      function draw(): void {
        if (!map.isStyleLoaded()) return   // persistent style.load listener will retry

        const { routes, activeRouteIndex, destination } = routeStore.getState()

        cleanup()   // always clean slate before redraw

        if (!routes.length || !destination) return

        try {
          const active = routes[activeRouteIndex]!
          const alts   = routes
            .map((r, i) => ({ r, i }))
            .filter(({ i }) => i !== activeRouteIndex)

          // Alternatives drawn first (below primary in z-order)
          for (let n = 0; n < Math.min(alts.length, MAX_ALT); n++) {
            const { r: altRoute, i: routeIdx } = alts[n]!
            map.addSource(A_SRC(n), {
              type: 'geojson',
              data: routeGeoJSON(altRoute.polyline),
            })
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
            const fn = () => routeStore.selectRoute(routeIdx)
            altClickFns[n] = fn
            map.on('click', A_LYR(n), fn)
          }

          // Primary route on top
          map.addSource(P_SRC, {
            type: 'geojson',
            data: routeGeoJSON(active.polyline),
          })
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

          // Destination marker
          destMarkerRef.current = new maplibregl.Marker({
            element: makeDestElement(),
            anchor:  'center',
          }).setLngLat([destination.lng, destination.lat]).addTo(map)

          // Fit bounds on first load or active-route switch in preview mode
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

        } catch (err) {
          console.error('[RouteLayer] draw error:', err)
          cleanup()   // remove any partial state so next call starts clean
        }
      }

      // Persistent style.load listener handles any style reload
      map.on('style.load', draw)

      const unsub = routeStore.subscribe(draw)
      draw()   // sync current state immediately

      return () => {
        map.off('style.load', draw)
        unsub()
        prevIndexRef.current = -1
        cleanup()
      }
    }

    // ── rAF fallback: MapShell sets mapInstance in its own useEffect.
    // React runs children's effects BEFORE the parent's, so getMap() is null
    // when this effect first runs. requestAnimationFrame defers until after
    // MapShell's effect has assigned the map instance.
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
