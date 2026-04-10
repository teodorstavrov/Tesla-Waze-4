// ─── Top-right status card ─────────────────────────────────────────────
// Phase 4+5: live station count (filtered/total), GPS accuracy.

import { useSyncExternalStore, useState, useEffect } from 'react'
import { evStore } from '@/features/ev/evStore'
import { filterStore } from '@/features/ev/filterStore'
import { gpsStore } from '@/features/gps/gpsStore'
import { eventStore } from '@/features/events/eventStore'
import { audioManager } from '@/features/audio/audioManager'
import { batteryStore } from '@/features/planning/batteryStore'
import { t, langStore } from '@/lib/locale'

export function FloatingStatsCard() {
  // Subscribe to lang changes so labels re-render when country is switched
  useSyncExternalStore(langStore.subscribe, langStore.getLang, langStore.getLang)

  const { muted } = useSyncExternalStore(
    audioManager.subscribe.bind(audioManager),
    () => audioManager.getState(),
    () => audioManager.getState(),
  )

  const [batteryState, setBatteryState] = useState(() => batteryStore.getState())
  useEffect(() => batteryStore.subscribe(() => setBatteryState(batteryStore.getState())), [])

  const batteryLevel      = batteryState?.currentBatteryPercent ?? null
  const batteryIsEstimate = batteryState?.source === 'estimated'

  const evState = useSyncExternalStore(
    evStore.subscribe.bind(evStore),
    () => evStore.getState(),
    () => evStore.getState(),
  )

  const filtersActive = useSyncExternalStore(
    filterStore.subscribe.bind(filterStore),
    () => filterStore.isActive(),
    () => false,
  )

  const filteredCount = useSyncExternalStore(
    filterStore.subscribe.bind(filterStore),
    () => filterStore.getFilteredStations().length,
    () => 0,
  )

  const eventCount = useSyncExternalStore(
    eventStore.subscribe.bind(eventStore),
    () => eventStore.getState().events.length,
    () => 0,
  )

  const gpsPos = useSyncExternalStore(
    gpsStore.onPosition.bind(gpsStore),
    () => gpsStore.getPosition(),
    () => null,
  )

  const totalCount = evState.stations.length

  const stationValue =
    evState.status === 'loading' && totalCount === 0 ? '…'
    : evState.status === 'error'                      ? '!'
    : totalCount === 0                                ? '—'
    : filtersActive                                   ? `${filteredCount}/${totalCount}`
    :                                                   String(totalCount)

  const gpsValue =
    gpsPos == null ? '—' : `${Math.round(gpsPos.accuracy)}${t('routePanel.m')}`

  const gpsAccent =
    gpsPos == null          ? undefined
    : gpsPos.accuracy < 20  ? '#22c55e'   // green — excellent
    : gpsPos.accuracy < 50  ? '#eab308'   // yellow — good
    : gpsPos.accuracy < 100 ? '#f97316'   // orange — poor
    :                          '#ef4444'  // red — very poor

  return (
    <div
      className="glass"
      style={{
        position: 'absolute',
        top: 12,
        right: 12,
        zIndex: 400,
        padding: '8px clamp(10px, 3vw, 16px)',
        display: 'flex',
        alignItems: 'center',
        gap: 'clamp(10px, 3vw, 18px)',
        userSelect: 'none',
        WebkitUserSelect: 'none',
      }}
    >
      <button
        onClick={() => audioManager.toggleMute()}
        aria-label={muted ? t('stats.muteOn') : t('stats.muteOff')}
        title={muted ? t('stats.muteOn') : t('stats.muteOff')}
        style={{
          background: 'none',
          border: 'none',
          padding: 4,
          cursor: 'pointer',
          color: muted ? '#ef4444' : 'var(--text-secondary)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          touchAction: 'manipulation',
          borderRadius: 6,
          marginRight: 2,
        }}
      >
        {muted
          ? <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><line x1="23" y1="9" x2="17" y2="15"/><line x1="17" y1="9" x2="23" y2="15"/></svg>
          : <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/></svg>
        }
      </button>
      <Stat
        label={t('stats.stations')}
        value={stationValue}
        accent={evState.status === 'error' ? '#ef4444' : filtersActive ? '#e31937' : undefined}
        title={evState.error ?? undefined}
      />
      <Stat label={t('stats.events')} value={eventCount > 0 ? String(eventCount) : '—'} />
      <Stat label={t('stats.gps')} value={gpsValue} accent={gpsAccent} />
    </div>
  )
}

function BatteryIcon({ level, color }: { level: number; color: string }) {
  // fill width: 0–100% mapped to 0–10px inner bar
  const fillW = Math.round((level / 100) * 10)
  return (
    <svg width="16" height="9" viewBox="0 0 16 9" fill="none" aria-hidden="true">
      {/* body */}
      <rect x="0.5" y="0.5" width="13" height="8" rx="1.5" stroke={color} strokeWidth="1" />
      {/* tip */}
      <rect x="14" y="3" width="1.5" height="3" rx="0.5" fill={color} />
      {/* fill */}
      <rect x="2" y="2" width={fillW} height="5" rx="0.5" fill={color} />
    </svg>
  )
}

function Stat({
  label, value, accent, title,
}: {
  label: string
  value: string
  accent?: string
  title?: string
}) {
  return (
    <div style={{ textAlign: 'center', minWidth: 34 }} title={title}>
      <div style={{
        fontSize: 16, fontWeight: 700,
        color: accent ?? 'var(--text-primary)',
        lineHeight: 1.2,
      }}>
        {value}
      </div>
      <div style={{
        fontSize: 9, color: 'var(--text-secondary)',
        letterSpacing: '0.07em', textTransform: 'uppercase', marginTop: 1,
      }}>
        {label}
      </div>
    </div>
  )
}
