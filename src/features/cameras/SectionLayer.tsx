// ─── Speed Section Polyline Layer ─────────────────────────────────────
//
// Draws each speed section as a simple Leaflet polyline + start/end markers.
// Null-render React component — all DOM work is imperative Leaflet.
//
// PERFORMANCE:
// - Polylines are drawn once on mount (sections never change at runtime).
// - Active section is highlighted via setStyle() — no remount.
// - No per-tick work in this component; sectionStore subscription only
//   needed for the highlight update.
//
// TESLA: no animations, no CSS transitions, plain colours.

import { useEffect, useRef } from 'react'
import { L } from '@/lib/leaflet'
import { getMap } from '@/components/MapShell'
import { sectionStore } from './sectionEngine'
import { SPEED_SECTIONS } from './sections'
import { isTeslaBrowser } from '@/lib/browser'
import { t } from '@/lib/locale'
import type { SpeedSection } from './sectionTypes'

const COLOR_IDLE    = 'rgba(249,115,22,0.55)'   // orange, dimmed
const COLOR_ACTIVE  = '#ef4444'                  // red, full opacity
const COLOR_BORDER  = 'rgba(255,255,255,0.6)'

function makePinIcon(emoji: string, label: string): L.DivIcon {
  return L.divIcon({
    className: '',
    html: `<div class="marker-scale-wrap"><div style="
      display:flex;flex-direction:column;align-items:center;
      pointer-events:none;user-select:none;
    ">
      <div style="
        width:32px;height:32px;border-radius:6px;
        background:#f97316;
        border:2px solid ${COLOR_BORDER};
        box-shadow:0 2px 6px rgba(0,0,0,0.5);
        display:flex;flex-direction:column;align-items:center;justify-content:center;
      ">
        <span style="font-size:13px;line-height:1;">${emoji}</span>
        <span style="font-size:7px;font-weight:700;color:#fff;line-height:1;margin-top:1px;">${label}</span>
      </div>
    </div></div>`,
    iconSize:   [32, 32],
    iconAnchor: [16, 16],
  })
}

export function SectionLayer() {
  // polylineRef: sectionId → { line, startM, endM }
  const layersRef = useRef<Map<string, {
    line:   L.Polyline
    startM: L.Marker
    endM:   L.Marker
  }>>(new Map())

  useEffect(() => {
    let cancelled = false

    function init(map: L.Map): () => void {
      // Draw all sections once
      for (const section of SPEED_SECTIONS) {
        if (layersRef.current.has(section.id)) continue

        const line = L.polyline(
          [
            [section.startLat, section.startLng],
            [section.endLat,   section.endLng],
          ],
          {
            color:     COLOR_IDLE,
            weight:    5,
            opacity:   1,
            dashArray: '8 6',
            interactive: false,
          },
        ).addTo(map)

        const startM = L.marker([section.startLat, section.startLng], {
          icon:        makePinIcon('📷', `${section.limitKmh}`),
          interactive: false,
          zIndexOffset: 10,
        }).addTo(map)

        const endM = L.marker([section.endLat, section.endLng], {
          icon:        makePinIcon('📷', `${section.limitKmh}`),
          interactive: false,
          zIndexOffset: 10,
        }).addTo(map)

        if (!isTeslaBrowser) {
          line.bindTooltip(
            `${section.road} · ${section.name} — ${section.limitKmh} ${t('sections.kmh')} (${Math.round(section.lengthM / 1000)} ${t('routePanel.km')})`,
            { sticky: true, direction: 'top' },
          )
        }

        layersRef.current.set(section.id, { line, startM, endM })
      }

      // Highlight active section on store change
      function syncHighlight(): void {
        const { session } = sectionStore.getState()
        const activeId = session?.section.id ?? null

        for (const [id, { line }] of layersRef.current) {
          line.setStyle({
            color:     id === activeId ? COLOR_ACTIVE : COLOR_IDLE,
            dashArray: id === activeId ? undefined    : '8 6',
            weight:    id === activeId ? 6            : 5,
          })
        }
      }

      const unsub = sectionStore.subscribe(syncHighlight)
      syncHighlight()

      return () => {
        unsub()
        for (const { line, startM, endM } of layersRef.current.values()) {
          line.remove(); startM.remove(); endM.remove()
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
