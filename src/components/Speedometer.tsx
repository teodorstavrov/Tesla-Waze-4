// ─── Speedometer ────────────────────────────────────────────────────────
// Circular speed display pinned bottom-right, above the zoom controls.
// Shows km/h from GPS. Color-codes at 90 km/h (amber) and 130 km/h (red).
// Fires a voice alert when exceeding 130 km/h, 2-minute cooldown.

import { useEffect, useRef } from 'react'
import { useSyncExternalStore } from 'react'
import { gpsStore } from '@/features/gps/gpsStore'
import { audioManager } from '@/features/audio/audioManager'

const WARN_KMH          = 90    // amber — potential non-motorway limit
const ALERT_KMH         = 130   // red   — over any Bulgarian limit
const VOICE_COOLDOWN_MS = 2 * 60 * 1000

export function Speedometer() {
  const pos = useSyncExternalStore(
    gpsStore.onPosition.bind(gpsStore),
    () => gpsStore.getPosition(),
    () => null,
  )

  const speed     = pos?.speedKmh ?? null
  const hasSignal = pos !== null
  const lastAlertRef = useRef<number>(0)

  // ── Voice alert ──────────────────────────────────────────────────
  useEffect(() => {
    if (speed === null || speed <= ALERT_KMH) return
    const now = Date.now()
    if (now - lastAlertRef.current < VOICE_COOLDOWN_MS) return
    lastAlertRef.current = now
    audioManager.beep(1200, 150)
    setTimeout(() => audioManager.speak('Намалете скоростта'), 220)
  }, [speed])

  // ── Colors ───────────────────────────────────────────────────────
  const isAlert = speed !== null && speed > ALERT_KMH
  const isWarn  = speed !== null && speed > WARN_KMH && !isAlert

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
    <div
      aria-label={speed !== null ? `${speed} км/ч` : 'Скоростта не е налична'}
      style={{
        position:       'absolute',
        bottom:         90,
        right:          12,
        zIndex:         400,
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
        км/ч
      </span>
    </div>
  )
}
