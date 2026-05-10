// ─── Car clock — bottom-left, above the online counter ────────────────
// Shows current time (HH:MM) using the Tesla browser's system clock,
// which is already synchronized with the car's clock. Updates every second.
// Tesla-optimised: GPU layer pre-promoted, no box-shadow glow.

import { useState, useEffect, useSyncExternalStore } from 'react'
import { uiStore } from '@/features/settings/uiStore'

function fmt(date: Date): string {
  const h = date.getHours().toString().padStart(2, '0')
  const m = date.getMinutes().toString().padStart(2, '0')
  return `${h}:${m}`
}

export function CarClock() {
  const { showClock } = useSyncExternalStore(
    uiStore.subscribe,
    uiStore.getState,
    uiStore.getState,
  )
  const [time, setTime] = useState(() => fmt(new Date()))

  useEffect(() => {
    const tick = () => setTime(fmt(new Date()))
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [])

  if (!showClock) return null

  return (
    <div
      aria-label={`Current time: ${time}`}
      style={{
        position:         'absolute',
        bottom:           30,
        left:             12,
        zIndex:           300,
        userSelect:       'none',
        WebkitUserSelect: 'none',
        pointerEvents:    'none',
        transform:        'translateZ(0)',
        background:       'rgba(0,0,0,0.45)',
        borderRadius:     8,
        padding:          '4px 10px',
      }}
    >
      <span style={{
        fontSize:           30,
        fontWeight:         700,
        color:              '#ffffff',
        fontVariantNumeric: 'tabular-nums',
        fontFamily:         'system-ui, sans-serif',
        lineHeight:         1,
        letterSpacing:      '0.04em',
      }}>
        {time}
      </span>
    </div>
  )
}
