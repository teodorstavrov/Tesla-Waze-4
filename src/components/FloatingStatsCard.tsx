// ─── Top-right status card ─────────────────────────────────────────────
// Phase 4: shows live EV station count from evStore.
// GPS accuracy wired via gpsStore.

import { useSyncExternalStore } from 'react'
import { evStore } from '@/features/ev/evStore'
import { gpsStore } from '@/features/gps/gpsStore'

export function FloatingStatsCard() {
  const evState = useSyncExternalStore(
    evStore.subscribe.bind(evStore),
    () => evStore.getState(),
    () => evStore.getState(),
  )

  const gpsPos = useSyncExternalStore(
    gpsStore.onPosition.bind(gpsStore),
    () => gpsStore.getPosition(),
    () => null,
  )

  const stationCount =
    evState.status === 'loading' && evState.stations.length === 0 ? '…'
    : evState.status === 'error'                                   ? '!'
    : evState.stations.length > 0                                  ? String(evState.stations.length)
    :                                                                '—'

  const gpsValue =
    gpsPos == null           ? '—'
    : gpsPos.accuracy < 20   ? `${Math.round(gpsPos.accuracy)}m`
    : gpsPos.accuracy < 100  ? `${Math.round(gpsPos.accuracy)}m`
    :                          `${Math.round(gpsPos.accuracy)}m`

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
        value={stationCount}
        accent={evState.status === 'error' ? '#ef4444' : undefined}
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
