// ─── Roadworks Marker Layer ───────────────────────────────────────────────────
// Renders orange 🚧 markers on the Leaflet map for each active road closure.
// Data: Bulgaria's official DATEX II feed via /api/roadworks.
// Markers are only added/removed — never re-created on re-render.

import { useEffect, useRef } from 'react'
import { useSyncExternalStore } from 'react'
import { L } from '@/lib/leaflet'
import { getMap } from '@/components/MapShell'
import { roadworksStore } from './roadworksStore'
import { getLang } from '@/lib/locale'
import type { RoadworkRecord } from './roadworksStore'

// Build the DivIcon once (all markers share the same icon object)
const ICON = L.divIcon({
  className: '',
  html: `<div style="
    width:30px;height:30px;
    background:#f97316;
    border-radius:50%;
    border:2px solid rgba(255,255,255,0.9);
    display:flex;align-items:center;justify-content:center;
    font-size:15px;line-height:1;
    box-shadow:0 2px 8px rgba(0,0,0,0.55);
    cursor:pointer;
  ">🚧</div>`,
  iconSize:   [30, 30],
  iconAnchor: [15, 15],
})

function fmt(iso: string | null): string {
  if (!iso) return '—'
  try {
    return new Date(iso).toLocaleDateString(getLang() === 'bg' ? 'bg-BG' : 'en-GB', {
      day: '2-digit', month: '2-digit', year: 'numeric',
    })
  } catch { return iso }
}

function buildPopup(rw: RoadworkRecord): string {
  const desc = (getLang() === 'bg' ? rw.descBg : rw.descEn) || rw.descBg || rw.descEn || '—'
  const end  = fmt(rw.endTime)
  return `
    <div style="font-family:system-ui,sans-serif;max-width:280px;padding:2px 0">
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px">
        <span style="font-size:20px">🚧</span>
        <b style="font-size:14px;color:#f97316">${getLang() === 'bg' ? 'Затворен път' : 'Road Closure'}</b>
      </div>
      <div style="font-size:12px;line-height:1.55;color:#ddd;margin-bottom:8px">${desc}</div>
      <div style="font-size:11px;color:#888">
        ${getLang() === 'bg' ? 'Затворен до' : 'Closed until'}: <b style="color:#f97316">${end}</b>
      </div>
    </div>
  `
}

export function RoadworksLayer() {
  const { records, visible } = useSyncExternalStore(
    roadworksStore.subscribe,
    roadworksStore.getState,
    roadworksStore.getState,
  )

  // Map from record id → Leaflet marker (so we can remove individually)
  const markersRef = useRef<Map<string, L.Marker>>(new Map())

  useEffect(() => {
    const map = getMap()
    if (!map) return

    if (!visible) {
      // Remove all markers
      markersRef.current.forEach((m) => map.removeLayer(m))
      markersRef.current.clear()
      return
    }

    // Add new markers, skip already-rendered ids
    const existing = markersRef.current
    const incoming = new Set(records.map((r) => r.id))

    // Remove stale
    existing.forEach((m, id) => {
      if (!incoming.has(id)) {
        map.removeLayer(m)
        existing.delete(id)
      }
    })

    // Add new
    for (const rw of records) {
      if (existing.has(rw.id)) continue
      const marker = L.marker([rw.lat, rw.lng], { icon: ICON })
        .bindPopup(buildPopup(rw), {
          maxWidth: 300,
          className: 'roadwork-popup',
        })
      marker.addTo(map)
      existing.set(rw.id, marker)
    }
  }, [records, visible])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      const map = getMap()
      markersRef.current.forEach((m) => { if (map) map.removeLayer(m) })
      markersRef.current.clear()
    }
  }, [])

  return null
}
