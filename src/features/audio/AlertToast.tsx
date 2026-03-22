// ─── Alert Toast ───────────────────────────────────────────────────────
// Full-width banner that flashes briefly when a proximity alert fires.
// Sits at the very top of the screen, above all other UI.

import { useSyncExternalStore } from 'react'
import { toastStore } from './alertEngine'
import { EVENT_COLORS, EVENT_EMOJI, EVENT_LABELS } from '@/features/events/types'

export function AlertToast() {
  const { type, text, visible } = useSyncExternalStore(
    toastStore.subscribe.bind(toastStore),
    () => toastStore.getState(),
    () => toastStore.getState(),
  )

  const color = type ? EVENT_COLORS[type] : '#e31937'
  const emoji = type ? EVENT_EMOJI[type]  : '⚠️'
  const label = type ? EVENT_LABELS[type] : ''

  return (
    <div
      role="alert"
      aria-live="assertive"
      style={{
        position:   'fixed',
        top:        0,
        left:       0,
        right:      0,
        zIndex:     1000,
        padding:    '10px 20px',
        background: `${color}ee`,
        borderBottom: `2px solid ${color}`,
        display:    'flex',
        alignItems: 'center',
        gap:        10,
        transform:  visible ? 'translateY(0)' : 'translateY(-100%)',
        transition: 'transform 0.25s ease',
        boxShadow:  `0 4px 24px ${color}66`,
      }}
    >
      <span style={{ fontSize: 22 }}>{emoji}</span>
      <div>
        <div style={{ fontSize: 13, fontWeight: 700, color: '#fff', letterSpacing: '0.02em' }}>
          {label} — {text}
        </div>
      </div>
    </div>
  )
}
