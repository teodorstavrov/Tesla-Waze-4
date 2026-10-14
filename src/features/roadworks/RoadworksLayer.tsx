// ─── Roadworks Marker Layer ───────────────────────────────────────────────────
// Renders orange 🚧 markers + optional road polylines on the MapLibre map.
// Data: Bulgaria's official DATEX II feed via /api/roadworks.
// Markers/layers are diffed — never re-created unless the record is new.

import { useEffect, useRef } from 'react'
import { useSyncExternalStore } from 'react'
import * as maplibregl from 'maplibre-gl'
import { getMap } from '@/components/MapShell'
import { roadworksStore } from './roadworksStore'
import { getLang } from '@/lib/locale'
import type { RoadworkRecord } from './roadworksStore'

function fmt(iso: string | null): string {
  if (!iso) return '—'
  try {
    return new Date(iso).toLocaleDateString(getLang() === 'bg' ? 'bg-BG' : 'en-GB', {
      day: '2-digit', month: '2-digit', year: 'numeric',
    })
  } catch { return iso }
}

function buildPopupEl(rw: RoadworkRecord): HTMLElement {
  const desc = (getLang() === 'bg' ? rw.descBg : rw.descEn) || rw.descBg || rw.descEn || '—'
  const end  = fmt(rw.endTime)
  const el   = document.createElement('div')
  el.style.cssText = 'font-family:system-ui,sans-serif;max-width:280px;padding:2px 0'
  el.innerHTML = `
    <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px">
      <span style="font-size:20px">🚧</span>
      <b style="font-size:14px;color:#f97316">${getLang() === 'bg' ? 'Затворен път' : 'Road Closure'}</b>
    </div>
    <div style="font-size:12px;line-height:1.55;color:#ddd;margin-bottom:8px">${desc}</div>
    <div style="font-size:11px;color:#888">
      ${getLang() === 'bg' ? 'Затворен до' : 'Closed until'}: <b style="color:#f97316">${end}</b>
    </div>
  `
  return el
}

function makeMarkerEl(): HTMLDivElement {
  const wrap = document.createElement('div')
  wrap.style.cssText = [
    'width:30px', 'height:30px', 'border-radius:50%',
    'background:#f97316',
    'border:2px solid rgba(255,255,255,0.9)',
    'display:flex', 'align-items:center', 'justify-content:center',
    'font-size:15px', 'line-height:1',
    'box-shadow:0 2px 8px rgba(0,0,0,0.55)',
    'cursor:pointer',
  ].join(';')
  wrap.textContent = '🚧'
  return wrap
}

function lineGeoJSON(points: [number, number][]): GeoJSON.Feature<GeoJSON.LineString> {
  // points are [lat, lng] (Leaflet convention) — flip for MapLibre
  return {
    type: 'Feature',
    geometry: { type: 'LineString', coordinates: points.map(([lat, lng]) => [lng, lat]) },
    properties: {},
  }
}

interface PolyEntry { srcId: string; lyrId: string }

export function RoadworksLayer() {
  const { records, visible } = useSyncExternalStore(
    roadworksStore.subscribe,
    roadworksStore.getState,
    roadworksStore.getState,
  )

  const markersRef = useRef<Map<string, maplibregl.Marker>>(new Map())
  const polysRef   = useRef<Map<string, PolyEntry>>(new Map())

  useEffect(() => {
    const map = getMap()
    if (!map) return

    function removeAll(): void {
      for (const m of markersRef.current.values()) m.remove()
      markersRef.current.clear()
      for (const { srcId, lyrId } of polysRef.current.values()) {
        if (map.getLayer(lyrId))  map.removeLayer(lyrId)
        if (map.getSource(srcId)) map.removeSource(srcId)
      }
      polysRef.current.clear()
    }

    if (!visible) { removeAll(); return }

    if (!map.isStyleLoaded()) {
      map.once('style.load', () => {
        // re-trigger the effect after style loads — state hasn't changed
        // so we just re-run sync manually
        syncRecords(map)
      })
      return
    }

    syncRecords(map)
  }, [records, visible])

  function syncRecords(map: maplibregl.Map): void {
    const incoming = new Set(records.map((r) => r.id))

    // Remove stale markers
    for (const [id, marker] of markersRef.current) {
      if (!incoming.has(id)) { marker.remove(); markersRef.current.delete(id) }
    }
    // Remove stale polylines
    for (const [id, { srcId, lyrId }] of polysRef.current) {
      if (!incoming.has(id)) {
        if (map.getLayer(lyrId))  map.removeLayer(lyrId)
        if (map.getSource(srcId)) map.removeSource(srcId)
        polysRef.current.delete(id)
      }
    }

    for (const rw of records) {
      if (!markersRef.current.has(rw.id)) {
        const el = makeMarkerEl()
        el.addEventListener('click', () => {
          new maplibregl.Popup({ className: 'roadwork-popup', maxWidth: '300px', closeButton: true })
            .setLngLat([rw.lng, rw.lat])
            .setDOMContent(buildPopupEl(rw))
            .addTo(map)
        })
        const marker = new maplibregl.Marker({ element: el, anchor: 'center' })
          .setLngLat([rw.lng, rw.lat])
          .addTo(map)
        markersRef.current.set(rw.id, marker)
      }

      if (!polysRef.current.has(rw.id) && rw.points?.length >= 2) {
        const srcId = `roadwork-src-${rw.id}`
        const lyrId = `roadwork-line-${rw.id}`
        if (!map.getSource(srcId)) {
          map.addSource(srcId, { type: 'geojson', data: lineGeoJSON(rw.points) })
        }
        if (!map.getLayer(lyrId)) {
          map.addLayer({
            id:     lyrId,
            type:   'line',
            source: srcId,
            layout: { 'line-join': 'round', 'line-cap': 'round' },
            paint: {
              'line-color':     '#ef4444',
              'line-width':     5,
              'line-opacity':   0.85,
              'line-dasharray': [10, 6],
            },
          })
          map.on('click', lyrId, () => {
            new maplibregl.Popup({ className: 'roadwork-popup', maxWidth: '300px', closeButton: true })
              .setLngLat([rw.lng, rw.lat])
              .setDOMContent(buildPopupEl(rw))
              .addTo(map)
          })
        }
        polysRef.current.set(rw.id, { srcId, lyrId })
      }
    }
  }

  useEffect(() => {
    return () => {
      const map = getMap()
      for (const m of markersRef.current.values()) m.remove()
      markersRef.current.clear()
      if (map) {
        for (const { srcId, lyrId } of polysRef.current.values()) {
          if (map.getLayer(lyrId))  map.removeLayer(lyrId)
          if (map.getSource(srcId)) map.removeSource(srcId)
        }
      }
      polysRef.current.clear()
    }
  }, [])

  return null
}
