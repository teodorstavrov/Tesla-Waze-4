// ─── Event Detail Panel ────────────────────────────────────────────────
// Shows when an event marker is tapped. Similar layout to StationPanel.

import { useSyncExternalStore, useState } from 'react'
import { eventStore } from './eventStore.js'
import { EVENT_EMOJI, EVENT_LABELS, EVENT_COLORS } from './types.js'

export function EventPanel() {
  const event = useSyncExternalStore(
    eventStore.subscribe.bind(eventStore),
    () => eventStore.getState().selectedEvent,
    () => null,
  )

  const [confirming, setConfirming] = useState(false)

  if (!event) return null

  const color = EVENT_COLORS[event.type] ?? '#888'
  const emoji = EVENT_EMOJI[event.type] ?? '📍'
  const label = EVENT_LABELS[event.type] ?? event.type

  const age = formatAge(event.reportedAt)
  const expires = formatExpiry(event.expiresAt)

  async function handleConfirm(): Promise<void> {
    if (confirming) return
    setConfirming(true)
    await eventStore.confirm(event!.id)
    setConfirming(false)
  }

  return (
    <div
      role="dialog"
      aria-label={label}
      style={{
        position:  'absolute',
        bottom:     90,
        left:      '50%',
        transform: 'translateX(-50%)',
        width:     'min(400px, calc(100vw - 24px))',
        zIndex:     500,
        padding:   '16px 18px',
        display:   'flex',
        flexDirection: 'column',
        gap:        12,
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
            Reported {age} · Expires {expires}
          </div>
        </div>

        <button
          onClick={() => eventStore.selectEvent(null)}
          aria-label="Close"
          style={{
            background: 'none', border: 'none',
            color: 'var(--text-secondary)', cursor: 'pointer',
            padding: 4, fontSize: 18, lineHeight: 1, flexShrink: 0,
          }}
        >
          ✕
        </button>
      </div>

      {event.description && (
        <div style={{ fontSize: 13, color: 'var(--text-primary)', lineHeight: 1.5 }}>
          {event.description}
        </div>
      )}

      {/* Actions */}
      <div style={{ display: 'flex', gap: 8 }}>
        <button
          onClick={() => { void handleConfirm() }}
          disabled={confirming}
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
          👍 Still there{event.confirms > 0 ? ` (${event.confirms})` : ''}
        </button>

        <button
          onClick={() => eventStore.selectEvent(null)}
          style={{
            padding: '10px 18px',
            borderRadius: 10,
            background: 'rgba(255,255,255,0.07)',
            border: '1px solid rgba(255,255,255,0.14)',
            color: 'var(--text-secondary)',
            fontSize: 13,
            cursor: 'pointer',
            touchAction: 'manipulation',
          }}
        >
          Close
        </button>
      </div>
    </div>
  )
}

function formatAge(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime()
  const min = Math.floor(ms / 60000)
  if (min < 1)   return 'just now'
  if (min < 60)  return `${min}m ago`
  const hr = Math.floor(min / 60)
  return `${hr}h ago`
}

function formatExpiry(iso: string): string {
  const ms = new Date(iso).getTime() - Date.now()
  if (ms < 0) return 'expired'
  const min = Math.floor(ms / 60000)
  if (min < 60)  return `in ${min}m`
  const hr = Math.round(ms / 3600000)
  return `in ${hr}h`
}
