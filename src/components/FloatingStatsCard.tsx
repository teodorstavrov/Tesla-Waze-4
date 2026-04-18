// ─── Top-right status card ─────────────────────────────────────────────
// Phase 4+5: live station count (filtered/total), GPS accuracy.
// Phase 22: live Tesla battery indicator with source label + tap-to-refresh.

import { useSyncExternalStore, useState, useEffect, useCallback } from 'react'
import { evStore } from '@/features/ev/evStore'
import { filterStore } from '@/features/ev/filterStore'
import { gpsStore } from '@/features/gps/gpsStore'
import { eventStore } from '@/features/events/eventStore'
import { audioManager } from '@/features/audio/audioManager'
import { batteryStore } from '@/features/planning/batteryStore'
import { teslaStore } from '@/features/tesla/teslaStore'
import { teslaVehicleStore } from '@/features/tesla/teslaVehicleStore'
import { teslaPoller } from '@/features/tesla/teslaPoller'
import { t, langStore } from '@/lib/locale'

export function FloatingStatsCard() {
  useSyncExternalStore(langStore.subscribe, langStore.getLang, langStore.getLang)

  const { muted } = useSyncExternalStore(
    audioManager.subscribe.bind(audioManager),
    () => audioManager.getState(),
    () => audioManager.getState(),
  )

  // batteryStore — for manual/estimated fallback
  const [batteryState, setBatteryState] = useState(() => batteryStore.getState())
  useEffect(() => batteryStore.subscribe(() => setBatteryState(batteryStore.getState())), [])

  // teslaVehicleStore — direct Tesla snapshot (priority source when connected)
  const [teslaSnap, setTeslaSnap] = useState(() => teslaVehicleStore.getSnapshot())
  useEffect(() => teslaVehicleStore.subscribe(() => setTeslaSnap(teslaVehicleStore.getSnapshot())), [])

  // teslaPoller status (polling / sleeping / error / idle)
  const [pollStatus, setPollStatus] = useState(() => teslaPoller.getStatus())
  useEffect(() => teslaPoller.subscribeStatus(() => setPollStatus(teslaPoller.getStatus())), [])

  const teslaConnected = useSyncExternalStore(
    teslaStore.subscribe,
    () => teslaStore.getState().connected,
    () => false,
  )

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
    : gpsPos.accuracy < 20  ? '#22c55e'
    : gpsPos.accuracy < 50  ? '#eab308'
    : gpsPos.accuracy < 100 ? '#f97316'
    :                          '#ef4444'

  // ── Battery display logic ─────────────────────────────────────────────
  // Priority: 1. Tesla live/cached (non-null) → 2. manual / estimated fallback
  // teslaSnap.batteryPercent is null when car is sleeping with no Redis cache —
  // in that case we must fall through to the manual battery, not show 0%.
  const teslaBattery: number | null =
    teslaConnected && teslaSnap !== null && teslaSnap.batteryPercent !== null
      ? teslaSnap.batteryPercent
      : null
  const manualBattery = batteryState?.currentBatteryPercent ?? null
  const displayLevel: number | null = teslaBattery ?? manualBattery

  // [BATTERY_FIX] diagnostic — fires whenever any battery-relevant value changes
  useEffect(() => {
    console.log('[BATTERY_FIX] final UI teslaBattery:', teslaBattery,
      '| manualBattery:', manualBattery,
      '| displayLevel:', displayLevel,
      '| teslaConnected:', teslaConnected,
      '| snapPct:', teslaSnap?.batteryPercent ?? null,
      '| snapSleeping:', teslaSnap?.sleeping ?? null,
      '| manualSource:', batteryState?.source ?? null)
  }, [teslaBattery, manualBattery, displayLevel, teslaConnected, teslaSnap, batteryState?.source])

  const isSleeping  = teslaConnected && teslaSnap?.sleeping === true && pollStatus === 'sleeping'
  const isPolling   = pollStatus === 'polling'
  const isWaking    = pollStatus === 'waking'
  const hasTeslaData = teslaConnected && teslaBattery !== null && !teslaSnap?.sleeping

  const handleBatteryTap = useCallback(() => {
    if (teslaConnected) void teslaPoller.refresh()
  }, [teslaConnected])

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

      {/* Battery widget — always shown if any level is known */}
      {displayLevel !== null && (
        <BatteryStat
          level={displayLevel}
          isPolling={isPolling}
          isWaking={isWaking}
          isSleeping={isSleeping}
          hasTeslaData={hasTeslaData}
          teslaConnected={teslaConnected}
          fallbackSource={batteryState?.source ?? null}
          onTap={teslaConnected ? handleBatteryTap : undefined}
        />
      )}

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

// ── Battery stat widget ─────────────────────────────────────────────────────

function BatteryStat({
  level,
  isPolling,
  isWaking,
  isSleeping,
  hasTeslaData,
  teslaConnected,
  fallbackSource,
  onTap,
}: {
  level:          number
  isPolling:      boolean
  isWaking:       boolean
  isSleeping:     boolean
  hasTeslaData:   boolean
  teslaConnected: boolean
  fallbackSource: string | null
  onTap?:         () => void
}) {
  const battColor =
    level > 60 ? '#22c55e'
    : level > 20 ? '#eab308'
    :              '#ef4444'

  const bg = getLang() === 'bg'

  const label =
    isWaking    ? (bg ? 'буди…' : 'waking…')
    : isPolling ? 'Tesla…'
    : isSleeping ? (bg ? 'спи ↺' : 'asleep ↺')
    : hasTeslaData ? 'Tesla'
    : teslaConnected
      ? (fallbackSource === 'user_entered' ? t('stats.manual') : '~')
      : (fallbackSource === 'user_entered' ? t('stats.manual')
         : fallbackSource === 'estimated'  ? '~'
         :                                   '—')

  const dimmed    = isPolling || isWaking
  const labelColor =
    hasTeslaData && !dimmed ? '#22c55e'
    : isSleeping             ? '#6b7280'
    : isWaking               ? '#eab308'
    :                          'var(--text-secondary)'

  const inner = (
    <div style={{ textAlign: 'center', minWidth: 40 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 3, justifyContent: 'center' }}>
        <BatteryIcon level={level} color={dimmed ? 'var(--text-secondary)' : battColor} />
        <span style={{
          fontSize: 16, fontWeight: 700,
          color: dimmed ? 'var(--text-secondary)' : battColor,
          lineHeight: 1.2,
        }}>
          {Math.round(level)}%
        </span>
      </div>
      <div style={{
        fontSize: 9,
        color: labelColor,
        letterSpacing: '0.07em',
        textTransform: 'uppercase',
        marginTop: 1,
      }}>
        {label}
      </div>
    </div>
  )

  if (!onTap) return inner

  return (
    <button
      onClick={onTap}
      title={isSleeping ? 'Tap to refresh (will try to wake car)' : 'Tap to refresh'}
      style={{
        background:   'none',
        border:       'none',
        padding:      0,
        cursor:       'pointer',
        touchAction:  'manipulation',
        borderRadius: 6,
      }}
    >
      {inner}
    </button>
  )
}

// ── Battery icon ─────────────────────────────────────────────────────────

function BatteryIcon({ level, color }: { level: number; color: string }) {
  const fillW = Math.round((level / 100) * 10)
  return (
    <svg width="16" height="9" viewBox="0 0 16 9" fill="none" aria-hidden="true">
      <rect x="0.5" y="0.5" width="13" height="8" rx="1.5" stroke={color} strokeWidth="1" />
      <rect x="14" y="3" width="1.5" height="3" rx="0.5" fill={color} />
      <rect x="2" y="2" width={fillW} height="5" rx="0.5" fill={color} />
    </svg>
  )
}

// ── Generic stat ─────────────────────────────────────────────────────────

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

// ── Locale helper ────────────────────────────────────────────────────────

function getLang(): string {
  try {
    const override = localStorage.getItem('teslaradar:lang')
    if (override) return override
  } catch { /* ignore */ }
  return 'bg'
}
