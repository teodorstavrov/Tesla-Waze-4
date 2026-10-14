// ─── CountryBoundsLayer ───────────────────────────────────────────────────
//
// Draws a dashed bounding-box rectangle + flag label for each supported
// country. Visible only at zoom ≤ MAX_ZOOM_SHOW (low-zoom / country overview).
//
// Active country: orange outline.
// Other countries: blue outline, dimmer fill.
//
// Rectangles: MapLibre GeoJSON fill + line layers per country.
// Labels: DOM-element MapLibre Markers.

import { useEffect, useRef } from 'react'
import * as maplibregl from 'maplibre-gl'
import { getMap } from '@/components/MapShell'
import { COUNTRY_LIST } from '@/config/countries'
import { countryStore } from '@/lib/countryStore'

const MAX_ZOOM_SHOW = 8

const COLOR_ACTIVE_FILL = 'rgba(249,115,22,0.12)'
const COLOR_ACTIVE_LINE = 'rgba(249,115,22,0.95)'
const COLOR_OTHER_FILL  = 'rgba(96,165,250,0.07)'
const COLOR_OTHER_LINE  = 'rgba(96,165,250,0.85)'

function makeLabelElement(flag: string, name: string, active: boolean): HTMLDivElement {
  const bg     = active ? 'rgba(249,115,22,0.85)' : 'rgba(30,41,59,0.82)'
  const border = active ? '#fb923c' : 'rgba(96,165,250,0.6)'
  const el = document.createElement('div')
  el.style.cssText = [
    `background:${bg}`,
    `border:1.5px solid ${border}`,
    'border-radius:8px',
    'padding:4px 9px',
    'display:flex', 'align-items:center', 'gap:5px',
    'white-space:nowrap',
    'pointer-events:none',
    'box-shadow:0 2px 8px rgba(0,0,0,0.55)',
    'transform:translate(-50%,-50%)',  // center on the map point
  ].join(';')

  const flagSpan = document.createElement('span')
  flagSpan.style.cssText = 'font-size:18px;line-height:1'
  flagSpan.textContent = flag

  const nameSpan = document.createElement('span')
  nameSpan.style.cssText = 'font-size:12px;font-weight:700;color:#fff;letter-spacing:0.3px'
  nameSpan.textContent = name

  el.appendChild(flagSpan)
  el.appendChild(nameSpan)
  return el
}

function countryPolygon(bounds: [[number, number], [number, number]]): GeoJSON.Feature<GeoJSON.Polygon> {
  const [[swLat, swLng], [neLat, neLng]] = bounds
  return {
    type: 'Feature',
    geometry: {
      type: 'Polygon',
      coordinates: [[
        [swLng, swLat], [neLng, swLat], [neLng, neLat], [swLng, neLat], [swLng, swLat],
      ]],
    },
    properties: {},
  }
}

interface Entry {
  labelMarker: maplibregl.Marker
  labelEl:     HTMLDivElement
  fillId:      string
  lineId:      string
  sourceId:    string
}

