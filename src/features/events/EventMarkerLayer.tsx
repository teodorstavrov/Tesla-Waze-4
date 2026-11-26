// ─── Event Marker Layer ────────────────────────────────────────────────
// Null-render component. DOM-element markers — events need distinct
// emoji/icon visuals.
//
// Each marker shows a colored circle with emoji.
// Time info is shown in EventPanel when the marker is tapped.

import { useEffect, useRef } from 'react'
import * as maplibregl from 'maplibre-gl'
import { getMap } from '@/components/MapShell'
import { eventStore } from './eventStore.js'
import { EVENT_EMOJI, EVENT_COLORS } from './types.js'
import { logger } from '@/lib/logger'
import { isTeslaBrowser } from '@/lib/browser'
import { getActivePerformanceProfile } from '@/config/performanceProfiles'
import type { RoadEvent } from './types.js'

const NEW_THRESHOLD_MS = 2 * 60 * 1000

// ── Vote badge (confirms ✓ / denies ✗) ───────────────────────────────────────

const _PILL_BASE = [
  'display:inline-flex',
  'align-items:center',
  'justify-content:center',
  'border-radius:7px',
  'padding:1px 4px',
  'font-size:9px',
  'font-weight:800',
  'line-height:1.2',
  'white-space:nowrap',
  'font-family:monospace',
  'min-width:14px',
].join(';')

function _updateVoteBadge(el: HTMLElement, confirms: number, denies: number): void {
  if (confirms === 0 && denies === 0) {
    el.style.display = 'none'
    return
  }
  el.style.display = 'flex'
  const pills: string[] = []
  if (confirms > 0) pills.push(
    `<span style="${_PILL_BASE};background:rgba(22,163,74,0.90);color:#fff;border:1px solid rgba(0,0,0,0.25)">✓${confirms}</span>`
  )
  if (denies > 0) pills.push(
    `<span style="${_PILL_BASE};background:rgba(220,38,38,0.90);color:#fff;border:1px solid rgba(0,0,0,0.25)">✗${denies}</span>`
  )
  el.innerHTML = pills.join('')
}

function _makeVoteBadge(confirms: number, denies: number): HTMLDivElement {
  const badge = document.createElement('div')
  badge.className = 'evt-vote-badge'
  badge.style.cssText = [
    'position:absolute',
    'top:-5px',
    'right:-6px',
    'display:flex',
    'flex-direction:column',
    'gap:2px',
    'align-items:flex-end',
    'pointer-events:none',
    'z-index:2',
  ].join(';')
  _updateVoteBadge(badge, confirms, denies)
  return badge
}

