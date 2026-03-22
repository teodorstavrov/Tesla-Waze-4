// ─── GPS watcher hook ─────────────────────────────────────────────────
// Starts navigator.geolocation.watchPosition and feeds results into
// gpsStore. Returns void — callers don't need to receive position data
// directly; they subscribe to gpsStore instead.
//
// Performance notes:
//  - MIN_MOVE_METERS: skip tiny jitter updates (saves avatar redraws)
//  - MIN_SPEED_MS:    only show heading arrow when actually moving
//  - getCurrentPosition first: gives a fast initial fix before watchPosition
//    delivers its first update (which can take several seconds)

import { useEffect, useRef } from 'react'
import type { GpsPosition } from './types'
import { gpsStore } from './gpsStore'
import { haversineMeters } from '@/lib/geo'
import { logger } from '@/lib/logger'

const MIN_MOVE_METERS = 3   // ignore updates < 3 m (GPS noise)
const MIN_SPEED_MS    = 0.8 // m/s below which heading is suppressed

const WATCH_OPTIONS: PositionOptions = {
  enableHighAccuracy: true,
  timeout: 12_000,
  maximumAge: 5_000,
}

export function useUserPosition(): void {
  const lastRef = useRef<GpsPosition | null>(null)

  useEffect(() => {
    if (!navigator.geolocation) {
      logger.gps.warn('Geolocation not supported')
      gpsStore.setStatus('error')
      return
    }

    gpsStore.setStatus('requesting')

    function process(raw: GeolocationPosition): void {
      const { latitude: lat, longitude: lng, heading, accuracy, speed } = raw.coords

      const pos: GpsPosition = {
        lat,
        lng,
        heading: speed != null && speed > MIN_SPEED_MS && heading != null ? heading : null,
        speedKmh: speed != null ? Math.round(speed * 3.6) : null,
        accuracy,
        timestamp: raw.timestamp,
      }

      // Suppress sub-noise updates to avoid unnecessary marker redraws
      const last = lastRef.current
      if (last && haversineMeters([last.lat, last.lng], [lat, lng]) < MIN_MOVE_METERS) {
        return
      }

      lastRef.current = pos
      gpsStore.setPosition(pos)
      logger.gps.debug('Position update', { lat: lat.toFixed(5), lng: lng.toFixed(5), accuracy })
    }

    function onError(err: GeolocationPositionError): void {
      logger.gps.warn('GPS error', err.code, err.message)
      gpsStore.setStatus('error')
    }

    // Fast initial fix (may return a cached position quickly)
    navigator.geolocation.getCurrentPosition(process, () => { /* silent — watchPosition covers this */ }, {
      enableHighAccuracy: false,
      timeout: 3_000,
      maximumAge: 30_000,
    })

    const watchId = navigator.geolocation.watchPosition(process, onError, WATCH_OPTIONS)
    logger.gps.info('watchPosition started', watchId)

    return () => {
      navigator.geolocation.clearWatch(watchId)
      logger.gps.info('watchPosition cleared', watchId)
    }
  }, [])
}
