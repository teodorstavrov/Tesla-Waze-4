// ─── Top-right status card ─────────────────────────────────────────────
// Phase 4+5: live station count (filtered/total), GPS accuracy.

import { useSyncExternalStore } from 'react'
import { evStore } from '@/features/ev/evStore'
import { filterStore } from '@/features/ev/filterStore'
import { gpsStore } from '@/features/gps/gpsStore'

export function FloatingStatsCard() {
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
    gpsPos == null ? '—' : `${Math.round(gpsPos.accuracy)}m`

  return (
    <div
      className="glass"
      style={{
        position: 'absolute',
        top: 12,
        right: 12,
        zIndex: 400,
        padding: '8px 16px',
        display: 'flex',
        alignItems: 'center',
        gap: 18,
        userSelect: 'none',
        WebkitUserSelect: 'none',
      }}
    >
      <Stat
        label="Stations"
        value={stationValue}
        accent={evState.status === 'error' ? '#ef4444' : filtersActive ? '#e31937' : undefined}
        title={evState.error ?? undefined}
      />
      <Stat label="Events" value="—" />
      <Stat label="GPS" value={gpsValue} />
    </div>
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
