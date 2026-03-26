// ─── Turn-by-turn instruction HUD ──────────────────────────────────────
// Shown at top-left during active navigation (replaces FloatingTitleCard).
// Subscribes ONLY to routeStore — distToNextStepM is computed there from
// GPS updates, avoiding the dual-subscription race that caused React #310.

import { useSyncExternalStore } from 'react'
import { routeStore } from './routeStore.js'
import { maneuverDisplayText, maneuverArrowRotation } from './maneuver.js'

function formatDistM(m: number): string {
  if (m >= 1000) return `${(m / 1000).toFixed(1)} км`
  return `${Math.round(m / 10) * 10} м`
}

export function TurnInstruction() {
  const { status, route, currentStepIndex, distToNextStepM, arrived, destination } =
    useSyncExternalStore(
      routeStore.subscribe.bind(routeStore),
      () => routeStore.getState(),
      () => routeStore.getState(),
    )

  if (status !== 'ok' || !route) return null

  // ── Arrived ──────────────────────────────────────────────────────
  if (arrived) {
    return (
      <div
        className="glass"
        style={{
          position: 'absolute', top: 12, left: 12, zIndex: 500,
          padding: '10px 16px', display: 'flex', alignItems: 'center', gap: 10,
          minWidth: 200,
        }}
      >
        <div style={{
          width: 36, height: 36, borderRadius: '50%', flexShrink: 0,
          background: 'rgba(34,197,94,0.18)', border: '2px solid #22c55e',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 18,
        }}>
          ✓
        </div>
        <div>
          <div style={{ fontSize: 15, fontWeight: 700, color: '#22c55e' }}>
            Пристигнахте!
          </div>
          <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 2 }}>
            {destination?.name}
          </div>
        </div>
      </div>
    )
  }

  const step = route.steps[currentStepIndex]
  if (!step) return null

  const rotation    = maneuverArrowRotation(step)
  const displayText = maneuverDisplayText(step)
  const streetName  = step.name

  return (
    <div
      className="glass"
      style={{
        position: 'absolute', top: 12, left: 12, zIndex: 500,
        padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 10,
        minWidth: 200, maxWidth: 260,
      }}
    >
      {/* Arrow */}
      <div style={{
        width: 40, height: 40, borderRadius: 10, flexShrink: 0,
        background: 'rgba(227,25,55,0.15)', border: '1.5px solid #e31937',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <TurnArrow rotation={rotation} />
      </div>

      {/* Text */}
      <div style={{ minWidth: 0, flex: 1 }}>
        <div style={{
          fontSize: 15, fontWeight: 700, color: 'var(--text-primary)', lineHeight: 1.2,
          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
        }}>
          {displayText}
        </div>
        {distToNextStepM !== null && distToNextStepM > 15 && (
          <div style={{ fontSize: 12, color: '#e31937', fontWeight: 600, marginTop: 2 }}>
            след {formatDistM(distToNextStepM)}
          </div>
        )}
        {streetName && (
          <div style={{
            fontSize: 10, color: 'var(--text-secondary)', marginTop: 2,
            whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
          }}>
            {streetName}
          </div>
        )}
      </div>
    </div>
  )
}

function TurnArrow({ rotation }: { rotation: number }) {
  return (
    <svg
      width="22" height="22" viewBox="0 0 24 24"
      fill="none" stroke="#e31937" strokeWidth="2.5"
      strokeLinecap="round" strokeLinejoin="round"
      style={{ transform: `rotate(${rotation}deg)`, transition: 'transform 0.3s ease' }}
      aria-hidden="true"
    >
      <line x1="12" y1="19" x2="12" y2="5" />
      <polyline points="5 12 12 5 19 12" />
    </svg>
  )
}
