// ─── Route Layer ───────────────────────────────────────────────────────
// Null-render component. Draws route lines on the MapLibre map.
//
// DESIGN: layers are created ONCE at setup with empty data, then updated
// via setData() + visibility toggle on every route change. No remove/re-add
// — avoids the "source already exists" cascade failure that plagued the
// previous approach (remove-then-add on every store emission).
//
// Slots:
//   alt-0, alt-1  — alternative routes (dashed, below primary)
//   primary       — active route (solid, on top)
//
// Alt click handlers are registered once; altIdxRef maps slot → routes[] index.

import { useEffect, useRef } from 'react'
import * as maplibregl from 'maplibre-gl'
import { getMap } from '@/components/MapShell'
import { routeStore } from './routeStore.js'
import { followStore } from '@/features/follow/followStore'
import { isTeslaBrowser } from '@/lib/browser'

// ── Fixed layer/source IDs ────────────────────────────────────────────────
const P_SRC  = 'route-primary-src'
const P_LYR  = 'route-primary-lyr'
const A_SRC  = (n: number) => `route-alt${n}-src`
const A_LYR  = (n: number) => `route-alt${n}-lyr`
const MAX_ALT = 2

const EMPTY_FC: GeoJSON.FeatureCollection = { type: 'FeatureCollection', features: [] }

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
  // Maps alt slot (0/1) → index in routes[]  (-1 = empty slot)
  const altIdxRef     = useRef<number[]>([-1, -1])

  useEffect(() => {
    const map = getMap()
    if (!map) return

    // Click handler refs — stored so we can remove them on cleanup
    const clickHandlers: Array<{ id: string; fn: () => void }> = []

    // ── Sync current route state into existing sources/layers ─────────────
    function syncRoute(): void {
      // Guard: setup must have completed (primary layer must exist)
      if (!map.isStyleLoaded() || !map.getLayer(P_LYR)) return

      const { routes, activeRouteIndex, destination } = routeStore.getState()
      const active = routes[activeRouteIndex]

      // Primary route
      ;(map.getSource(P_SRC) as maplibregl.GeoJSONSource | undefined)
        ?.setData(active ? routeGeoJSON(active.polyline) : EMPTY_FC)
      map.setLayoutProperty(P_LYR, 'visibility', active ? 'visible' : 'none')

      // Alternative routes — fill slots with non-active routes
      const alts = routes
        .map((r, i) => ({ route: r, idx: i }))
        .filter(({ idx }) => idx !== activeRouteIndex)

      for (let n = 0; n < MAX_ALT; n++) {
        const alt = alts[n]
        altIdxRef.current[n] = alt?.idx ?? -1

        ;(map.getSource(A_SRC(n)) as maplibregl.GeoJSONSource | undefined)
          ?.setData(alt ? routeGeoJSON(alt.route.polyline) : EMPTY_FC)
        map.setLayoutProperty(A_LYR(n), 'visibility', alt ? 'visible' : 'none')
      }

      // Destination marker
      destMarkerRef.current?.remove()
      destMarkerRef.current = null
      if (destination && active) {
        destMarkerRef.current = new maplibregl.Marker({
          element: makeDestElement(),
          anchor:  'center',
        }).setLngLat([destination.lng, destination.lat]).addTo(map)
      }

      // Fit bounds on first route load or active-index switch in preview mode
      const isFirstLoad  = prevIndexRef.current === -1 && !!active
      const routeChanged = prevIndexRef.current !== -1 && prevIndexRef.current !== activeRouteIndex
      const { mode } = routeStore.getState()
      if (active && (isFirstLoad || (routeChanged && mode === 'preview'))) {
        followStore.setFollowing(false)
        const bounds = new maplibregl.LngLatBounds()
        for (const [lat, lng] of active.polyline) bounds.extend([lng, lat])
        map.fitBounds(bounds, {
          padding:  { top: 80, bottom: 80, left: 80, right: 80 },
          maxZoom:  15,
          duration: isTeslaBrowser ? 0 : 600,
        })
      }
      prevIndexRef.current = active ? activeRouteIndex : -1

      if (active) map.triggerRepaint()
    }

    // ── One-time setup: create all sources and layers ─────────────────────
    function setup(): void {
      if (!map.isStyleLoaded()) { map.once('style.load', setup); return }

      try {
        // Alt layers first (rendered below primary)
        for (let n = 0; n < MAX_ALT; n++) {
          if (!map.getSource(A_SRC(n))) {
            map.addSource(A_SRC(n), { type: 'geojson', data: EMPTY_FC })
          }
          if (!map.getLayer(A_LYR(n))) {
            map.addLayer({
              id:     A_LYR(n),
              type:   'line',
              source: A_SRC(n),
              layout: {
                'line-join':  'round',
                'line-cap':   'round',
                visibility:   'none',
              },
              paint: {
                'line-color':     '#2B7FFF',
                'line-width':     4,
                'line-opacity':   0.35,
                'line-dasharray': [8, 6],
              },
            })
          }
          const slot = n
          const fn = () => {
            const idx = altIdxRef.current[slot]
            if (idx >= 0) routeStore.selectRoute(idx)
          }
          map.on('click', A_LYR(n), fn)
          clickHandlers.push({ id: A_LYR(n), fn })
        }

        // Primary layer on top
        if (!map.getSource(P_SRC)) {
          map.addSource(P_SRC, { type: 'geojson', data: EMPTY_FC })
        }
        if (!map.getLayer(P_LYR)) {
          map.addLayer({
            id:     P_LYR,
            type:   'line',
            source: P_SRC,
            layout: {
              'line-join': 'round',
              'line-cap':  'round',
              visibility:  'none',
            },
            paint: {
              'line-color':   '#2B7FFF',
              'line-width':   5,
              'line-opacity': 0.85,
            },
          })
        }
      } catch (err) {
        console.error('[RouteLayer] setup error:', err)
        return
      }

      // Apply current state now that layers exist
      syncRoute()
    }

    setup()
    const unsub = routeStore.subscribe(syncRoute)

    return () => {
      unsub()
      for (const { id, fn } of clickHandlers) {
        try { map.off('click', id, fn) } catch (_) { /* noop */ }
      }
      destMarkerRef.current?.remove()
      destMarkerRef.current = null
      prevIndexRef.current  = -1
      altIdxRef.current     = [-1, -1]
      // Layers then sources
      for (let n = MAX_ALT - 1; n >= 0; n--) {
        try { if (map.getLayer(A_LYR(n)))  map.removeLayer(A_LYR(n))  } catch (_) {}
        try { if (map.getSource(A_SRC(n))) map.removeSource(A_SRC(n)) } catch (_) {}
      }
      try { if (map.getLayer(P_LYR))  map.removeLayer(P_LYR)  } catch (_) {}
      try { if (map.getSource(P_SRC)) map.removeSource(P_SRC) } catch (_) {}
    }
  }, [])

  return null
}
