// ─── Turn-by-turn instruction HUD ──────────────────────────────────────
// Shown below the top-left logo during active navigation.
// Minimal design: arrow + distance only, no background panel.
// Subscribes ONLY to routeStore — distToNextStepM is computed there from
// GPS updates, avoiding the dual-subscription race that caused React #310.

import { useSyncExternalStore } from 'react'
import { routeStore } from './routeStore.js'
import { maneuverArrowRotation } from './maneuver.js'
import { t, getLang, langStore } from '@/lib/locale'

function formatDistM(m: number): string {
  if (m >= 1000) return `${(m / 1000).toFixed(1)} ${t('routePanel.km')}`
  return `${Math.round(m / 10) * 10} ${t('routePanel.m')}`
}

export function TurnInstruction() {
  useSyncExternalStore(langStore.subscribe.bind(langStore), getLang, getLang)
  const { status, route, currentStepIndex, distToNextStepM, arrived, destination } =
    useSyncExternalStore(
      routeStore.subscribe.bind(routeStore),
      () => routeStore.getState(),
      () => routeStore.getState(),
    )

  if (status !== 'ok' || !route) return null

  // Logo is 54px tall, starts at top:12 → bottom at 66px; 10px gap → top:76
  const TOP = 76

  // ── Arrived ──────────────────────────────────────────────────────────
  if (arrived) {
    return (
      <div
        style={{
          position: 'absolute', top: TOP, left: 12, zIndex: 500,
          display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2,
          userSelect: 'none', WebkitUserSelect: 'none',
        }}
      >
        <span style={{
          fontSize: 36,
          filter: 'drop-shadow(0 1px 4px rgba(0,0,0,0.7))',
        }}>✅</span>
        <span style={{
          fontSize: 12, fontWeight: 800, color: '#22c55e',
          textShadow: '0 1px 4px rgba(0,0,0,0.9)',
          whiteSpace: 'nowrap',
        }}>
          {destination?.name ?? t('route.arrived')}
        </span>
      </div>
    )
  }

  const step = route.steps[currentStepIndex]
  if (!step) return null

  const rotation = maneuverArrowRotation(step)

  return (
    <div
      style={{
        position: 'absolute', top: TOP, left: 12, zIndex: 500,
        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3,
        userSelect: 'none', WebkitUserSelect: 'none',
      }}
    >
      {/* Arrow — white with dark drop-shadow for readability on any map */}
      <TurnArrow rotation={rotation} />

      {/* Distance */}
      {distToNextStepM !== null && distToNextStepM > 15 && (
        <div style={{
          fontSize: 14,
          fontWeight: 900,
          color: '#fff',
          textShadow: '0 1px 5px rgba(0,0,0,0.95), 0 0 2px rgba(0,0,0,0.8)',
          letterSpacing: '-0.3px',
          lineHeight: 1,
          fontVariantNumeric: 'tabular-nums',
          fontFamily: 'system-ui, sans-serif',
        }}>
          {formatDistM(distToNextStepM)}
        </div>
      )}
    </div>
  )
}

function TurnArrow({ rotation }: { rotation: number }) {
  return (
    <svg
      width="46" height="46" viewBox="0 0 24 24"
      fill="none"
      strokeLinecap="round" strokeLinejoin="round"
      style={{ transform: `rotate(${rotation}deg)`, transition: 'transform 0.3s ease' }}
      aria-hidden="true"
    >
      {/* Shadow layer */}
      <line x1="12" y1="19" x2="12" y2="5" stroke="rgba(0,0,0,0.7)" strokeWidth="4.5" />
      <polyline points="5 12 12 5 19 12" stroke="rgba(0,0,0,0.7)" strokeWidth="4.5" />
      {/* White arrow */}
      <line x1="12" y1="19" x2="12" y2="5" stroke="#ffffff" strokeWidth="2.8" />
      <polyline points="5 12 12 5 19 12" stroke="#ffffff" strokeWidth="2.8" />
    </svg>
  )
}
