// ─── Waze Police Marker Layer ─────────────────────────────────────────────
// Null-render component. Fetches real-time police markers ingested from Waze
// (stored in Neon via the GitHub Actions cron pipeline) and overlays them on
// the map as Leaflet DivIcon markers.
//
// Refresh: every 2 minutes, matching api/police/live s-maxage=120.
// Interaction: tap to open a Leaflet popup with road name and thumbs-up count.

import { useEffect, useRef } from 'react'
import { L } from '@/lib/leaflet'
import { getMap } from '@/components/MapShell'

interface WazeMarker {
  id: string
  latitude: number
  longitude: number
  road_name: string | null
  city: string | null
  thumbs_up: number
  confidence: number
  reliability: number
  expires_at: string
}

function makeIcon(): L.DivIcon {
  return L.divIcon({
    className: '',
    html: `<div class="marker-scale-wrap">
      <div style="
        width:40px;height:40px;border-radius:50%;
        background:#3b82f6;border:3px solid #fff;
        display:flex;align-items:center;justify-content:center;
        font-size:19px;line-height:1;
        box-shadow:0 2px 10px rgba(0,0,0,0.7);
        cursor:pointer;
      ">🚔</div></div>`,
    iconSize:   [40, 40],
    iconAnchor: [20, 20],
    popupAnchor: [0, -24],
  })
}

const REFRESH_MS = 2 * 60 * 1000

export function WazePoliceLayer() {
  const registryRef = useRef<Map<string, L.Marker>>(new Map())

  useEffect(() => {
    let cancelled = false
    let intervalId: ReturnType<typeof setInterval> | null = null

    function init(map: L.Map): () => void {
      const registry = registryRef.current

      async function fetchAndSync(): Promise<void> {
        if (cancelled) return
        try {
          const res = await fetch('/api/police/live')
          if (!res.ok || cancelled) return
          const data = (await res.json()) as { markers: WazeMarker[] }
          if (cancelled) return

          const incoming = new Set(data.markers.map((m) => m.id))

          // Remove expired / gone markers
          for (const [id, marker] of registry) {
            if (!incoming.has(id)) { marker.remove(); registry.delete(id) }
          }

          // Add new markers
          for (const m of data.markers) {
            if (registry.has(m.id)) continue

            const marker = L.marker([m.latitude, m.longitude], {
              icon: makeIcon(),
              zIndexOffset: 90,
            }).addTo(map)

            const road = m.road_name ?? m.city ?? 'Неизвестен път'
            const thumbs = m.thumbs_up > 0
              ? `<div style="font-size:11px;margin-top:4px">👍 ${m.thumbs_up}</div>`
              : ''
            const popup = `
              <div style="text-align:center;padding:4px;min-width:120px">
                <div style="font-size:14px;font-weight:600;margin-bottom:4px">🚔 Полиция</div>
                <div style="font-size:12px;color:#ccc">${road}</div>
                ${thumbs}
                <div style="font-size:10px;color:#888;margin-top:6px">Waze</div>
              </div>`

            marker.bindPopup(popup, { closeButton: false, maxWidth: 200 })
            marker.on('click', () => marker.openPopup())

            registry.set(m.id, marker)
          }
        } catch {
          // Waze police data is optional — silent failure
        }
      }

      void fetchAndSync()
      intervalId = setInterval(() => void fetchAndSync(), REFRESH_MS)

      return () => {
        if (intervalId) clearInterval(intervalId)
        for (const m of registry.values()) m.remove()
        registry.clear()
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
