// ─── Route Layer ───────────────────────────────────────────────────────
// Null-render component. Draws/removes the route polyline on the Leaflet
// map imperatively. Subscribes to routeStore.

import { useEffect, useRef } from 'react'
import { L } from '@/lib/leaflet'
import { getMap } from '@/components/MapShell'
import { routeStore } from './routeStore.js'

export function RouteLayer() {
  const polylineRef = useRef<L.Polyline | null>(null)
  const destMarkerRef = useRef<L.Marker | null>(null)

  useEffect(() => {
    let cancelled = false

    function init(map: L.Map): () => void {
      function syncRoute(): void {
        const { route, destination } = routeStore.getState()

        // Remove old layers
        polylineRef.current?.remove()
        polylineRef.current = null
        destMarkerRef.current?.remove()
        destMarkerRef.current = null

        if (!route || !destination) return

        // Route polyline — blue, 5px, slight glow
        polylineRef.current = L.polyline(route.polyline, {
          color:   '#2B7FFF',
          weight:  5,
          opacity: 0.82,
          smoothFactor: 1,
        }).addTo(map)

        // Destination pin
        destMarkerRef.current = L.marker([destination.lat, destination.lng], {
          icon: L.divIcon({
            className: '',
            html: `<div style="
              width:32px; height:32px; border-radius:50%;
              background:#e31937; border:3px solid #fff;
              box-shadow:0 2px 10px rgba(227,25,55,0.6);
              display:flex; align-items:center; justify-content:center;
              font-size:14px; line-height:1;
            ">🏁</div>`,
            iconSize:   [32, 32],
            iconAnchor: [16, 16],
          }),
          zIndexOffset: 200,
        }).addTo(map)

        // Fit map to route bounds with padding
        const bounds = L.latLngBounds(route.polyline)
        map.fitBounds(bounds, { padding: [60, 60], maxZoom: 16, animate: true })
      }

      const unsub = routeStore.subscribe(syncRoute)
      syncRoute()  // initial sync

      return () => {
        unsub()
        polylineRef.current?.remove()
        polylineRef.current = null
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
