// ─── Event Detail Panel ────────────────────────────────────────────────
// Shows when an event marker is tapped.

import { useSyncExternalStore, useState } from 'react'
import { eventStore } from './eventStore.js'
import { EVENT_EMOJI, EVENT_LABELS, EVENT_COLORS, DENY_THRESHOLD } from './types.js'

export function EventPanel() {
  const event = useSyncExternalStore(
    eventStore.subscribe.bind(eventStore),
    () => eventStore.getState().selectedEvent,
    () => null,
  )

  const [confirming, setConfirming] = useState(false)
  const [denying,    setDenying]    = useState(false)

  if (!event) return null

  const color = EVENT_COLORS[event.type] ?? '#888'
  const emoji = EVENT_EMOJI[event.type]  ?? '📍'
  const label = EVENT_LABELS[event.type] ?? event.type

  async function handleConfirm(): Promise<void> {
    if (confirming || denying) return
    setConfirming(true)
    await eventStore.confirm(event!.id)
    setConfirming(false)
  }

  async function handleDeny(): Promise<void> {
    if (confirming || denying) return
    setDenying(true)
    await eventStore.deny(event!.id)
    // event may have been removed from store — panel closes automatically
    setDenying(false)
  }

  const denies       = event.denies  ?? 0
  const deniesLeft   = DENY_THRESHOLD - denies
  const denyProgress = Math.min(denies / DENY_THRESHOLD, 1)

  return (
    <div
      role="dialog"
      aria-label={label}
      style={{
        position:      'absolute',
        bottom:        90,
        left:          '50%',
        transform:     'translateX(-50%)',
        width:         'min(400px, calc(100vw - 24px))',
        zIndex:        500,
        padding:       '16px 18px',
        display:       'flex',
        flexDirection: 'column',
        gap:           12,
      }}
      className="glass"
    >
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <div style={{
          width: 44, height: 44, borderRadius: '50%', flexShrink: 0,
          background: `${color}22`, border: `2px solid ${color}`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 20,
        }}>
          {emoji}
        </div>

        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 16, fontWeight: 700, color }}>
            {label}
          </div>
          <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 2 }}>
            Докладвано {formatAge(event.reportedAt)} · изтича {formatExpiry(event.expiresAt)}
          </div>
        </div>

        <button
          onClick={() => eventStore.selectEvent(null)}
          aria-label="Затвори"
          style={{
            background: 'none', border: 'none',
            color: 'var(--text-secondary)', cursor: 'pointer',
            padding: 4, fontSize: 18, lineHeight: 1, flexShrink: 0,
          }}
        >
          &#x2715;
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
              ? `${deniesLeft} гласа "вече го няма" за изтриване`
              : 'Изтрива се...'}
          </div>
          <div style={{ height: 3, borderRadius: 2, background: 'rgba(255,255,255,0.12)' }}>
            <div style={{
              height: '100%', borderRadius: 2,
              background: '#ef4444',
              width: `${denyProgress * 100}%`,
              transition: 'width 0.3s',
            }} />
          </div>
        </div>
      )}

      {/* Actions */}
      <div style={{ display: 'flex', gap: 8 }}>
        <button
          onClick={() => { void handleConfirm() }}
          disabled={confirming || denying}
          style={{
            flex: 1,
            padding: '10px 0',
            borderRadius: 10,
            background: `${color}22`,
            border: `1.5px solid ${color}55`,
            color,
            fontSize: 13,
            fontWeight: 700,
            cursor: 'pointer',
            touchAction: 'manipulation',
            opacity: confirming ? 0.6 : 1,
          }}
        >
          &#x1F44D; Потвърждавам{event.confirms > 0 ? ` (${event.confirms})` : ''}
        </button>

        <button
          onClick={() => { void handleDeny() }}
          disabled={confirming || denying}
          style={{
            flex: 1,
            padding: '10px 0',
            borderRadius: 10,
            background: 'rgba(239,68,68,0.12)',
            border: '1.5px solid rgba(239,68,68,0.4)',
            color: '#f87171',
            fontSize: 13,
            fontWeight: 700,
            cursor: 'pointer',
            touchAction: 'manipulation',
            opacity: denying ? 0.6 : 1,
          }}
        >
          &#x1F44E; Вече го няма{denies > 0 ? ` (${denies})` : ''}
        </button>
      </div>
    </div>
  )
}

function formatAge(iso: string): string {
  const ms  = Date.now() - new Date(iso).getTime()
  const min = Math.floor(ms / 60000)
  if (min < 1)  return 'току-що'
  if (min < 60) return `преди ${min}м`
  return `преди ${Math.floor(min / 60)}ч`
}

function formatExpiry(iso: string): string {
  const ms = new Date(iso).getTime() - Date.now()
  if (ms < 0)   return 'изтекло'
  const min = Math.floor(ms / 60000)
  if (min < 60) return `след ${min}м`
  return `след ${Math.round(ms / 3600000)}ч`
}
