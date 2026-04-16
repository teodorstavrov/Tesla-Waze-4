// ─── Route Layer ───────────────────────────────────────────────────────
// Null-render component. Draws/removes route polylines on the Leaflet map.
// Primary route: bright blue. Alternatives: dimmed dashed, tap to switch.

import { useEffect, useRef } from 'react'
import { L } from '@/lib/leaflet'
import { getMap } from '@/components/MapShell'
import { routeStore } from './routeStore.js'
import { followStore } from '@/features/follow/followStore'
import { isTeslaBrowser } from '@/lib/browser'

export function RouteLayer() {
  const primaryRef    = useRef<L.Polyline | null>(null)
  const altRefs       = useRef<L.Polyline[]>([])
  const destMarkerRef = useRef<L.Marker | null>(null)
  const prevIndexRef  = useRef<number>(-1)

  useEffect(() => {
    let cancelled = false

    function init(map: L.Map): () => void {
      function syncRoute(): void {
        const { routes, activeRouteIndex, destination } = routeStore.getState()

        // ── Remove existing layers ───────────────────────────────
        primaryRef.current?.remove()
        primaryRef.current = null
        for (const p of altRefs.current) p.remove()
        altRefs.current = []
        destMarkerRef.current?.remove()
        destMarkerRef.current = null

        if (!routes.length || !destination) return

        // ── Draw alternatives first (below primary) ──────────────
        altRefs.current = routes
          .map((route, i) => {
            if (i === activeRouteIndex) return null
            const poly = L.polyline(route.polyline, {
              color:        '#2B7FFF',
              weight:       4,
              opacity:      0.35,
              dashArray:    '8 6',
              smoothFactor: 1,
            }).addTo(map)
            poly.on('click', () => { routeStore.selectRoute(i) })
            return poly
          })
          .filter((p): p is L.Polyline => p !== null)

        // ── Draw active route on top ─────────────────────────────
        const active = routes[activeRouteIndex]!
        primaryRef.current = L.polyline(active.polyline, {
          color:        '#2B7FFF',
          weight:       5,
          opacity:      0.85,
          smoothFactor: 1,
        }).addTo(map)

        // ── Destination marker ───────────────────────────────────
        destMarkerRef.current = L.marker([destination.lat, destination.lng], {
          icon: L.divIcon({
            className: '',
            html: `<div class="marker-scale-wrap"><div style="
              width:32px;height:32px;border-radius:50%;
              background:#e31937;border:3px solid #fff;
              box-shadow:0 2px 10px rgba(227,25,55,0.6);
              display:flex;align-items:center;justify-content:center;
              font-size:14px;line-height:1;
            ">&#x1F3C1;</div></div>`,
            iconSize:   [32, 32],
            iconAnchor: [16, 16],
          }),
          zIndexOffset: 200,
        }).addTo(map)

        // Fit bounds:
        //  - Always on first load (preview mode: show full route before Старт)
        //  - On alternative switch only in preview mode
        //    (in navigating mode, keep following GPS instead of zooming out)
        const isFirstLoad  = prevIndexRef.current === -1
        const routeChanged = prevIndexRef.current !== activeRouteIndex
        const { mode } = routeStore.getState()
        if (isFirstLoad || (routeChanged && mode === 'preview')) {
          followStore.setFollowing(false)
          const bounds = L.latLngBounds(active.polyline)
          map.fitBounds(bounds, {
            padding: [80, 80],
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
        primaryRef.current?.remove()
        primaryRef.current = null
        for (const p of altRefs.current) p.remove()
        altRefs.current = []
        destMarkerRef.current?.remove()
        destMarkerRef.current = null
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
