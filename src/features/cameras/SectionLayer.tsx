// ─── Speed Section Polyline Layer ─────────────────────────────────────
//
// Draws each speed section as a MapLibre GeoJSON line layer that follows
// the actual road geometry, not a straight line between camera coordinates.
//
// Road geometry is fetched from OSRM on first use, then cached in localStorage.
//
// RENDER STRATEGY:
// - Draw straight-line placeholders immediately on mount.
// - In the background, fetch road geometry in batches of 5 from OSRM.
// - Replace each line source data with road path as results arrive.
// - On OSRM failure, the straight-line placeholder stays (graceful fallback).
//
// CACHE: localStorage key `section-path:v1:{id}` — invalidate by bumping
//        ROAD_PATH_VER if section coordinates change significantly.

import { useEffect, useRef } from 'react'
import * as maplibregl from 'maplibre-gl'
import { getMap } from '@/components/MapShell'
import { sectionStore } from './sectionEngine'
import { SPEED_SECTIONS } from './sections'
import { isTeslaBrowser } from '@/lib/browser'
import { t } from '@/lib/locale'
import type { SpeedSection } from './sectionTypes'

const ROAD_PATH_VER  = 'v2'
const OSRM_BASE      = 'https://router.project-osrm.org/route/v1/driving'
const BATCH_SIZE     = 5
const BATCH_DELAY_MS = 200

async function fetchRoadPath(
  section: SpeedSection,
  signal:  AbortSignal,
): Promise<[number, number][] | null> {
  const cacheKey = `section-path:${ROAD_PATH_VER}:${section.id}`

  try {
    const hit = localStorage.getItem(cacheKey)
    if (hit) return JSON.parse(hit) as [number, number][]
  } catch { /* storage unavailable */ }

  const url = `${OSRM_BASE}/${section.startLng},${section.startLat};${section.endLng},${section.endLat}?overview=full&geometries=geojson`
  try {
    const res = await fetch(url, { signal })
    if (!res.ok) return null
    const data = await res.json() as {
      routes?: Array<{ geometry?: { coordinates?: [number, number][] } }>
    }
    const coords = data.routes?.[0]?.geometry?.coordinates
    if (!coords || coords.length < 2) return null
    try { localStorage.setItem(cacheKey, JSON.stringify(coords)) } catch { /* quota */ }
    return coords
  } catch {
    return null
  }
}

const COLOR_IDLE   = 'rgba(249,115,22,0.55)'
const COLOR_ACTIVE = '#ef4444'
const DASH_IDLE    = [8, 6]
const DASH_SOLID   = [1, 0]

function makePinElement(section: SpeedSection): HTMLDivElement {
  const wrap = document.createElement('div')
  wrap.className = 'marker-scale-wrap'
  wrap.style.cssText = 'pointer-events:none;user-select:none;width:32px;height:32px'

  const pin = document.createElement('div')
  pin.style.cssText = [
    'width:32px', 'height:32px', 'border-radius:6px',
    'background:#f97316',
    'border:2px solid rgba(255,255,255,0.6)',
    'box-shadow:0 2px 6px rgba(0,0,0,0.5)',
    'display:flex', 'flex-direction:column', 'align-items:center', 'justify-content:center',
  ].join(';')

  const icon = document.createElement('span')
  icon.style.cssText = 'font-size:13px;line-height:1'
  icon.textContent = '📷'

  const lbl = document.createElement('span')
  lbl.style.cssText = 'font-size:7px;font-weight:700;color:#fff;line-height:1;margin-top:1px'
  lbl.textContent = `${section.limitKmh}`

  pin.appendChild(icon)
  pin.appendChild(lbl)
  wrap.appendChild(pin)
  return wrap
}

function lineGeoJSON(coords: [number, number][]): GeoJSON.Feature<GeoJSON.LineString> {
  return {
    type:     'Feature',
    geometry: { type: 'LineString', coordinates: coords },
    properties: {},
  }
}

