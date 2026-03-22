// ─── Speedometer ────────────────────────────────────────────────────────
// Circular speed display pinned bottom-right, above the zoom controls.
// Shows km/h from GPS. Dims when no GPS lock.

import { useSyncExternalStore } from 'react'
import { gpsStore } from '@/features/gps/gpsStore'

export function Speedometer() {
  const pos = useSyncExternalStore(
    gpsStore.onPosition.bind(gpsStore),
    () => gpsStore.getPosition(),
    () => null,
  )

  const speed = pos?.speedKmh ?? null
  const hasSignal = pos !== null

  return (
    <div
      aria-label={speed !== null ? `${speed} km/h` : 'Speed unavailable'}
      style={{
        position:     'absolute',
        bottom:       90,
        right:        12,
        zIndex:       400,
        width:        72,
        height:       72,
        borderRadius: '50%',
        background:   'var(--card-bg, rgba(15,15,25,0.88))',
        border:       '2px solid var(--border, rgba(255,255,255,0.12))',
        backdropFilter: 'blur(12px)',
        boxShadow:    '0 4px 20px rgba(0,0,0,0.45)',
        display:      'flex',
        flexDirection: 'column',
        alignItems:   'center',
        justifyContent: 'center',
        opacity:      hasSignal ? 1 : 0.4,
        transition:   'opacity 0.4s',
        userSelect:   'none',
      }}
    >
      <span style={{
        fontSize:   speed !== null && speed >= 100 ? 22 : 26,
        fontWeight: 700,
        lineHeight: 1,
        color:      'var(--text, #fff)',
        letterSpacing: '-0.5px',
        fontVariantNumeric: 'tabular-nums',
        transition: 'font-size 0.15s',
      }}>
        {speed !== null ? speed : '—'}
      </span>
      <span style={{
        fontSize:   9,
        fontWeight: 500,
        color:      'var(--text-muted, rgba(255,255,255,0.5))',
        letterSpacing: '0.06em',
        marginTop:  2,
        textTransform: 'uppercase',
      }}>
        km/h
      </span>
    </div>
  )
}
