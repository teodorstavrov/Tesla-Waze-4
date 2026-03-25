// ─── MapShell ─────────────────────────────────────────────────────────
//
// Owns the Leaflet map instance and wires together:
//  • tile layer (reacts to theme/satellite changes)
//  • follow mode (disables on user drag, pans on GPS when following)
//
// IMPORTANT: mapInstance is module-level, not React state.
// Putting a Leaflet map in React state would cause the map to be
// destroyed and recreated on every render — catastrophic for Tesla.
// The module-level singleton is accessed via getMap() by other modules
// (ZoomControls, HeadingAvatar, LocationButton).
//
// HMR SAFETY
// ──────────────────────────────────────────────────────────────────────
// In Vite dev mode, HMR replaces the module, resetting all module-level
// `let` variables to their initial values (null). But the Leaflet map
// instance lives in the DOM and cannot be re-initialized on the same
// container. We use import.meta.hot.dispose / import.meta.hot.data to
// carry the singletons across hot-reload boundaries without destroying
// the live map.

import { useEffect, useRef } from 'react'
import { L } from '@/lib/leaflet'
import { logger } from '@/lib/logger'
import {
  DEFAULT_CENTER, DEFAULT_ZOOM, MIN_ZOOM, MAX_ZOOM,
  TILE_DARK, TILE_LIGHT, TILE_SATELLITE,
  TILE_ATTRIBUTION, TILE_SATELLITE_ATTRIBUTION,
} from '@/lib/constants'
import { useThemeStore } from '@/features/theme/store'
import { followStore } from '@/features/follow/followStore'
import { gpsStore } from '@/features/gps/gpsStore'

// ── HMR-safe module-level singletons ──────────────────────────────
// On cold start: null. On HMR reload: recovered from the previous
// module's dispose callback so the live map is never destroyed.
type HotData = { mapInstance: L.Map | null; tileLayer: L.TileLayer | null }

let mapInstance: L.Map | null =
  (import.meta.hot?.data as Partial<HotData> | undefined)?.mapInstance ?? null
let tileLayer: L.TileLayer | null =
  (import.meta.hot?.data as Partial<HotData> | undefined)?.tileLayer ?? null

// Save state before this module is replaced by HMR
if (import.meta.hot) {
  import.meta.hot.dispose((data) => {
    (data as HotData).mapInstance = mapInstance
    ;(data as HotData).tileLayer  = tileLayer
  })
}

export function getMap(): L.Map | null { return mapInstance }

// ─────────────────────────────────────────────────────────────────
export function MapShell() {
  const containerRef = useRef<HTMLDivElement>(null)
  const { theme, mapMode } = useThemeStore()

  // ── Initialize map (runs once per cold start) ─────────────────
  useEffect(() => {
    if (!containerRef.current || mapInstance) return

    const map = L.map(containerRef.current, {
      center:              DEFAULT_CENTER,
      zoom:                DEFAULT_ZOOM,
      minZoom:             MIN_ZOOM,
      maxZoom:             MAX_ZOOM,
      zoomControl:         false,  // custom controls provided
      attributionControl:  true,
      fadeAnimation:       true,
      zoomAnimation:       true,
      markerZoomAnimation: true,
      preferCanvas:        true,   // fewer DOM nodes — better Tesla performance
      tapTolerance:        15,     // generous tap target for Tesla touchscreen
    })

    mapInstance = map

    // Disable follow on user-initiated drag
    map.on('dragstart', () => {
      if (!followStore.isProgrammaticMove()) {
        followStore.setFollowing(false)
        logger.follow.debug('Follow disabled by drag')
      }
    })

    // GPS → map pan when follow mode is active (pure imperative, no React)
    const unsubGps = gpsStore.onPosition((pos) => {
      if (!followStore.isFollowing()) return
      followStore.beginProgrammaticMove()
      map.panTo([pos.lat, pos.lng], { animate: true, duration: 0.5 })
      followStore.endProgrammaticMove()
    })

    logger.map.info('Map initialized', { center: DEFAULT_CENTER, zoom: DEFAULT_ZOOM })

    return () => {
      unsubGps()
      // Do NOT destroy map — this cleanup runs on React StrictMode double-invoke
      // and on HMR. The map lives as long as the page does.
    }
  }, [])

  // ── Update tile layer when theme/satellite changes ────────────
  // Uses a crossfade: new layer starts at opacity 0, fades to 1 via the
  // CSS transition on .leaflet-layer; old layer is removed after 500 ms.
  useEffect(() => {
    if (!mapInstance) return

    const map = mapInstance  // stable local ref for async closures

    const url =
      mapMode === 'satellite' ? TILE_SATELLITE
      : theme === 'dark'      ? TILE_DARK
      :                         TILE_LIGHT

    const attribution =
      mapMode === 'satellite' ? TILE_SATELLITE_ATTRIBUTION : TILE_ATTRIBUTION

    const tileOptions = {
      attribution,
      subdomains:        'abcd',
      maxZoom:           MAX_ZOOM,
      keepBuffer:        4,
      updateWhenIdle:    false,
      updateWhenZooming: false,
    }

    if (tileLayer) {
      const prev = tileLayer
      // New layer starts invisible and fades in via CSS transition
      const next = L.tileLayer(url, { ...tileOptions, opacity: 0 }).addTo(map)
      tileLayer = next

      // Double-RAF: browser paints opacity:0 before we trigger the transition
      requestAnimationFrame(() => requestAnimationFrame(() => next.setOpacity(1)))
      setTimeout(() => { if (map.hasLayer(prev)) map.removeLayer(prev) }, 500)
    } else {
      tileLayer = L.tileLayer(url, tileOptions).addTo(map)
    }

    logger.map.debug('Tile updated', { mapMode, theme })
  }, [theme, mapMode])

  // ── Sync data-theme attribute to <html> for CSS custom props ──
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
