// ─── Events list panel ───────────────────────────────────────────────────
// Opened by the "СЪБИТИЕ" button in FloatingStatsCard.
// Shows all active events; tap one → opens EventPanel; tap backdrop → closes.

import { useSyncExternalStore } from 'react'
import { eventStore } from './eventStore'
import { EVENT_EMOJI, EVENT_LABELS, EVENT_COLORS } from './types'
import { t } from '@/lib/locale'

function timeAgo(iso: string): string {
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60000)
  if (mins < 1)  return 'преди малко'
  if (mins < 60) return `преди ${mins} мин`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24)  return `преди ${hrs} ч`
  return `преди ${Math.floor(hrs / 24)} д`
}

export function EventsListPanel({ open, onClose }: { open: boolean; onClose: () => void }) {
  const events = useSyncExternalStore(
    eventStore.subscribe.bind(eventStore),
    () => eventStore.getState().events,
    () => [],
  )

  if (!open) return null

  return (
    <div
      style={{
        position:       'fixed',
        inset:          0,
        zIndex:         590,
        background:     'rgba(0,0,0,0.55)',
        display:        'flex',
        alignItems:     'center',
        justifyContent: 'center',
        touchAction:    'manipulation',
      }}
      onClick={onClose}
    >
      <div
        style={{
          background:   'rgba(18,18,26,0.97)',
          borderRadius: 20,
          padding:      '0 0 8px',
          width:        'min(580px, 90vw)',
          maxHeight:    '72vh',
          overflowY:    'auto',
          boxShadow:    '0 8px 48px rgba(0,0,0,0.6)',
          border:       '1px solid rgba(255,255,255,0.1)',
        }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{
          padding:      '16px 20px 14px',
          borderBottom: '1px solid rgba(255,255,255,0.08)',
          display:      'flex',
          alignItems:   'center',
          justifyContent: 'space-between',
        }}>
          <span style={{ fontSize: 17, fontWeight: 700, color: '#fff' }}>
            {t('stats.events')} {events.length > 0 && `(${events.length})`}
          </span>
          <button
            onClick={onClose}
            style={{
              background: 'rgba(255,255,255,0.08)',
              border:     'none',
              borderRadius: 8,
              color:      'rgba(255,255,255,0.6)',
              fontSize:   18,
              width:      32,
              height:     32,
              cursor:     'pointer',
              display:    'flex',
              alignItems: 'center',
              justifyContent: 'center',
              touchAction: 'manipulation',
            }}
            aria-label={t('common.close')}
          >
            ×
          </button>
        </div>

        {/* Empty state */}
        {events.length === 0 && (
          <div style={{ padding: '32px 20px', color: 'rgba(255,255,255,0.4)', textAlign: 'center', fontSize: 15 }}>
            {t('events.noActive')}
          </div>
        )}

        {/* Event rows */}
        {events.map(ev => {
          const desc = ev.description && !ev.description.startsWith('wazesync:')
            ? ev.description : null
          return (
            <div
              key={ev.id}
              onClick={() => { eventStore.selectEvent(ev); onClose() }}
              style={{
                display:     'flex',
                alignItems:  'center',
                gap:         14,
                padding:     '12px 20px',
                cursor:      'pointer',
                borderBottom: '1px solid rgba(255,255,255,0.05)',
                touchAction: 'manipulation',
                transition:  'background 0.1s',
              }}
              onPointerDown={e  => { (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.07)' }}
              onPointerUp={e    => { (e.currentTarget as HTMLElement).style.background = '' }}
              onPointerLeave={e => { (e.currentTarget as HTMLElement).style.background = '' }}
            >
              {/* Coloured circle */}
              <div style={{
                width:          42,
                height:         42,
                borderRadius:   '50%',
                background:     EVENT_COLORS[ev.type] + '28',
                border:         `2px solid ${EVENT_COLORS[ev.type]}`,
                display:        'flex',
                alignItems:     'center',
                justifyContent: 'center',
                fontSize:       20,
                flexShrink:     0,
              }}>
                {EVENT_EMOJI[ev.type]}
              </div>

              {/* Label + description */}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 600, fontSize: 15, color: '#fff' }}>
                  {EVENT_LABELS[ev.type]}
                </div>
                {desc && (
                  <div style={{
                    fontSize:     13,
                    color:        'rgba(255,255,255,0.5)',
                    overflow:     'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace:   'nowrap',
                    marginTop:    2,
                  }}>
                    {desc}
                  </div>
                )}
              </div>

              {/* Time */}
              <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.35)', flexShrink: 0 }}>
                {timeAgo(ev.reportedAt)}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
