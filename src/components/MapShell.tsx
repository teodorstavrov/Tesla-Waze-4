// ─── MapShell ─────────────────────────────────────────────────────────
//
// Owns the MapLibre GL map instance and wires together:
//  • tile layer (reacts to theme/satellite changes via source.setTiles)
//  • follow mode (disables on user drag, pans on GPS when following)
//  • course-up rotation via map.setBearing (no CSS transform needed)
//  • perspective pan via map.setPadding (no lookahead math needed)
//
// IMPORTANT: mapInstance is module-level, not React state.
// Putting a MapLibre map in React state would cause the map to be
// destroyed and recreated on every render — catastrophic for Tesla.
// The module-level singleton is accessed via getMap() by other modules.
//
// HMR SAFETY
// ──────────────────────────────────────────────────────────────────────
// import.meta.hot.dispose / import.meta.hot.data carry the singleton
// across hot-reload boundaries without destroying the live map.

import { useEffect, useRef, useSyncExternalStore } from 'react'
import * as maplibregl from 'maplibre-gl'
import { logger } from '@/lib/logger'
import {
  MIN_ZOOM, MAX_ZOOM,
  TILE_DARK, TILE_LIGHT, TILE_VOYAGER, TILE_VOYAGER_DARK, TILE_SATELLITE,
  TILE_ATTRIBUTION, TILE_SATELLITE_ATTRIBUTION, MAPTILER_ENABLED,
  TILE_TRAFFIC,
} from '@/lib/constants'
import { countryStore } from '@/lib/countryStore'
import { useThemeStore } from '@/features/theme/store'
import { followStore } from '@/features/follow/followStore'
import { gpsStore } from '@/features/gps/gpsStore'
import { routeStore } from '@/features/route/routeStore'
import { savedPlacesStore } from '@/features/places/savedPlacesStore'
import { addStationStore } from '@/features/ev/addStationStore'
import { meetupStore } from '@/features/meetups/meetupStore'
import { settingsStore } from '@/features/settings/settingsStore'
import { isTeslaBrowser } from '@/lib/browser'
import { t } from '@/lib/locale'
import { getActivePerformanceProfile } from '@/config/performanceProfiles'
import type { PerformanceProfile } from '@/config/performanceProfiles'

// Performance profile — read once at module load, refreshed on settingsStore change
let _perfProfile: PerformanceProfile = getActivePerformanceProfile()

// ── HMR-safe module-level singleton ──────────────────────────────
type HotData = { mapInstance: maplibregl.Map | null }

let mapInstance: maplibregl.Map | null =
  (import.meta.hot?.data as Partial<HotData> | undefined)?.mapInstance ?? null

if (import.meta.hot) {
  import.meta.hot.dispose((data) => {
    (data as HotData).mapInstance = mapInstance
  })
}

export function getMap(): maplibregl.Map | null { return mapInstance }

// MapLibre uses native bearing — no CSS scale ever applied.
// HeadingAvatar calls this to compute counter-scale; always 1 now.
export function getCourseUpScale(): number { return 1 }

/** Write data-perf attribute to <html> so CSS performance rules engage. */
function _applyPerfAttribute(): void {
  const id = _perfProfile.id
  if (id === 'auto' || id === 'normal') {
    document.documentElement.removeAttribute('data-perf')
  } else {
    document.documentElement.setAttribute('data-perf', id)
  }
}
_applyPerfAttribute()

// Expand {s} subdomain placeholder to array of tile URLs
function _expandTileUrl(url: string): string[] {
  if (url.includes('{s}')) return ['a', 'b', 'c'].map(s => url.replace('{s}', s))
  return [url]
}

// Build a MapLibre raster-only style spec
function _makeTileStyle(
  url: string,
  attribution: string,
): maplibregl.StyleSpecification {
  return {
    version: 8,
    sources: {
      'base-tiles': {
        type: 'raster',
        tiles: _expandTileUrl(url),
        tileSize: 256,
        attribution,
      },
    },
    layers: [{
      id: 'base-tiles',
      type: 'raster',
      source: 'base-tiles',
      paint: {
        'raster-fade-duration': isTeslaBrowser ? 0 : 300,
      },
    }],
  }
}

// Debounced resize — notify MapLibre when viewport dimensions change.
// Handles Tesla 2026.26 compat viewport meta update from main.tsx.
let _resizeTimer: ReturnType<typeof setTimeout> | null = null
window.addEventListener('resize', () => {
  if (_resizeTimer) clearTimeout(_resizeTimer)
  _resizeTimer = setTimeout(() => {
    mapInstance?.resize()
  }, 200)
}, { passive: true })

