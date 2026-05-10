// ─── Active Speed Section Card ─────────────────────────────────────────
//
// Floating HUD shown while the driver is inside a speed-controlled section.
//
// ActiveView layout (horizontal):
//   [ Current speed ]  [ Limit sign ]  [ Avg speed ]  [ Remaining ]
//        km/h             circle            AVG             km / REM
//
// TESLA MODE:
//   Always in DOM, visibility toggled via aria-hidden (no GPU layer churn).

import { useSyncExternalStore } from 'react'
import { sectionStore } from './sectionEngine'
import { gpsStore } from '@/features/gps/gpsStore'
import { isTeslaBrowser } from '@/lib/browser'
import { t, langStore } from '@/lib/locale'
import { PremiumBadge } from '@/components/PremiumBadge'
import type { SectionSession, SpeedSection } from './sectionTypes'

const CARD_W = 320

export function SectionCard() {
  useSyncExternalStore(langStore.subscribe, langStore.getLang, langStore.getLang)

  const { session, lastExit, preWarn } = useSyncExternalStore(
    sectionStore.subscribe.bind(sectionStore),
    () => sectionStore.getState(),
    () => sectionStore.getState(),
  )

  const visible = Boolean(session ?? lastExit ?? preWarn)

  const wrapStyle: React.CSSProperties = {
    position: 'absolute',
    top:      70,
    right:    12,
    zIndex:   450,
    width:    CARD_W,
  }

  if (isTeslaBrowser) {
    return (
      <div aria-hidden={!visible} className="tesla-overlay-host" style={wrapStyle}>
        <CardContent session={session} lastExit={lastExit} preWarn={preWarn} />
      </div>
    )
  }

  if (!visible) return null
  return (
    <div style={{ ...wrapStyle, opacity: visible ? 1 : 0, transition: 'opacity 0.2s ease-out' }}>
      <CardContent session={session} lastExit={lastExit} preWarn={preWarn} />
    </div>
  )
}

function CardContent({
  session, lastExit, preWarn,
}: {
  session:  SectionSession | null
  lastExit: { section: SpeedSection; avgKmh: number; limitKmh: number } | null
  preWarn:  { section: SpeedSection; distM: number } | null
}) {
  if (session)  return <ActiveView session={session} />
  if (lastExit) return <ExitView   lastExit={lastExit} />
  if (preWarn)  return <PreWarnView preWarn={preWarn} />
  return null
}

// ── ActiveView — horizontal HUD ────────────────────────────────────────

function ActiveView({ session }: { session: SectionSession }) {
  const pos = useSyncExternalStore(
    gpsStore.onPosition.bind(gpsStore),
    () => gpsStore.getPosition(),
    () => null,
  )

  const { section, avgKmh, distM } = session
  const currentSpeed = pos?.speedKmh ?? null

  const remainingM  = Math.max(0, section.lengthM - Math.min(distM, section.lengthM))
  const remainingKm = (remainingM / 1000).toFixed(1)
  const progress    = Math.min(1, distM / section.lengthM)

  // Avg speed color
  const avgOverLimit = avgKmh > section.limitKmh
  const avgRatio     = section.limitKmh > 0 ? avgKmh / section.limitKmh : 0
  const avgColor     = avgOverLimit    ? '#ef4444'
                     : avgRatio > 0.93 ? '#f97316'
                     :                   '#22c55e'

  // Current speed color
  const speedOver  = currentSpeed !== null && currentSpeed > section.limitKmh
  const speedRatio = currentSpeed !== null && section.limitKmh > 0
    ? currentSpeed / section.limitKmh : 0
  const speedColor = currentSpeed === null         ? 'rgba(255,255,255,0.6)'
                   : speedOver                     ? '#ef4444'
                   : speedRatio > 0.93             ? '#f97316'
                   :                                 '#fff'

  const barColor = avgOverLimit ? '#ef4444' : avgRatio > 0.93 ? '#f97316' : '#3b82f6'

  // Smaller font for 3-digit limits (100, 110, 120, 130, 140)
  const limitFontSize = section.limitKmh >= 100 ? 15 : 19

  return (
    <div
      className={isTeslaBrowser ? 'glass tesla-overlay-inner' : 'glass'}
      style={{ padding: '10px 16px 10px' }}
    >
      {/* ── Road label ─────────────────────────────────────────── */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 5, marginBottom: 10,
      }}>
        <span style={{
          fontSize: 10, fontWeight: 700,
          color: 'rgba(255,255,255,0.35)',
          textTransform: 'uppercase', letterSpacing: '0.08em',
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>
          {section.road} · {section.name}
        </span>
        <PremiumBadge feature="average_speed_sections" />
      </div>

      {/* ── HUD row ────────────────────────────────────────────── */}
      <div style={{
        display:        'flex',
        alignItems:     'center',
        justifyContent: 'space-between',
        gap:            4,
      }}>

        {/* 1. Current speed */}
        <HudCell
          value={currentSpeed !== null ? String(currentSpeed) : '—'}
          valueColor={speedColor}
          label={t('sections.kmh')}
        />

        {/* 2. Speed limit sign */}
        <div style={{
          width:          60,
          height:         60,
          borderRadius:   '50%',
          background:     '#ffffff',
          border:         '5px solid #dc2626',
          display:        'flex',
          alignItems:     'center',
          justifyContent: 'center',
          flexShrink:     0,
        }}>
          <span style={{
            fontSize:           limitFontSize,
            fontWeight:         900,
            color:              '#111',
            lineHeight:         1,
            fontVariantNumeric: 'tabular-nums',
          }}>
            {section.limitKmh}
          </span>
        </div>

        {/* 3. Avg speed */}
        <HudCell
          value={avgKmh > 0 ? String(avgKmh) : '—'}
          valueColor={avgColor}
          label={t('sections.avg')}
        />

        {/* 4. Remaining km */}
        <div style={{ textAlign: 'center', minWidth: 52 }}>
          <div style={{
            fontSize:           26,
            fontWeight:         800,
            lineHeight:         1,
            color:              '#fff',
            fontVariantNumeric: 'tabular-nums',
          }}>
            {remainingKm}
          </div>
          <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)', marginTop: 2 }}>
            {t('routePanel.km')}
          </div>
          <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.25)', marginTop: 1, letterSpacing: '0.06em' }}>
            {t('sections.rem')}
          </div>
        </div>
      </div>

      {/* ── Progress bar ───────────────────────────────────────── */}
      <div style={{
        marginTop:    10,
        height:       4,
        borderRadius: 2,
        background:   'rgba(255,255,255,0.1)',
        overflow:     'hidden',
      }}>
        <div style={{
          height:       '100%',
          width:        `${(progress * 100).toFixed(1)}%`,
          background:   barColor,
          borderRadius: 2,
        }} />
      </div>
    </div>
  )
}

