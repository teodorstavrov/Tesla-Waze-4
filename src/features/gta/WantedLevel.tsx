// ─── GTA Wanted Level HUD ──────────────────────────────────────────────
//
// Fixed-position overlay showing 0–5 GTA-style stars.
// NEVER blocks taps — pointer-events: none on everything.
// NEVER overlaps existing UI — positioned at bottom-right above the dock.
//
// TESLA: always in DOM (avoids compositor layer churn on first appearance).
//        Uses visibility:hidden when level = 0 so the layer stays promoted.
// NON-TESLA: conditionally rendered (simpler, no layer concerns).
//
// PERFORMANCE:
//   • Static mode (wantedLevelEffects = false, the default):
//     No CSS animations. Just color changes. Safe for MCU1 (Tegra 3).
//   • Effects mode (wantedLevelEffects = true, user-opt-in):
//     Gentle opacity pulse via @keyframes wanted-pulse in globals.css.
//     User enables this only if they know their device can handle it.

import { useSyncExternalStore } from 'react'
import { wantedLevelStore } from './wantedLevelStore'
import { settingsStore } from '@/features/settings/settingsStore'
import { isTeslaBrowser } from '@/lib/browser'

// Star color by total wanted level
function _starColor(level: number): string {
  if (level >= 4) return '#ef4444'   // red
  if (level >= 3) return '#f97316'   // orange
  return '#fbbf24'                   // yellow
}

function WantedStar({ filled, color, effects }: {
  filled:  boolean
  color:   string
  effects: boolean
}) {
  return (
    <svg
      width="16" height="16" viewBox="0 0 24 24" aria-hidden="true"
      style={filled && effects ? { animation: 'wanted-pulse 1.4s ease-in-out infinite' } : undefined}
    >
      <polygon
        points="12,2 15.09,8.26 22,9.27 17,14.14 18.18,21.02 12,17.77 5.82,21.02 7,14.14 2,9.27 8.91,8.26"
        fill={filled ? color : 'rgba(255,255,255,0.1)'}
        stroke={filled ? color + '99' : 'rgba(255,255,255,0.06)'}
        strokeWidth="0.5"
      />
    </svg>
  )
}

export function WantedLevel() {
  const level = useSyncExternalStore(
    wantedLevelStore.subscribe.bind(wantedLevelStore),
    () => wantedLevelStore.getLevel(),
    () => 0,
  )

  const { wantedLevelEnabled, wantedLevelEffects } = useSyncExternalStore(
    settingsStore.subscribe.bind(settingsStore),
    () => {
      const s = settingsStore.get()
      return { wantedLevelEnabled: s.wantedLevelEnabled, wantedLevelEffects: s.wantedLevelEffects }
    },
    () => ({ wantedLevelEnabled: true, wantedLevelEffects: false }),
  )

  if (!wantedLevelEnabled) return null

  const color   = _starColor(level)
  const visible = level > 0

  const container = (
    <div
      aria-hidden="true"
      style={{
        position:         'absolute',
        bottom:           170,
        right:            12,
        zIndex:           300,
        pointerEvents:    'none',
        userSelect:       'none',
        WebkitUserSelect: 'none',
        transform:        'translateZ(0)',   // pre-promote GPU layer
        ...(isTeslaBrowser
          ? { visibility: visible ? 'visible' : 'hidden' }
          : { opacity: visible ? 1 : 0, transition: 'opacity 0.3s ease' }
        ),
      }}
    >
      {/* Label */}
      <div style={{
        fontSize:      8,
        fontWeight:    700,
        letterSpacing: '0.18em',
        color:         visible ? color : 'rgba(255,255,255,0.3)',
        textAlign:     'center',
        marginBottom:  3,
        fontFamily:    'system-ui, sans-serif',
        textTransform: 'uppercase',
      }}>
        WANTED
      </div>

      {/* Stars row */}
      <div style={{
        display:        'flex',
        gap:            3,
        alignItems:     'center',
        background:     'rgba(0,0,0,0.5)',
        borderRadius:   8,
        padding:        '4px 8px',
        border:         `1px solid ${visible ? color + '44' : 'rgba(255,255,255,0.08)'}`,
      }}>
        {[0, 1, 2, 3, 4].map((i) => (
          <WantedStar
            key={i}
            filled={i < level}
            color={color}
            effects={wantedLevelEffects && visible}
          />
        ))}
      </div>
    </div>
  )

  // On non-Tesla, skip rendering entirely when hidden to avoid unnecessary DOM
  if (!isTeslaBrowser && !visible) return null

  return container
}
