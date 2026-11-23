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
import { EVENT_COLORS, EVENT_EMOJI } from '@/features/events/types'
import { isTeslaBrowser } from '@/lib/browser'
import { t, getLang, langStore } from '@/lib/locale'
import { gtaModeStore } from '@/features/gta/gtaModeStore'

// GTA Vice City accent colors per event type
const GTA_ALERT_COLORS: Record<string, { border: string; glow: string; label: string }> = {
  police:        { border: '#3B82F6', glow: 'rgba(59,130,246,0.55)',  label: '#60A5FA' },
  accident:      { border: '#EF4444', glow: 'rgba(239,68,68,0.55)',   label: '#F87171' },
  hazard:        { border: '#FFB52E', glow: 'rgba(255,181,46,0.55)',  label: '#FCD34D' },
  traffic:       { border: '#F97316', glow: 'rgba(249,115,22,0.55)',  label: '#FB923C' },
  camera:        { border: '#8B42FF', glow: 'rgba(139,66,255,0.55)',  label: '#A78BFA' },
  construction:  { border: '#FFB52E', glow: 'rgba(255,181,46,0.55)',  label: '#FCD34D' },
}

export function AlertToast() {
  useSyncExternalStore(langStore.subscribe.bind(langStore), getLang, getLang)
  const { type, text, distM, visible } = useSyncExternalStore(
    toastStore.subscribe.bind(toastStore),
    () => toastStore.getState(),
    () => toastStore.getState(),
  )
  const gtaActive = useSyncExternalStore(
    gtaModeStore.subscribe.bind(gtaModeStore),
    () => gtaModeStore.isActive(),
    () => false,
  )

  const color = type ? EVENT_COLORS[type] : '#e31937'
  const emoji = type ? EVENT_EMOJI[type]  : '⚠️'
  const label = type ? t(`events.${type}`) : ''

  // ── GTA VI Vice City styled alert ────────────────────────────────────────
  if (gtaActive) {
    const gtaTheme = type ? GTA_ALERT_COLORS[type] ?? GTA_ALERT_COLORS['hazard']! : GTA_ALERT_COLORS['hazard']!
    const distLabel = distM != null
      ? (distM < 1000 ? `${distM} ${t('routePanel.m')}` : `${(distM / 1000).toFixed(1)} ${t('routePanel.km')}`)
      : null

    if (isTeslaBrowser) {
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
            padding:         '8px 16px',
            background:      `linear-gradient(135deg, ${gtaTheme.glow} 0%, rgba(8,13,32,0.92) 65%)`,
            borderBottom:    `2px solid ${gtaTheme.border}`,
            display:         'flex',
            alignItems:      'center',
            gap:             10,
          }}
        >
          <span style={{ fontSize: 20 }}>{emoji}</span>
          <div style={{ flex: 1 }}>
            <span style={{
              fontSize: 10, fontWeight: 800, letterSpacing: '0.12em',
              textTransform: 'uppercase', color: '#FFFFFF',
            }}>
              {label}
            </span>
            {text ? (
              <span style={{ fontSize: 10, color: '#E8ECF5', marginLeft: 6 }}>{text}</span>
            ) : null}
          </div>
          {distLabel && (
            <span style={{
              fontSize: 11, fontWeight: 700, color: '#FFFFFF',
              letterSpacing: '0.06em',
            }}>
              {distLabel}
            </span>
          )}
        </div>
      )
    }

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
          padding:         '8px 16px',
          background:      `linear-gradient(135deg, ${gtaTheme.glow} 0%, rgba(8,13,32,0.92) 65%)`,
          borderBottom:    `2px solid ${gtaTheme.border}`,
          boxShadow:       `0 0 24px ${gtaTheme.glow}, 0 4px 16px rgba(0,0,0,0.6)`,
          display:         'flex',
          alignItems:      'center',
          gap:             10,
          opacity:         visible ? 1 : 0,
          transform:       visible ? 'translateY(0)' : 'translateY(-100%)',
          transition:      'opacity 0.18s ease-out, transform 0.18s ease-out',
          pointerEvents:   visible ? 'auto' : 'none',
        }}
      >
        <span style={{ fontSize: 20 }}>{emoji}</span>
        <div style={{ flex: 1 }}>
          <span style={{
            fontSize: 10, fontWeight: 800, letterSpacing: '0.12em',
            textTransform: 'uppercase', color: '#FFFFFF',
          }}>
            {label}
          </span>
          {text ? (
            <span style={{ fontSize: 10, color: '#E8ECF5', marginLeft: 6 }}>{text}</span>
          ) : null}
        </div>
        {distLabel && (
          <span style={{
            fontSize: 11, fontWeight: 700, color: '#FFFFFF',
            letterSpacing: '0.06em',
          }}>
            {distLabel}
          </span>
        )}
      </div>
    )
  }

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
              ({distM < 1000 ? `${distM} ${t('routePanel.m')}` : `${(distM / 1000).toFixed(1)} ${t('routePanel.km')}`})
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
            ({distM < 1000 ? `${distM} ${t('routePanel.m')}` : `${(distM / 1000).toFixed(1)} ${t('routePanel.km')}`})
          </span>
        )}
      </div>
    </div>
  )
}