function HudCell({ value, valueColor, label }: {
  value:      string
  valueColor: string
  label:      string
}) {
  return (
    <div style={{ textAlign: 'center', minWidth: 64 }}>
      <div style={{
        fontSize:           40,
        fontWeight:         900,
        lineHeight:         1,
        letterSpacing:      '-0.02em',
        color:              valueColor,
        fontVariantNumeric: 'tabular-nums',
      }}>
        {value}
      </div>
      <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)', marginTop: 2, letterSpacing: '0.06em' }}>
        {label}
      </div>
    </div>
  )
}

// ── PreWarnView ────────────────────────────────────────────────────────

function PreWarnView({ preWarn }: { preWarn: { section: SpeedSection; distM: number } }) {
  const { section, distM } = preWarn
  const displayM = Math.round(distM / 100) * 100
  const distKm = displayM >= 1000
    ? `${(displayM / 1000).toFixed(1)} ${t('routePanel.km')}`
    : `${displayM} ${t('routePanel.m')}`

  return (
    <div
      className={isTeslaBrowser ? 'glass tesla-overlay-inner' : 'glass'}
      style={{ padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 8 }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <span style={{ fontSize: 15 }}>⚠️</span>
        <span style={{
          fontSize: 10, fontWeight: 800, color: 'rgba(255,255,255,0.45)',
          textTransform: 'uppercase', letterSpacing: '0.09em',
        }}>
          {t('sections.approach')}
        </span>
      </div>

      <div>
        <div style={{ fontSize: 12, fontWeight: 700, color: 'rgba(255,255,255,0.85)' }}>
          {section.road}
        </div>
        <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)', marginTop: 2 }}>
          {section.name}
        </div>
      </div>

      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        paddingTop: 6, borderTop: '1px solid rgba(255,255,255,0.08)',
      }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}>
          <span style={{ fontSize: 22, fontWeight: 800, color: '#f97316', lineHeight: 1 }}>
            {distKm}
          </span>
          <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)' }}>{t('sections.ahead')}</span>
        </div>
        <div style={{
          width: 34, height: 34, borderRadius: '50%',
          background: '#fff', border: '4px solid #dc2626',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: section.limitKmh >= 100 ? 11 : 13,
          fontWeight: 900, color: '#111',
        }}>
          {section.limitKmh}
        </div>
      </div>
    </div>
  )
}

// ── ExitView ───────────────────────────────────────────────────────────

function ExitView({ lastExit }: { lastExit: { section: SpeedSection; avgKmh: number; limitKmh: number } }) {
  const { section, avgKmh, limitKmh } = lastExit
  const ok    = avgKmh <= limitKmh
  const color = ok ? '#22c55e' : '#ef4444'

  return (
    <div
      className={isTeslaBrowser ? 'glass tesla-overlay-inner' : 'glass'}
      style={{ padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 6 }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <span style={{ fontSize: 16 }}>{ok ? '✅' : '🚨'}</span>
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <span style={{
            fontSize: 10, fontWeight: 800, color: 'rgba(255,255,255,0.45)',
            textTransform: 'uppercase', letterSpacing: '0.09em',
          }}>
            {t('sections.exit')}
          </span>
          <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)' }}>{section.road}</span>
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'baseline', gap: 5 }}>
        <span style={{ fontSize: 38, fontWeight: 900, color, lineHeight: 1, letterSpacing: '-0.02em' }}>
          {avgKmh}
        </span>
        <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.45)' }}>{t('sections.kmh')}</span>
      </div>

      <div style={{ fontSize: 12, fontWeight: 600, color: ok ? '#4ade80' : '#f87171' }}>
        {ok
          ? t('sections.withinLimit')
          : `${t('sections.overLimit')} ${limitKmh} ${t('sections.kmh')}`}
      </div>
    </div>
  )
}
