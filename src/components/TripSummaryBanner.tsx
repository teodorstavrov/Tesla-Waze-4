// ─── Trip Summary Banner ─────────────────────────────────────────────────
// Shown in bottom-right during active navigation (mode === 'navigating').
// Displays: ETA time · remaining time · remaining km · est. battery at arrival.

import { useSyncExternalStore, useState, useEffect } from 'react'
import { routeStore } from '@/features/route/routeStore'
import { batteryStore } from '@/features/planning/batteryStore'
import { vehicleProfileStore } from '@/features/planning/store'
import { estimateArrivalBattery } from '@/features/planning/estimator'
import { gpsStore } from '@/features/gps/gpsStore'
import { isPhone, isTeslaBrowser } from '@/lib/browser'
import { t, getLang, langStore } from '@/lib/locale'

function pad(n: number): string { return n.toString().padStart(2, '0') }
function fmtTime(date: Date): string { return `${pad(date.getHours())}:${pad(date.getMinutes())}` }

function fmtDuration(totalSeconds: number): string {
  const h = Math.floor(totalSeconds / 3600)
  const m = Math.floor((totalSeconds % 3600) / 60)
  if (h > 0) return `${h}${t('routePanel.hours')} ${pad(m)}${t('routePanel.mins')}`
  return `${m} ${t('routePanel.mins')}`
}

function batteryColor(pct: number): string {
  if (pct <= 10) return '#ef4444'
  if (pct <= 20) return '#f97316'
  if (pct <= 40) return '#eab308'
  return '#4ade80'
}

export function TripSummaryBanner({ onClick }: { onClick?: () => void } = {}) {
  useSyncExternalStore(langStore.subscribe.bind(langStore), getLang, getLang)
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
      ? { bottom: 24, left: isTeslaBrowser ? '25%' : 'calc(25% - 40px)', transform: 'translateX(-50%)' }
      : { bottom: 30, right: 12, transform: 'translateZ(0)' }

  const completedPct = route.distanceM > 0 ? (1 - remainingRatio) * 100 : 0

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
        overflow:            'hidden',
        padding:             'clamp(5px, 1vh, 7px) clamp(9px, 1.8vh, 13px)',
        paddingBottom:       'clamp(8px, 1.4vh, 11px)',
        display:             'flex',
        flexDirection:       'column',
        gap:                 0,
        minWidth:            isPhone ? undefined : 160,
        backdropFilter:      'blur(6px)',
        WebkitBackdropFilter: 'blur(6px)',
        border:              interactive
          ? '1px solid rgba(255,255,255,0.22)'
          : '1px solid rgba(255,255,255,0.08)',
      }}
    >
      {/* Stats grid */}
      <div style={{
        display:             'grid',
        gridTemplateColumns: isPhone ? `repeat(${cols}, 1fr)` : '1fr 1fr',
        gap:                 isPhone ? '4px 10px' : '4px 16px',
      }}>
        <StatRow icon="🕐" value={etaTime}                    label={t('route.arrival')} />
        <StatRow icon="⏱"  value={fmtDuration(remainingSec)} label={t('route.remaining')} />
        <StatRow icon="📍" value={`${kmLabel} ${t('routePanel.km')}`} label={t('route.distance')} />
        {arrivalPct != null && (
          <StatRow icon="🔋" value={`~${arrivalPct}%`} label={t('route.battery')} accent={batteryColor(arrivalPct)} />
        )}
      </div>

      {/* Progress bar — full-bleed at bottom */}
      <div style={{
        marginTop:    'clamp(5px, 1vh, 7px)',
        marginLeft:   'calc(-1 * clamp(9px, 1.8vh, 13px))',
        marginRight:  'calc(-1 * clamp(9px, 1.8vh, 13px))',
        marginBottom: 'calc(-1 * clamp(8px, 1.4vh, 11px))',
        height:       11,
        position:     'relative',
      }}>
        {/* Track */}
        <div style={{
          position:   'absolute',
          bottom:     0, left: 0, right: 0,
          height:     4,
          background: 'rgba(255,255,255,0.10)',
        }} />
        {/* Fill */}
        <div style={{
          position:   'absolute',
          bottom:     0, left: 0,
          right:      `${100 - completedPct}%`,
          height:     4,
          background: 'linear-gradient(90deg, #3b82f6, #22c55e)',
          transition: 'right 1s linear',
        }} />
        {/* Arrow avatar */}
        <div style={{
          position:   'absolute',
          bottom:     0,
          left:       `clamp(4%, ${completedPct}%, 97%)`,
          transform:  'translateX(-50%)',
          transition: 'left 1s linear',
          lineHeight: 0,
          filter:     'drop-shadow(0 0 3px rgba(0,0,0,0.9))',
        }}>
          <svg width="11" height="11" viewBox="0 0 11 11" fill="none" aria-hidden="true">
            <polygon points="1,1 10,5.5 1,10" fill="white" />
          </svg>
        </div>
      </div>
    </div>
  )
}

function StatRow({
  icon, value, label, accent,
}: { icon: string; value: string; label: string; accent?: string }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
        <span style={{ fontSize: 'clamp(9px, 1.3vh, 12px)', lineHeight: 1 }}>{icon}</span>
        <span style={{
          fontSize:           'clamp(12px, 2vh, 16px)' as string,
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