export function CountryBoundsLayer() {
  const entriesRef = useRef<Map<string, Entry>>(new Map())
  const visibleRef = useRef<boolean>(false)

  useEffect(() => {
    let cancelled = false

    function buildLayers(map: maplibregl.Map): () => void {

      function addMapLayers(): void {
        if (!map.isStyleLoaded()) {
          map.once('style.load', addMapLayers)
          return
        }

        for (const country of COUNTRY_LIST) {
          if (entriesRef.current.has(country.code)) continue

          const sourceId = `country-bounds-${country.code}`
          const fillId   = `country-fill-${country.code}`
          const lineId   = `country-line-${country.code}`
          const [[swLat, swLng], [neLat, neLng]] = country.bounds

          if (!map.getSource(sourceId)) {
            map.addSource(sourceId, {
              type: 'geojson',
              data: countryPolygon(country.bounds),
            })
          }

          if (!map.getLayer(fillId)) {
            map.addLayer({
              id:     fillId,
              type:   'fill',
              source: sourceId,
              layout: { visibility: 'none' },
              paint:  {
                'fill-color':   COLOR_OTHER_FILL,
                'fill-opacity': 1,
              },
            })
          }

          if (!map.getLayer(lineId)) {
            map.addLayer({
              id:     lineId,
              type:   'line',
              source: sourceId,
              layout: { visibility: 'none' },
              paint:  {
                'line-color':      COLOR_OTHER_LINE,
                'line-width':      2,
                'line-dasharray':  [4, 3],
              },
            })
          }

          const centerLat = (swLat + neLat) / 2
          const centerLng = (swLng + neLng) / 2
          const isActive  = countryStore.getCode() === country.code
          const labelEl   = makeLabelElement(country.flag, country.nativeName, isActive)

          const labelMarker = new maplibregl.Marker({
            element: labelEl,
            anchor:  'center',
          })
            .setLngLat([centerLng, centerLat])

          entriesRef.current.set(country.code, { labelMarker, labelEl, fillId, lineId, sourceId })
        }

        // Apply initial visibility + styles
        syncStyles()
        if (map.getZoom() <= MAX_ZOOM_SHOW) showAll()
      }

      function showAll(): void {
        if (visibleRef.current) return
        visibleRef.current = true
        for (const { fillId, lineId, labelMarker } of entriesRef.current.values()) {
          if (map.getLayer(fillId)) map.setLayoutProperty(fillId, 'visibility', 'visible')
          if (map.getLayer(lineId)) map.setLayoutProperty(lineId, 'visibility', 'visible')
          labelMarker.addTo(map)
        }
      }

      function hideAll(): void {
        if (!visibleRef.current) return
        visibleRef.current = false
        for (const { fillId, lineId, labelMarker } of entriesRef.current.values()) {
          if (map.getLayer(fillId)) map.setLayoutProperty(fillId, 'visibility', 'none')
          if (map.getLayer(lineId)) map.setLayoutProperty(lineId, 'visibility', 'none')
          labelMarker.remove()
        }
      }

      function syncStyles(): void {
        const active = countryStore.getCode()
        for (const [code, { fillId, lineId, labelEl }] of entriesRef.current) {
          const isActive = code === active
          if (map.getLayer(fillId)) {
            map.setPaintProperty(fillId, 'fill-color', isActive ? COLOR_ACTIVE_FILL : COLOR_OTHER_FILL)
          }
          if (map.getLayer(lineId)) {
            map.setPaintProperty(lineId, 'line-color', isActive ? COLOR_ACTIVE_LINE : COLOR_OTHER_LINE)
            map.setPaintProperty(lineId, 'line-width',  isActive ? 2.5 : 2)
          }
          // Update label element background
          const bg     = isActive ? 'rgba(249,115,22,0.85)' : 'rgba(30,41,59,0.82)'
          const border = isActive ? '#fb923c' : 'rgba(96,165,250,0.6)'
          labelEl.style.background = bg
          labelEl.style.border = `1.5px solid ${border}`
        }
      }

      addMapLayers()

      function onZoom(): void {
        if (cancelled) return
        if (map.getZoom() <= MAX_ZOOM_SHOW) showAll()
        else hideAll()
      }

      map.on('zoomend', onZoom)

      const unsubCountry = countryStore.subscribe(() => {
        if (cancelled) return
        syncStyles()
      })

      return () => {
        map.off('zoomend', onZoom)
        unsubCountry()
        hideAll()
        for (const { fillId, lineId, sourceId, labelMarker } of entriesRef.current.values()) {
          labelMarker.remove()
          if (map.getLayer(fillId))  map.removeLayer(fillId)
          if (map.getLayer(lineId))  map.removeLayer(lineId)
          if (map.getSource(sourceId)) map.removeSource(sourceId)
        }
        entriesRef.current.clear()
        visibleRef.current = false
      }
    }

    let cleanup: (() => void) | null = null
    const map = getMap()
    if (map) {
      cleanup = buildLayers(map)
    } else {
      const frame = requestAnimationFrame(() => {
        if (cancelled) return
        const m = getMap()
        if (m) cleanup = buildLayers(m)
      })
      return () => { cancelled = true; cancelAnimationFrame(frame) }
    }

    return () => { cancelled = true; cleanup?.() }
  }, [])

  return null
}
