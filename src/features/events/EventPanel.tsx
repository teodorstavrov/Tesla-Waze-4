// ─── Event Detail Panel ────────────────────────────────────────────────
// Shows when an event marker is tapped or proximity engine fires.
//
// TESLA MODE: always in DOM, visibility-toggled.
// React mount/unmount creates/destroys GPU compositing layers which forces
// the compositor to rebuild the layer tree → map repaints → visible shake.
// By keeping the container permanently in the DOM and toggling
// aria-hidden/visibility, the GPU layer is pre-allocated at startup and
// showing it is a cheap single-layer compositor op.

import { useSyncExternalStore, useState, useEffect } from 'react'
import { eventStore } from './eventStore.js'
import { EVENT_EMOJI, EVENT_LABELS, EVENT_COLORS, DENY_THRESHOLD } from './types.js'
import { reportedLine } from './eventTime.js'
import { audioManager } from '@/features/audio/audioManager'
import { isTeslaBrowser } from '@/lib/browser'
import { t, langStore } from '@/lib/locale'
import { useThemeStore } from '@/features/theme/store'

export function EventPanel() {
  // Subscribe to lang changes so labels re-render on country switch
  useSyncExternalStore(langStore.subscribe, langStore.getLang, langStore.getLang)
  const isDark = useThemeStore((s) => s.theme === 'dark')

  const event = useSyncExternalStore(
    eventStore.subscribe.bind(eventStore),
    () => eventStore.getState().selectedEvent,
    () => null,
  )
  const showVoting = useSyncExternalStore(
    eventStore.subscribe.bind(eventStore),
    () => eventStore.getState().showVoting,
    () => false,
  )

  const [confirming, setConfirming] = useState(false)
  const [denying,    setDenying]    = useState(false)
  const [countdown,  setCountdown]  = useState(10)
  // Live-updating "Докладвано преди X · изтича след Y" label.
  // Initialized from reportedAt so existing markers show correct elapsed time immediately.
  const [timeLine, setTimeLine] = useState(() =>
    event ? reportedLine(event.reportedAt, event.expiresAt, event.permanent) : ''
  )

  useEffect(() => {
    if (event) audioManager.uiBeep()
    setConfirming(false)
    setDenying(false)
    setCountdown(20)
    setTimeLine(event ? reportedLine(event.reportedAt, event.expiresAt, event.permanent) : '')

    if (!event) return

    const tick = setInterval(() => {
      setCountdown((n) => Math.max(0, n - 1))
    }, 1000)

    // Refresh the time line every 30 s — fine-grained enough for a panel
    const timeRefresh = setInterval(() => {
      setTimeLine(reportedLine(event.reportedAt, event.expiresAt, event.permanent))
    }, 30_000)

    const close = setTimeout(() => eventStore.selectEvent(null), 20000)
    return () => { clearInterval(tick); clearInterval(timeRefresh); clearTimeout(close) }
  }, [event?.id])

  async function handleConfirm(): Promise<void> {
    if (confirming || denying) return
    setConfirming(true)
    audioManager.confirmBeep()
    await eventStore.confirm(event!.id)
    setConfirming(false)
    eventStore.selectEvent(null)
  }

  async function handleDeny(): Promise<void> {
    if (confirming || denying) return
    setDenying(true)
    audioManager.uiBeep()
    await eventStore.deny(event!.id)
    setDenying(false)
    eventStore.selectEvent(null)
  }

  const isVisible = Boolean(event)

  // ── Non-Tesla: standard conditional render ────────────────────────
  if (!isTeslaBrowser && !isVisible) return null

  const color = event ? (EVENT_COLORS[event.type] ?? '#888') : '#888'
  const emoji = event ? (EVENT_EMOJI[event.type]  ?? '📍') : '📍'
  const label = event ? t(`events.${event.type}`) || (EVENT_LABELS[event.type] ?? event.type) : ''
  const denies       = event?.denies  ?? 0
  const deniesLeft   = DENY_THRESHOLD - denies
  const denyProgress = Math.min(denies / DENY_THRESHOLD, 1)

  return (
    // ── Tesla: always-present host — visibility toggled via aria-hidden ──
    // position: absolute keeps it out of document flow.
    // contain: layout style paint (applied via CSS on [data-tesla] .tesla-overlay-host)
    // prevents any internal change from triggering map repaint.
    <div
      className={isTeslaBrowser ? 'tesla-overlay-host' : undefined}
      aria-hidden={isTeslaBrowser ? !isVisible : undefined}
      style={{
        position:      'absolute',
        bottom:        90,
        left:          '50%',
        transform:     'translateX(-50%)',
        width:         'min(480px, calc(100vw - 24px))',
        zIndex:        500,
      }}
    >
      <div
        role="dialog"
        aria-label={label}
        className={isTeslaBrowser ? 'glass tesla-overlay-inner' : 'glass'}
        style={{
          padding:       '20px 22px',
          display:       'flex',
          flexDirection: 'column',
          gap:           14,
          ...(isTeslaBrowser ? {} : {
            opacity:    isVisible ? 1 : 0,
            transform:  isVisible ? 'scale(1)' : 'scale(0.97)',
            transition: 'opacity 0.2s ease-out, transform 0.2s ease-out',
            pointerEvents: isVisible ? 'auto' : 'none',
          }),
        }}
      >
        {/* Only render content when event is present — avoids unnecessary work */}
        {event && (
          <>
            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{
                width: 52, height: 52, borderRadius: '50%', flexShrink: 0,
                background: `${color}22`, border: `2px solid ${color}`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 24,
              }}>
                {emoji}
              </div>

              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 19, fontWeight: 700, color }}>
                  {label}
                </div>
                {timeLine && (
                  <div style={{
                    fontSize: 11, color: isDark ? 'rgba(255,255,255,0.4)' : 'rgba(0,0,0,0.5)',
                    marginTop: 3, lineHeight: 1.4, letterSpacing: '0.01em',
                  }}>
                    {timeLine}
                  </div>
                )}
              </div>

              <button
                onClick={() => eventStore.selectEvent(null)}
                aria-label={t('events.close')}
                style={{
                  background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.12)',
                  color: 'var(--text-secondary)', cursor: 'pointer',
                  padding: 0, borderRadius: '50%', lineHeight: 1, flexShrink: 0,
                  width: 42, height: 42, display: 'flex', alignItems: 'center', justifyContent: 'center',
                  position: 'relative',
                }}
              >
                {showVoting
                  ? <span style={{
                      fontSize: 15, fontWeight: 700, lineHeight: 1,
                      color: 'var(--text-secondary)',
                    }}>
                      {countdown}
                    </span>
                  : <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true"
                      stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
                      <line x1="3" y1="3" x2="13" y2="13" />
                      <line x1="13" y1="3" x2="3" y2="13" />
                    </svg>
                }
              </button>
            </div>

            {event.description && (
              <div style={{ fontSize: 13, color: 'var(--text-primary)', lineHeight: 1.5 }}>
                {event.description}
              </div>
            )}

            {/* Deny progress bar */}
            {denies > 0 && (
              <div>
                <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginBottom: 4 }}>
                  {deniesLeft > 0
                    ? `${deniesLeft} ${t('events.denyProgress')}`
                    : t('events.denyDeleting')}
                </div>
                <div style={{ height: 3, borderRadius: 2, background: 'rgba(255,255,255,0.12)' }}>
                  <div style={{
                    height: '100%', borderRadius: 2,
                    background: '#ef4444',
                    width: `${denyProgress * 100}%`,
                  }} />
                </div>
              </div>
            )}

            {/* Actions — only when opened by proximity engine */}
            {showVoting && <div style={{ display: 'flex', gap: 8 }}>
              <button
                onClick={() => { void handleConfirm() }}
                disabled={confirming || denying}
                style={{
                  flex: 1, padding: '14px 0', borderRadius: 10,
                  background: 'rgba(34,197,94,0.2)', border: '1.5px solid rgba(34,197,94,0.6)',
                  color: '#22c55e', fontSize: 18, fontWeight: 700,
                  cursor: 'pointer', touchAction: 'manipulation',
                  opacity: confirming ? 0.6 : 1,
                }}
              >
                👍 {t('events.confirm')}{event.confirms > 0 ? ` (${event.confirms})` : ''}
              </button>
              <button
                onClick={() => { void handleDeny() }}
                disabled={confirming || denying}
                style={{
                  flex: 1, padding: '14px 0', borderRadius: 10,
                  background: 'rgba(239,68,68,0.12)', border: '1.5px solid rgba(239,68,68,0.4)',
                  color: '#f87171', fontSize: 18, fontWeight: 700,
                  cursor: 'pointer', touchAction: 'manipulation',
                  opacity: denying ? 0.6 : 1,
                }}
              >
                👎 {t('events.deny')}{denies > 0 ? ` (${denies})` : ''}
              </button>
            </div>}
          </>
        )}
      </div>
    </div>
  )
}
