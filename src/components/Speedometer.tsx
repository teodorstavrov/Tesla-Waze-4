// ─── Speedometer ────────────────────────────────────────────────────────
// Circular speed display pinned bottom-right, above the zoom controls.
// Shows km/h from GPS. Color-codes relative to the current road speed limit
// fetched from OSM (Overpass API). Falls back to 90/130 km/h thresholds
// when no OSM limit is available.
// Fires a voice alert when exceeding the limit (or 130 km/h fallback),
// with a 2-minute cooldown.

import { useEffect, useRef } from 'react'
import { useSyncExternalStore } from 'react'
import { gpsStore } from '@/features/gps/gpsStore'
import { speedLimitStore } from '@/features/speedlimit/speedLimitStore'
import { audioManager } from '@/features/audio/audioManager'
import { t, getLang, langStore } from '@/lib/locale'

const WARN_FALLBACK_KMH  = 90    // amber when no OSM limit and speed > 90
const ALERT_FALLBACK_KMH = 130   // red/voice when no OSM limit and speed > 130
const OVER_LIMIT_MARGIN  = 0     // km/h above limit → red
const WARN_MARGIN        = -10   // km/h below limit → amber (within 10 km/h of limit)
const VOICE_COOLDOWN_MS  = 2 * 60 * 1000

export function Speedometer() {
  useSyncExternalStore(langStore.subscribe.bind(langStore), getLang, getLang)
  const pos = useSyncExternalStore(
    gpsStore.onPosition.bind(gpsStore),
    () => gpsStore.getPosition(),
    () => null,
  )
  const limit = useSyncExternalStore(
    speedLimitStore.subscribe.bind(speedLimitStore),
    () => speedLimitStore.getLimit(),
    () => null,
  )

  const speed     = pos?.speedKmh ?? null
  const hasSignal = pos !== null
  const lastAlertRef = useRef<number>(0)

  // ── Determine thresholds from OSM limit or fallback ──────────────────
  const alertKmh = limit ?? ALERT_FALLBACK_KMH
  const warnKmh  = limit != null ? limit + WARN_MARGIN : WARN_FALLBACK_KMH

  // ── Voice alert when exceeding limit ─────────────────────────────────
  useEffect(() => {
    if (speed === null || speed <= alertKmh) return
    const now = Date.now()
    if (now - lastAlertRef.current < VOICE_COOLDOWN_MS) return
    lastAlertRef.current = now
    audioManager.beep(1200, 150)
    setTimeout(() => audioManager.speak(t('speedo.slowDown')), 220)
  }, [speed, alertKmh])

  // ── Color state ───────────────────────────────────────────────────────
  const isAlert = speed !== null && speed > alertKmh + OVER_LIMIT_MARGIN
  const isWarn  = speed !== null && speed > warnKmh && !isAlert

  const accentColor =
    isAlert ? '#ef4444'
    : isWarn ? '#f59e0b'
    : undefined

  const borderColor =
    isAlert ? 'rgba(239,68,68,0.8)'
    : isWarn ? 'rgba(245,158,11,0.7)'
    : 'rgba(255,255,255,0.12)'

  const glowShadow =
    isAlert ? '0 0 0 3px rgba(239,68,68,0.35), 0 4px 20px rgba(239,68,68,0.45)'
    : isWarn ? '0 0 0 2px rgba(245,158,11,0.3), 0 4px 20px rgba(0,0,0,0.45)'
    : '0 4px 20px rgba(0,0,0,0.45)'

  return (
    <div style={{ position: 'absolute', bottom: 90, right: 12, zIndex: 400 }}>
      {/* ── Speed circle ─────────────────────────────────────────────── */}
      <div
        aria-label={speed !== null ? `${speed} ${t('speedo.kmh')}` : t('speedo.noSignal')}
        style={{
          width:          72,
          height:         72,
          borderRadius:   '50%',
          background:     isAlert
            ? 'rgba(80,10,10,0.92)'
            : isWarn
            ? 'rgba(60,40,5,0.92)'
            : 'rgba(15,15,25,0.88)',
          border:         `2px solid ${borderColor}`,
          backdropFilter: 'blur(12px)',
          boxShadow:      glowShadow,
          display:        'flex',
          flexDirection:  'column',
          alignItems:     'center',
          justifyContent: 'center',
          opacity:        hasSignal ? 1 : 0.4,
          transition:     'opacity 0.4s, border-color 0.3s, box-shadow 0.3s, background 0.3s',
          userSelect:     'none',
          WebkitUserSelect: 'none',
        }}
      >
        <span style={{
          fontSize:           speed !== null && speed >= 100 ? 22 : 26,
          fontWeight:         700,
          lineHeight:         1,
          color:              accentColor ?? '#fff',
          letterSpacing:      '-0.5px',
          fontVariantNumeric: 'tabular-nums',
          transition:         'font-size 0.15s, color 0.3s',
        }}>
          {speed !== null ? speed : '—'}
        </span>
        <span style={{
          fontSize:      9,
          fontWeight:    500,
          color:         accentColor ? `${accentColor}cc` : 'rgba(255,255,255,0.5)',
          letterSpacing: '0.06em',
          marginTop:     2,
          textTransform: 'uppercase',
          transition:    'color 0.3s',
        }}>
          {t('speedo.kmh')}
        </span>
      </div>

      {/* ── Speed limit badge (road-sign style) ──────────────────────── */}
      {limit !== null && (
        <div
          aria-label={`Speed limit ${limit} km/h`}
          style={{
            position:       'absolute',
            bottom:         -2,
            right:          -2,
            width:          28,
            height:         28,
            borderRadius:   '50%',
            background:     '#fff',
            border:         `3px solid #e00`,
            display:        'flex',
            alignItems:     'center',
            justifyContent: 'center',
            boxShadow:      '0 2px 6px rgba(0,0,0,0.5)',
            userSelect:     'none',
            WebkitUserSelect: 'none',
          }}
        >
          <span style={{
            fontSize:           limit >= 100 ? 8 : 10,
            fontWeight:         800,
            color:              '#111',
            letterSpacing:      '-0.5px',
            fontVariantNumeric: 'tabular-nums',
            lineHeight:         1,
          }}>
            {limit}
          </span>
        </div>
      )}
    </div>
  )
}