let _geocodeTimer: ReturnType<typeof setTimeout> | null = null

// ─────────────────────────────────────────────────────────────────
export function MapShell() {
  const containerRef = useRef<HTMLDivElement>(null)
  const { theme, mapMode } = useThemeStore()
  const showTraffic = useSyncExternalStore(
    settingsStore.subscribe.bind(settingsStore),
    () => settingsStore.get().showTraffic,
    () => false,
  )

  // ── Initialize map (runs once per cold start) ─────────────────
  useEffect(() => {
    if (!containerRef.current || mapInstance) return

    const initCountry = countryStore.getCountryOrDefault()
    const [initLat, initLng] = initCountry.center  // stored as [lat, lng]

    const map = new maplibregl.Map({
      container:          containerRef.current,
      style:              _makeTileStyle(TILE_LIGHT, TILE_ATTRIBUTION),
      center:             [initLng, initLat],  // MapLibre: [lng, lat]
      zoom:               initCountry.zoom,
      minZoom:            MIN_ZOOM,
      maxZoom:            MAX_ZOOM,
      attributionControl: true,
      // Disable pitch/rotation gestures that conflict with course-up UX
      pitchWithRotate:    false,
      // Touch: two-finger rotate/pitch is disabled; single-finger drag pans
      touchPitch:         false,
    })

    mapInstance = map

    // Disable follow on user-initiated drag.
    // MapLibre fires 'dragstart' only for user drags, not programmatic easeTo.
    map.on('dragstart', () => {
      if (!followStore.isProgrammaticMove()) {
        followStore.setFollowing(false)
        const isNavigating = routeStore.getState().mode === 'navigating'
        if (!isNavigating && map.getBearing() !== 0) {
          map.easeTo({
            bearing: 0,
            padding: { top: 0, bottom: 0, left: 0, right: 0 },
            duration: 300,
          })
        }
        logger.follow.debug('Follow disabled by drag', { isNavigating })
      }
    })

    // ── Long-press → navigate popup ──────────────────────────────
    // MapLibre fires 'contextmenu' on long-press (Chrome/Tesla touch) and right-click.
    map.on('contextmenu', (e) => {
      e.originalEvent?.preventDefault()
      const { lng, lat } = e.lngLat

      const wrap = document.createElement('div')
      wrap.style.cssText = 'display:flex;flex-direction:column;align-items:center;gap:6px;padding:4px 2px'

      const addr = document.createElement('div')
      addr.style.cssText = 'font-size:9px;color:rgba(255,255,255,0.55);text-align:center;line-height:1.4;max-width:132px'
      addr.textContent = `${lat.toFixed(5)}, ${lng.toFixed(5)}`

      const btn = document.createElement('button')
      btn.textContent = t('map.navigate')
      btn.style.cssText = [
        'background:#e31937',
        'color:#fff',
        'border:none',
        'border-radius:6px',
        'padding:8px 19px',
        'font-size:10px',
        'font-weight:800',
        'letter-spacing:0.04em',
        'cursor:pointer',
        'touch-action:manipulation',
        'width:100%',
      ].join(';')

      const placeRow = document.createElement('div')
      placeRow.style.cssText = 'display:flex;gap:5px;width:100%'

      // popup is declared here and assigned after element creation;
      // click handlers close over it by reference (assigned before any click fires)
      let popup: maplibregl.Popup

      function makePlaceBtn(emoji: string, color: string, type: 'home' | 'work'): HTMLButtonElement {
        const existing = savedPlacesStore.get(type)
        const isSet = existing !== null
        const b = document.createElement('button')
        const placeLabel = isSet
          ? t(type === 'home' ? 'map.changeHome' : 'map.changeWork')
          : t(type === 'home' ? 'map.home' : 'map.work')
        b.textContent = `${emoji} ${placeLabel}`
        b.style.cssText = [
          `background:${isSet ? color + '33' : 'rgba(255,255,255,0.08)'}`,
          `color:${isSet ? color : 'rgba(255,255,255,0.7)'}`,
          `border:1px solid ${isSet ? color + '88' : 'rgba(255,255,255,0.15)'}`,
          'border-radius:6px', 'padding:6px 0',
          'font-size:9px', 'font-weight:700',
          'cursor:pointer', 'touch-action:manipulation', 'flex:1',
        ].join(';')
        b.addEventListener('click', () => {
          const name = addr.textContent ?? `${lat.toFixed(4)}, ${lng.toFixed(4)}`
          savedPlacesStore.set({ type, lat, lng, name })
          popup.remove()
        })
        return b
      }

      placeRow.appendChild(makePlaceBtn('🏠', '#22c55e', 'home'))
      placeRow.appendChild(makePlaceBtn('💼', '#3b82f6', 'work'))

      const addStationBtn = document.createElement('button')
      addStationBtn.textContent = `⚡ ${t('map.addStation')}`
      addStationBtn.style.cssText = [
        'background:rgba(251,191,36,0.12)',
        'color:#fbbf24',
        'border:1px solid rgba(251,191,36,0.4)',
        'border-radius:6px', 'padding:6px 0',
        'font-size:9px', 'font-weight:700',
        'cursor:pointer', 'touch-action:manipulation', 'width:100%',
        'letter-spacing:0.04em',
      ].join(';')
      addStationBtn.addEventListener('click', () => {
        popup.remove()
        addStationStore.open(lat, lng, addr.textContent ?? `${lat.toFixed(5)}, ${lng.toFixed(5)}`)
      })

      const addEventBtn = document.createElement('button')
      addEventBtn.textContent = `📅 ${t('meetup.formAdd')}`
      addEventBtn.style.cssText = [
        'background:rgba(99,102,241,0.14)',
        'color:#a5b4fc',
        'border:1px solid rgba(99,102,241,0.45)',
        'border-radius:6px', 'padding:6px 0',
        'font-size:9px', 'font-weight:700',
        'cursor:pointer', 'touch-action:manipulation', 'width:100%',
        'letter-spacing:0.04em',
      ].join(';')
      addEventBtn.addEventListener('click', () => {
        popup.remove()
        meetupStore.openForm(lat, lng, addr.textContent ?? `${lat.toFixed(5)}, ${lng.toFixed(5)}`)
      })

      wrap.appendChild(addr)
      wrap.appendChild(btn)
      wrap.appendChild(placeRow)
      wrap.appendChild(addStationBtn)
      wrap.appendChild(addEventBtn)

      // Assign popup — click handlers above capture this variable by reference
      popup = new maplibregl.Popup({
        className:   'nav-popup',
        closeButton: true,
        maxWidth:    '170px',
        offset:      [0, -6] as [number, number],
      })
        .setLngLat([lng, lat])
        .setDOMContent(wrap)
        .addTo(map)

      // Reverse geocode — update address label when response arrives
      if (_geocodeTimer) clearTimeout(_geocodeTimer)
      _geocodeTimer = setTimeout(() => {
        _geocodeTimer = null
        const revLang = countryStore.getCountryOrDefault().searchLang
        fetch(
          `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=jsonv2&accept-language=${encodeURIComponent(revLang)}`,
          { headers: { 'User-Agent': 'TesRadar/1.0' } },
        )
          .then((r) => r.json())
          .then((data: { display_name?: string; address?: { road?: string; suburb?: string; city?: string; town?: string; village?: string } }) => {
            const a = data.address
            const parts: string[] = []
            if (a?.road)   parts.push(a.road)
            if (a?.suburb) parts.push(a.suburb)
            const city = a?.city ?? a?.town ?? a?.village
            if (city) parts.push(city)
            addr.textContent = parts.length
              ? parts.join(', ')
              : (data.display_name?.split(',').slice(0, 2).join(', ') ?? addr.textContent)
          })
          .catch(() => { /* keep coords */ })
      }, 600)

      btn.addEventListener('click', () => {
        const destName = addr.textContent ?? `${lat.toFixed(4)}, ${lng.toFixed(4)}`
        popup.remove()
        void routeStore.navigateTo({ lat, lng, name: destName })
      })
    })

    // ── GPS → map follow ─────────────────────────────────────────
    // Course-up: map.easeTo({bearing: -heading}) rotates natively.
    // Perspective: padding.top = H*0.4 shifts effective center so car
    //   sits at ~70% from screen top instead of 50%.
    //
    // Tesla: skip easeTo when movement is negligible (<3m) to avoid
    // compositor pressure from unnecessary GPU repaints.

    let _lastPanLat = 0
    let _lastPanLng = 0
    const PAN_MIN_M = isTeslaBrowser ? 3 : 0

    function _panDistM(a: number, b: number, c: number, d: number): number {
      const R = 6371000
      const dLat = (c - a) * Math.PI / 180
      const dLng = (d - b) * Math.PI / 180
      return R * Math.sqrt(dLat * dLat + dLng * dLng)
    }

    const unsubGps = gpsStore.onPosition((pos) => {
      if (!followStore.isFollowing()) return

      if (PAN_MIN_M > 0) {
        const moved = _panDistM(pos.lat, pos.lng, _lastPanLat, _lastPanLng)
        if (moved < PAN_MIN_M && (_lastPanLat !== 0 || _lastPanLng !== 0)) return
      }
      _lastPanLat = pos.lat
      _lastPanLng = pos.lng

      const courseUp = settingsStore.get().headingMode === 'course-up'
      const heading  = pos.heading ?? 0
      const bearing  = courseUp ? -heading : 0

      // Perspective padding: shifts car to ~70% from top
      // Course-up or mobile: use padding; Tesla north-up: centered
      const usePerspective = courseUp || !isTeslaBrowser
      const topPad = usePerspective ? Math.round(window.innerHeight * 0.4) : 0

      // Animate pan only when profile allows it and heading is known
      const shouldAnimatePan =
        _perfProfile.panAnimate &&
        (courseUp && pos.heading != null || !isTeslaBrowser)
      const duration = shouldAnimatePan ? 500 : 0

      followStore.beginProgrammaticMove()
      map.easeTo({
        center:  [pos.lng, pos.lat],
        bearing,
        padding: { top: topPad, bottom: 0, left: 0, right: 0 },
        duration,
      })
      setTimeout(
        () => followStore.endProgrammaticMove(),
        shouldAnimatePan ? 550 : 100,
      )
    })

    // React to settings changes: heading mode + performance profile
    const unsubSettings = settingsStore.subscribe(() => {
      const { headingMode } = settingsStore.get()
      if (headingMode === 'north-up') {
        map.easeTo({
          bearing: 0,
          padding: isTeslaBrowser
            ? { top: 0, bottom: 0, left: 0, right: 0 }
            : { top: Math.round(window.innerHeight * 0.4), bottom: 0, left: 0, right: 0 },
          duration: 300,
        })
      } else if (headingMode === 'course-up') {
        followStore.setFollowing(true)
      }
      _perfProfile = getActivePerformanceProfile()
      _applyPerfAttribute()
    })

    logger.map.info('Map initialized', {
      country: initCountry.code,
      center:  initCountry.center,
      zoom:    initCountry.zoom,
    })

    return () => {
      unsubGps()
      unsubSettings()
    }
  }, [])

  // ── Update tile source when theme/satellite changes ───────────
  useEffect(() => {
    if (!mapInstance) return
    const map = mapInstance

    const url =
      mapMode === 'satellite'                     ? TILE_SATELLITE
      : mapMode === 'voyager' && theme === 'dark' ? TILE_VOYAGER_DARK
      : mapMode === 'voyager'                     ? TILE_VOYAGER
      : theme === 'dark'                          ? TILE_DARK
      :                                             TILE_LIGHT

    const isDarkTile = mapMode !== 'satellite' && theme === 'dark' && !MAPTILER_ENABLED

    const apply = () => {
      const src = map.getSource<maplibregl.RasterTileSource>('base-tiles')
      if (!src) return
      src.setTiles(_expandTileUrl(url))
      // CSS invert filter for OSM dark mode — applied to the canvas element
      const canvas = map.getCanvas()
      if (isDarkTile) canvas.classList.add('map-tiles-dark')
      else            canvas.classList.remove('map-tiles-dark')
      map.triggerRepaint()
      logger.map.debug('Tile updated', { mapMode, theme })
    }

    if (map.isStyleLoaded()) apply()
    else map.once('style.load', apply)
  }, [theme, mapMode])

  // ── Traffic overlay (TomTom raster) ──────────────────────────
  useEffect(() => {
    if (!mapInstance) return
    const map = mapInstance

    const apply = () => {
      if (showTraffic) {
        if (!map.getSource('traffic')) {
          map.addSource('traffic', {
            type:     'raster',
            tiles:    [TILE_TRAFFIC],
            tileSize: 256,
          })
          map.addLayer({
            id:      'traffic-layer',
            type:    'raster',
            source:  'traffic',
            minzoom: 7,
            paint:   { 'raster-opacity': 0.8 },
          })
        } else {
          map.setLayoutProperty('traffic-layer', 'visibility', 'visible')
        }
      } else {
        if (map.getLayer('traffic-layer')) {
          map.setLayoutProperty('traffic-layer', 'visibility', 'none')
        }
      }
    }

    if (map.isStyleLoaded()) apply()
    else map.once('style.load', apply)
  }, [showTraffic])

  // ── Sync data-theme attribute to <html> ───────────────────────
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
  }, [theme])

  return (
    <div
      ref={containerRef}
      id="map"
      role="application"
      aria-label="Navigation map"
    />
  )
}
