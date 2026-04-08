// ─── Alert Toast ───────────────────────────────────────────────────────
// Slim banner at top of screen when proximity alert fires.
// Confirm/deny buttons are in the auto-opened EventPanel below.
//
// TESLA MODE: always in DOM, visibility-toggled.
// The transform-slide approach requires the compositor to re-composite the
// entire viewport each time the banner appears/disappears (layer moves in/out
// of the visible area). On Tesla's software compositor this causes visible
// map shake. Keeping the element always painted and toggling visibility is a
// single compositor op that never touches the map layer.

import { useSyncExternalStore } from 'react'
import { toastStore } from './alertEngine'
import { EVENT_COLORS, EVENT_EMOJI, EVENT_LABELS } from '@/features/events/types'
import { isTeslaBrowser } from '@/lib/browser'

export function AlertToast() {
  const { type, text, distM, visible } = useSyncExternalStore(
    toastStore.subscribe.bind(toastStore),
    () => toastStore.getState(),
    () => toastStore.getState(),
  )

  const color = type ? EVENT_COLORS[type] : '#e31937'
  const emoji = type ? EVENT_EMOJI[type]  : '⚠️'
  const label = type ? EVENT_LABELS[type] : ''

  if (isTeslaBrowser) {
    // ── Tesla: flat banner, visibility-toggled, always in DOM ────────────
    // No transform, no transition, no shadow. The element is permanently
    // painted in its final position; visibility on/off is a free compositor
    // op that does not cause map repaint.
    return (
      <div
        role="alert"
        aria-live="assertive"
        aria-hidden={!visible}
        className="tesla-alert-banner"
        style={{
          position:        'fixed',
          top:             0,
          left:            0,
          right:           0,
          zIndex:          1000,
          padding:         '10px 20px',
          background:      color,
          borderBottom:    `2px solid rgba(0,0,0,0.3)`,
          display:         'flex',
          alignItems:      'center',
          gap:             10,
        }}
      >
        <span style={{ fontSize: 22 }}>{emoji}</span>
        <div style={{ fontSize: 13, fontWeight: 700, color: '#fff', letterSpacing: '0.02em' }}>
          {label}{label && text ? ' — ' : ''}{text}
          {distM != null && (
            <span style={{ fontWeight: 400, opacity: 0.85, marginLeft: 8 }}>
              ({distM < 1000 ? `${distM} м` : `${(distM / 1000).toFixed(1)} км`})
            </span>
          )}
        </div>
      </div>
    )
  }

  // ── Standard browser: opacity + scale fade ───────────────────────────
  // Pure compositor op — no layout movement, no map repaint.
  return (
    <div
      role="alert"
      aria-live="assertive"
      style={{
        position:        'fixed',
        top:             0,
        left:            0,
        right:           0,
        zIndex:          1000,
        padding:         '10px 20px',
        background:      `${color}ee`,
        borderBottom:    `2px solid ${color}`,
        display:         'flex',
        alignItems:      'center',
        gap:             10,
        opacity:         visible ? 1 : 0,
        transform:       visible ? 'scale(1)' : 'scale(0.97)',
        transformOrigin: 'top center',
        transition:      'opacity 0.2s ease-out, transform 0.2s ease-out',
        pointerEvents:   visible ? 'auto' : 'none',
        boxShadow:       `0 4px 24px ${color}66`,
      }}
    >
      <span style={{ fontSize: 22 }}>{emoji}</span>
      <div style={{ fontSize: 13, fontWeight: 700, color: '#fff', letterSpacing: '0.02em' }}>
        {label}{label && text ? ' — ' : ''}{text}
        {distM != null && (
          <span style={{ fontWeight: 400, opacity: 0.85, marginLeft: 8 }}>
            ({distM < 1000 ? `${distM} м` : `${(distM / 1000).toFixed(1)} км`})
          </span>
        )}
      </div>
    </div>
  )
}
