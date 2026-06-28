// ─── Trip Summary Banner ─────────────────────────────────────────────────
// Shown in bottom-right during active navigation (mode === 'navigating').
// Displays: ETA time · remaining time · remaining km · est. battery at arrival.

import { useSyncExternalStore, useState, useEffect } from 'react'
import { routeStore } from '@/features/route/routeStore'
import { batteryStore } from '@/features/planning/batteryStore'
import { vehicleProfileStore } from '@/features/planning/store'
import { estimateArrivalBattery } from '@/features/planning/estimator'
import { gpsStore } from '@/features/gps/gpsStore'
import { isPhone } from '@/lib/browser'

function pad(n: number): string { return n.toString().padStart(2, '0') }
function fmtTime(date: Date): string { return `${pad(date.getHours())}:${pad(date.getMinutes())}` }

function fmtDuration(totalSeconds: number): string {
  const h = Math.floor(totalSeconds / 3600)
  const m = Math.floor((totalSeconds % 3600) / 60)
  if (h > 0) return `${h}ч ${pad(m)}м`
  return `${m} мин`
}

function batteryColor(pct: number): string {
  if (pct <= 10) return '#ef4444'
  if (pct <= 20) return '#f97316'
  if (pct <= 40) return '#eab308'
  return '#4ade80'
}

export function TripSummaryBanner({ onClick }: { onClick?: () => void } = {}) {
  const routeState = useSyncExternalStore(routeStore.subscribe, routeStore.getState, routeStore.getState)
  const battery    = useSyncExternalStore(batteryStore.subscribe, batteryStore.getState, batteryStore.getState)

  // Re-render every minute to keep ETA current even without GPS movement
  const [, setTick] = useState(0)
  useEffect(() => {
    const id = setInterval(() => setTick(t => t + 1), 60_000)
    return () => clearInterval(id)
  }, [])

  const { mode, route, remainingM, arrived } = routeState
  if (mode !== 'navigating' || !route || arrived || remainingM == null) return null

  // ── Remaining time (proportional to distance) ───────────────────────
  const remainingRatio  = route.distanceM > 0 ? remainingM / route.distanceM : 0
  const remainingSec    = Math.round(route.durationS * remainingRatio)
  const remainingKm     = remainingM / 1000

  // ── ETA ──────────────────────────────────────────────────────────────
  const etaDate = new Date(Date.now() + remainingSec * 1000)
  const etaTime = fmtTime(etaDate)

  // ── Battery at arrival ────────────────────────────────────────────────
  let arrivalPct: number | null = null
  const profile = vehicleProfileStore.get()
  if (profile && battery) {
    const gps       = gpsStore.getPosition()
    const liveProfile = { ...profile, currentBatteryPercent: battery.currentBatteryPercent }
    const result = estimateArrivalBattery({
      profile:     liveProfile,
      distanceKm:  remainingKm,
      speedKmh:    gps?.speedKmh ?? null,
    })
    arrivalPct = result.arrivalBatteryPercent
  }

  const kmLabel  = remainingKm < 10
    ? remainingKm.toFixed(1)
    : Math.round(remainingKm).toString()

  const interactive = !!onClick
  const cols = arrivalPct != null ? 4 : 3

  // ── Position ────────────────────────────────────────────────────────
  // Mobile: full-width strip above the BottomDock (bottom:24 + ~70px height + 8px gap = 102px)
  // Desktop/Tesla: match old SHOW pill position (left quarter of screen, bottom:24)
  const posStyle: React.CSSProperties = isPhone
    ? { bottom: 104, left: 12, right: 12 }
    : interactive
      ? { bottom: 24, left: 'calc(25% - 40px)', transform: 'translateX(-50%)' }
      : { bottom: 30, right: 12, transform: 'translateZ(0)' }

  return (
    <div
      role={interactive ? 'button' : undefined}
      onClick={onClick}
      style={{
        position:            'absolute',
        ...posStyle,
        zIndex:              500,
        userSelect:          'none',
        WebkitUserSelect:    'none',
        pointerEvents:       interactive ? 'auto' : 'none',
        cursor:              interactive ? 'pointer' : 'default',
        touchAction:         interactive ? 'manipulation' : undefined,
        background:          'rgba(0,0,0,0.55)',
        borderRadius:        10,
        padding:             '7px 13px',
        display:             'grid',
        gridTemplateColumns: isPhone ? `repeat(${cols}, 1fr)` : '1fr 1fr',
        gap:                 isPhone ? '4px 10px' : '4px 16px',
        minWidth:            isPhone ? undefined : 160,
        backdropFilter:      'blur(6px)',
        WebkitBackdropFilter: 'blur(6px)',
        border:              interactive
          ? '1px solid rgba(255,255,255,0.22)'
          : '1px solid rgba(255,255,255,0.08)',
      }}
    >
      <StatRow icon="🕐" value={etaTime}                    label="пристигане" />
      <StatRow icon="⏱"  value={fmtDuration(remainingSec)} label="оставащо" />
      <StatRow icon="📍" value={`${kmLabel} км`}            label="разстояние" />
      {arrivalPct != null && (
        <StatRow icon="🔋" value={`~${arrivalPct}%`} label="батерия" accent={batteryColor(arrivalPct)} />
      )}
    </div>
  )
}

function StatRow({
  icon, value, label, accent,
}: { icon: string; value: string; label: string; accent?: string }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
        <span style={{ fontSize: 12, lineHeight: 1 }}>{icon}</span>
        <span style={{
          fontSize:           16,
          fontWeight:         700,
          color:              accent ?? '#ffffff',
          fontVariantNumeric: 'tabular-nums',
          fontFamily:         'system-ui, sans-serif',
          lineHeight:         1.2,
          letterSpacing:      '0.02em',
        }}>
          {value}
        </span>
      </div>
      <span style={{
        fontSize:      10,
        color:         'rgba(255,255,255,0.45)',
        textTransform: 'uppercase',
        letterSpacing: '0.07em',
        marginTop:     1,
      }}>
        {label}
      </span>
    </div>
  )
}