// Waze-style police badge SVG: orange ring → white separator → blue circle → officer illustration
function makePoliceElement(animation: string, confirms: number, denies: number): HTMLDivElement {
  // outer: MapLibre anchors here via transform:translate — explicit size keeps anchor math correct
  const outer = document.createElement('div')
  outer.style.cssText = 'width:46px;height:46px;cursor:pointer'

  // inner: CSS viewport-scale lives here — isolated from MapLibre's translate on outer
  const inner = document.createElement('div')
  inner.className = 'marker-scale-wrap'
  inner.style.cssText = 'width:46px;height:46px'
  // SVG uses drop-shadow filter instead of box-shadow (works on non-rectangular shapes)
  inner.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="46" height="46" viewBox="0 0 46 46"
      style="display:block;filter:drop-shadow(0 2px 5px rgba(0,0,0,0.6));animation:${animation}">
    <!-- Orange outer ring -->
    <circle cx="23" cy="23" r="22.5" fill="#f97316"/>
    <!-- White separator -->
    <circle cx="23" cy="23" r="19.5" fill="white"/>
    <!-- Blue background -->
    <circle cx="23" cy="23" r="18" fill="#2563eb"/>
    <!-- Police cap top -->
    <path d="M14 21 Q23 12.5 32 21 L31 22.2 L15 22.2 Z" fill="#1e3a8a"/>
    <!-- Cap brim -->
    <rect x="13" y="21.8" width="20" height="2.4" rx="1.2" fill="#152b6b"/>
    <!-- Badge star on cap -->
    <polygon points="23,16 23.9,18.7 26.8,18.7 24.5,20.4 25.4,23.1 23,21.4 20.6,23.1 21.5,20.4 19.2,18.7 22.1,18.7"
      fill="#fbbf24"/>
    <!-- Face (skin tone ellipse) -->
    <ellipse cx="23" cy="28" rx="6" ry="6" fill="#fde3a7"/>
    <!-- Eyes -->
    <circle cx="20.8" cy="26.8" r="0.95" fill="#374151"/>
    <circle cx="25.2" cy="26.8" r="0.95" fill="#374151"/>
    <!-- Smile -->
    <path d="M20 29.5 Q23 32.5 26 29.5" fill="none" stroke="#92400e" stroke-width="0.9" stroke-linecap="round"/>
    <!-- Uniform body -->
    <path d="M15 38 Q18.5 32.5 23 32.5 Q27.5 32.5 31 38 L32 44 L14 44 Z" fill="#1e3a8a"/>
    <!-- Shirt front / tie area -->
    <path d="M21 33 L23 34.5 L25 33 L24.5 37 L21.5 37 Z" fill="white" opacity="0.88"/>
    <!-- Chest badge (5-point star) -->
    <polygon points="23,34 23.6,35.8 25.5,35.8 24.1,36.9 24.6,38.7 23,37.6 21.4,38.7 21.9,36.9 20.5,35.8 22.4,35.8"
      fill="#fbbf24"/>
  </svg>`

  outer.appendChild(inner)
  outer.appendChild(_makeVoteBadge(confirms, denies))
  return outer
}

function makeElement(event: RoadEvent): HTMLDivElement {
  const color = EVENT_COLORS[event.type] ?? '#888'
  const emoji = EVENT_EMOJI[event.type]  ?? '📍'
  const isNew = Date.now() - new Date(event.reportedAt).getTime() < NEW_THRESHOLD_MS
  const profile = getActivePerformanceProfile()
  const animation = (!isTeslaBrowser && isNew && profile.useMarkerAnimations)
    ? 'event-new-pulse 0.9s ease-out 3'
    : 'none'

  if (event.type === 'police') {
    return makePoliceElement(animation, event.confirms, event.denies)
  }

  const bg     = `${color}22`
  const border = `2px solid ${color}`
  const shadow = '0 2px 8px rgba(0,0,0,0.55)'

  // outer: MapLibre anchors here via transform:translate — explicit size keeps anchor math correct
  const outer = document.createElement('div')
  outer.style.cssText = 'width:36px;height:36px;cursor:pointer'

  // inner: CSS viewport-scale lives here — isolated from MapLibre's translate on outer
  const inner = document.createElement('div')
  inner.className = 'marker-scale-wrap'
  inner.style.cssText = [
    'width:36px', 'height:36px', 'border-radius:50%',
    `background:${bg}`, `border:${border}`,
    'display:flex', 'align-items:center', 'justify-content:center',
    'font-size:17px', 'line-height:1',
    `box-shadow:${shadow}`,
    `animation:${animation}`,
  ].join(';')
  inner.textContent = emoji
  outer.appendChild(inner)
  outer.appendChild(_makeVoteBadge(event.confirms, event.denies))
  return outer
}

export function EventMarkerLayer() {
  const registryRef = useRef<Map<string, maplibregl.Marker>>(new Map())

  useEffect(() => {
    let cancelled = false
    let moveTimer: ReturnType<typeof setTimeout> | null = null

    function init(map: maplibregl.Map): () => void {
      const registry = registryRef.current

      function syncMarkers(): void {
        const { events } = eventStore.getState()
        const incoming = new Set(events.map((e) => e.id))

        for (const [id, marker] of registry) {
          if (!incoming.has(id)) { marker.remove(); registry.delete(id) }
        }

        for (const event of events) {
          if (registry.has(event.id)) {
            // Live-update vote badge when confirms/denies change after confirm/deny action
            const badge = registry.get(event.id)!.getElement()?.querySelector<HTMLElement>('.evt-vote-badge')
            if (badge) _updateVoteBadge(badge, event.confirms, event.denies)
            continue
          }

          const el = makeElement(event)
          el.addEventListener('click', () => {
            eventStore.selectEvent(event)
            logger.events.debug('Event selected', { id: event.id, type: event.type })
          })

          const marker = new maplibregl.Marker({
            element: el,
            anchor: 'center',
            rotationAlignment: 'viewport',
            pitchAlignment: 'viewport',
          })
            .setLngLat([event.lng, event.lat])
            .addTo(map)

          registry.set(event.id, marker)
        }
      }

      const unsub = eventStore.subscribe(syncMarkers)
      syncMarkers()

      function fetchCurrent(): void {
        const b = map.getBounds()
        eventStore.fetch({
          minLat: b.getSouth(), minLng: b.getWest(),
          maxLat: b.getNorth(), maxLng: b.getEast(),
        })
      }

      function onMoveEnd(): void {
        if (moveTimer) clearTimeout(moveTimer)
        const debounce = getActivePerformanceProfile().mapMoveDebounceMs
        moveTimer = setTimeout(fetchCurrent, debounce)
      }

      map.on('moveend', onMoveEnd)

      // Periodic refresh every 2 min — ensures new cron-added markers appear
      // even when the map is static (parked car, desktop viewer).
      const pollInterval = setInterval(fetchCurrent, 2 * 60 * 1000)

      fetchCurrent()

      return () => {
        if (moveTimer) clearTimeout(moveTimer)
        clearInterval(pollInterval)
        map.off('moveend', onMoveEnd)
        unsub()
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
