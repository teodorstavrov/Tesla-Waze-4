// ─── CountryBoundsLayer ───────────────────────────────────────────────────
//
// Draws a dashed bounding-box rectangle + flag label for each of the 5
// supported countries on the Leaflet map. Visible only at zoom ≤ MAX_ZOOM_SHOW
// so it doesn't clutter normal driving view.
//
// Active country: orange outline.
// Other countries: blue outline, dimmer fill.
//
// Labels are centred inside each rectangle via DivIcon.

import { useEffect, useRef } from 'react'
import { L } from '@/lib/leaflet'
import { getMap } from '@/components/MapShell'
import { COUNTRY_LIST } from '@/config/countries'
import { countryStore } from '@/lib/countryStore'

const MAX_ZOOM_SHOW = 8   // hide above this zoom (driving zoom is 14+)

const STYLE_OTHER = {
  color:       'rgba(96,165,250,0.85)',
  fillColor:   'rgba(96,165,250,0.07)',
  fillOpacity: 1,
  weight:      2,
  dashArray:   '8 6',
  interactive: false,
} as const

const STYLE_ACTIVE = {
  color:       'rgba(249,115,22,0.95)',
  fillColor:   'rgba(249,115,22,0.12)',
  fillOpacity: 1,
  weight:      2.5,
  dashArray:   '8 6',
  interactive: false,
} as const

function makeLabelIcon(flag: string, name: string, active: boolean): L.DivIcon {
  const bg    = active ? 'rgba(249,115,22,0.85)' : 'rgba(30,41,59,0.82)'
  const border = active ? '#fb923c' : 'rgba(96,165,250,0.6)'
  return L.divIcon({
    className: '',
    html: `<div style="
      background:${bg};
      border:1.5px solid ${border};
      border-radius:8px;
      padding:4px 9px;
      display:flex;align-items:center;gap:5px;
      white-space:nowrap;
      pointer-events:none;
      box-shadow:0 2px 8px rgba(0,0,0,0.55);
    ">
      <span style="font-size:18px;line-height:1;">${flag}</span>
      <span style="font-size:12px;font-weight:700;color:#fff;letter-spacing:0.3px;">${name}</span>
    </div>`,
    iconAnchor: [0, 0],   // centred by CSS transform below
    iconSize:   [0, 0],
  })
}

interface Entry {
  rect:  L.Rectangle
  label: L.Marker
}

export function CountryBoundsLayer() {
  const entriesRef = useRef<Map<string, Entry>>(new Map())
  const visibleRef = useRef<boolean>(false)

  useEffect(() => {
    let cancelled = false

    function buildLayers(map: L.Map): () => void {
      function activeCode(): string | null {
        return countryStore.getCode()
      }

      function createEntries(): void {
        for (const country of COUNTRY_LIST) {
          if (entriesRef.current.has(country.code)) continue

          const [[swLat, swLng], [neLat, neLng]] = country.bounds
          const active = activeCode() === country.code

          const rect = L.rectangle(
            [[swLat, swLng], [neLat, neLng]],
            active ? { ...STYLE_ACTIVE } : { ...STYLE_OTHER },
          )

          const centerLat = (swLat + neLat) / 2
          const centerLng = (swLng + neLng) / 2
          const label = L.marker([centerLat, centerLng], {
            icon:        makeLabelIcon(country.flag, country.nativeName, active),
            interactive: false,
          })

          // Centre the label visually — Leaflet DivIcon anchors at top-left when iconSize=[0,0]
          // so we shift with CSS after creation
          label.on('add', () => {
            const el = label.getElement()
            if (el) {
              el.style.transform += ' translate(-50%, -50%)'
              el.style.pointerEvents = 'none'
            }
          })

          entriesRef.current.set(country.code, { rect, label })
        }
      }

      function showAll(): void {
        if (visibleRef.current) return
        visibleRef.current = true
        for (const { rect, label } of entriesRef.current.values()) {
          rect.addTo(map)
          label.addTo(map)
        }
      }

      function hideAll(): void {
        if (!visibleRef.current) return
        visibleRef.current = false
        for (const { rect, label } of entriesRef.current.values()) {
          rect.remove()
          label.remove()
        }
      }

      function syncStyles(): void {
        const active = activeCode()
        for (const [code, { rect, label }] of entriesRef.current) {
          const isActive = code === active
          rect.setStyle(isActive ? { ...STYLE_ACTIVE } : { ...STYLE_OTHER })
          // Rebuild label icon for colour change
          label.setIcon(makeLabelIcon(
            COUNTRY_LIST.find(c => c.code === code)!.flag,
            COUNTRY_LIST.find(c => c.code === code)!.nativeName,
            isActive,
          ))
        }
      }

      createEntries()

      // Initial visibility based on current zoom
      if (map.getZoom() <= MAX_ZOOM_SHOW) showAll()

      function onZoom(): void {
        if (cancelled) return
        if (map.getZoom() <= MAX_ZOOM_SHOW) {
          showAll()
        } else {
          hideAll()
        }
      }

      map.on('zoomend', onZoom)

      // Re-colour when the user picks a different country
      const unsubCountry = countryStore.subscribe(() => {
        if (cancelled) return
        syncStyles()
      })

      return () => {
        map.off('zoomend', onZoom)
        unsubCountry()
        hideAll()
        for (const { rect, label } of entriesRef.current.values()) {
          rect.remove()
          label.remove()
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
