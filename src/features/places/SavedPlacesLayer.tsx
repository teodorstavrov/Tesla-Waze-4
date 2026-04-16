// ─── Saved Places Layer ───────────────────────────────────────────────
// Renders Home and Work markers on the map (device-local, localStorage).
// Tapping a marker shows a popup with Навигирай + Изчисти buttons.

import { useEffect, useRef } from 'react'
import { L } from '@/lib/leaflet'
import { getMap } from '@/components/MapShell'
import { savedPlacesStore } from './savedPlacesStore'
import { routeStore } from '@/features/route/routeStore'
import { t } from '@/lib/locale'
import type { PlaceType, SavedPlace } from './savedPlacesStore'

const PLACE_CONFIG: Record<PlaceType, { emoji: string; color: string; labelKey: string }> = {
  home: { emoji: '🏠', color: '#22c55e', labelKey: 'map.home' },
  work: { emoji: '💼', color: '#3b82f6', labelKey: 'map.work' },
}

function makeIcon(type: PlaceType): L.DivIcon {
  const { emoji, color } = PLACE_CONFIG[type]
  return L.divIcon({
    className: '',
    html: `<div class="marker-scale-wrap"><div style="
      width:44px;height:44px;border-radius:50%;
      background:${color};
      border:3px solid #fff;
      box-shadow:0 2px 12px rgba(0,0,0,0.4);
      display:flex;align-items:center;justify-content:center;
      font-size:20px;line-height:1;
    ">${emoji}</div></div>`,
    iconSize:   [44, 44],
    iconAnchor: [22, 22],
    popupAnchor:[0, -26],
  })
}

function buildPopup(place: SavedPlace, map: L.Map): HTMLElement {
  const { emoji, color, labelKey } = PLACE_CONFIG[place.type]
  const label = t(labelKey)

  const wrap = document.createElement('div')
  wrap.style.cssText = 'display:flex;flex-direction:column;gap:10px;padding:4px 2px;min-width:220px'

  const title = document.createElement('div')
  title.style.cssText = `font-size:15px;font-weight:700;color:${color};text-align:center`
  title.textContent = `${emoji} ${label}`

  const addr = document.createElement('div')
  addr.style.cssText = 'font-size:12px;color:rgba(255,255,255,0.55);text-align:center;line-height:1.4'
  addr.textContent = place.name

  const navBtn = document.createElement('button')
  navBtn.textContent = `⚡ ${t('map.navigate').replace('⚡ ', '')}`
  navBtn.style.cssText = [
    'background:#e31937', 'color:#fff', 'border:none',
    'border-radius:10px', 'padding:12px 0',
    'font-size:16px', 'font-weight:800', 'letter-spacing:0.04em',
    'cursor:pointer', 'touch-action:manipulation', 'width:100%',
  ].join(';')

  const clearBtn = document.createElement('button')
  clearBtn.textContent = `🗑 ${t('common.cancel')}`
  clearBtn.style.cssText = [
    'background:rgba(255,255,255,0.07)', 'color:rgba(255,255,255,0.6)',
    'border:1px solid rgba(255,255,255,0.15)',
    'border-radius:10px', 'padding:10px 0',
    'font-size:14px', 'font-weight:600',
    'cursor:pointer', 'touch-action:manipulation', 'width:100%',
  ].join(';')

  wrap.appendChild(title)
  wrap.appendChild(addr)
  wrap.appendChild(navBtn)
  wrap.appendChild(clearBtn)

  navBtn.addEventListener('click', () => {
    map.closePopup()
    void routeStore.navigateTo({ lat: place.lat, lng: place.lng, name: place.name })
  })

  clearBtn.addEventListener('click', () => {
    map.closePopup()
    savedPlacesStore.remove(place.type)
  })

  return wrap
}

export function SavedPlacesLayer() {
  const markersRef = useRef<Partial<Record<PlaceType, L.Marker>>>({})

  useEffect(() => {
    const map = getMap()
    if (!map) return

    function sync(): void {
      const places = savedPlacesStore.getAll()
      const types: PlaceType[] = ['home', 'work']

      for (const type of types) {
        const existing = markersRef.current[type]
        const place = places[type]

        if (!place) {
          // Remove marker if place was deleted
          existing?.remove()
          delete markersRef.current[type]
          continue
        }

        if (existing) {
          // Update position if moved
          existing.setLatLng([place.lat, place.lng])
          existing.setIcon(makeIcon(type))
        } else {
          // Create new marker
          const marker = L.marker([place.lat, place.lng], {
            icon:         makeIcon(type),
            zIndexOffset: 500,
          }).addTo(map!)

          marker.on('click', () => {
            const current = savedPlacesStore.get(type)
            if (!current) return
            L.popup({ className: 'nav-popup', closeButton: true, maxWidth: 260 })
              .setLatLng([current.lat, current.lng])
              .setContent(buildPopup(current, map!))
              .openOn(map!)
          })

          markersRef.current[type] = marker
        }
      }
    }

    sync()
    const unsub = savedPlacesStore.subscribe(sync)

    return () => {
      unsub()
      for (const m of Object.values(markersRef.current)) m?.remove()
      markersRef.current = {}
    }
  }, [])

  return null
}