export function SectionLayer() {
  const layersRef = useRef<Map<string, {
    sourceId: string
    layerId:  string
    startM:   maplibregl.Marker
    endM:     maplibregl.Marker
  }>>(new Map())

  useEffect(() => {
    let cancelled = false

    function init(map: maplibregl.Map): () => void {

      function addLayers(): void {
        if (!map.isStyleLoaded()) { map.once('style.load', addLayers); return }

        for (const section of SPEED_SECTIONS) {
          if (layersRef.current.has(section.id)) continue

          const sourceId = `section-src-${section.id}`
          const layerId  = `section-line-${section.id}`

          // OSRM uses [lng, lat] — MapLibre GeoJSON format
          const initialCoords: [number, number][] = [
            [section.startLng, section.startLat],
            [section.endLng,   section.endLat],
          ]

          if (!map.getSource(sourceId)) {
            map.addSource(sourceId, {
              type: 'geojson',
              data: lineGeoJSON(initialCoords),
            })
          }

          if (!map.getLayer(layerId)) {
            map.addLayer({
              id:     layerId,
              type:   'line',
              source: sourceId,
              layout: { 'line-join': 'round', 'line-cap': 'round' },
              paint:  {
                'line-color':     COLOR_IDLE,
                'line-width':     5,
                'line-dasharray': DASH_IDLE,
              },
            })
          }

          const startEl = makePinElement(section)
          const endEl   = makePinElement(section)

          const startM = new maplibregl.Marker({ element: startEl, anchor: 'center' })
            .setLngLat([section.startLng, section.startLat])
            .addTo(map)

          const endM = new maplibregl.Marker({ element: endEl, anchor: 'center' })
            .setLngLat([section.endLng, section.endLat])
            .addTo(map)

          layersRef.current.set(section.id, { sourceId, layerId, startM, endM })
        }

        syncHighlight()
      }

      function syncHighlight(): void {
        if (!map.isStyleLoaded()) return
        const { session } = sectionStore.getState()
        const activeId = session?.section.id ?? null

        for (const [id, { layerId }] of layersRef.current) {
          if (!map.getLayer(layerId)) continue
          const isActive = id === activeId
          map.setPaintProperty(layerId, 'line-color', isActive ? COLOR_ACTIVE : COLOR_IDLE)
          map.setPaintProperty(layerId, 'line-width', isActive ? 6 : 5)
          map.setPaintProperty(layerId, 'line-dasharray', isActive ? DASH_SOLID : DASH_IDLE)
        }
      }

      addLayers()
      const unsub = sectionStore.subscribe(syncHighlight)

      // Progressively replace straight-line placeholders with road geometry
      const enrichAbort = new AbortController()
      ;(async () => {
        for (let i = 0; i < SPEED_SECTIONS.length; i += BATCH_SIZE) {
          if (enrichAbort.signal.aborted) break
          await Promise.all(
            SPEED_SECTIONS.slice(i, i + BATCH_SIZE).map(async (section) => {
              if (enrichAbort.signal.aborted) return
              const entry = layersRef.current.get(section.id)
              if (!entry) return
              const coords = await fetchRoadPath(section, enrichAbort.signal)
              if (coords && !enrichAbort.signal.aborted) {
                // OSRM returns [lng, lat] — correct for MapLibre GeoJSON
                const src = map.getSource(entry.sourceId) as maplibregl.GeoJSONSource | undefined
                src?.setData(lineGeoJSON(coords))
              }
            }),
          )
          if (!enrichAbort.signal.aborted && i + BATCH_SIZE < SPEED_SECTIONS.length) {
            await new Promise<void>(r => setTimeout(r, BATCH_DELAY_MS))
          }
        }
      })()

      return () => {
        enrichAbort.abort()
        unsub()
        for (const { sourceId, layerId, startM, endM } of layersRef.current.values()) {
          startM.remove(); endM.remove()
          if (map.getLayer(layerId))  map.removeLayer(layerId)
          if (map.getSource(sourceId)) map.removeSource(sourceId)
        }
        layersRef.current.clear()
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
