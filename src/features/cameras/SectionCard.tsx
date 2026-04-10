// ─── Active Speed Section Card ─────────────────────────────────────────
//
// Floating card shown while the driver is inside a speed-controlled section.
// Updates once per GPS tick (sectionStore emit) — no polling.
//
// Layout (ActiveView):
//   • Road label + section name
//   • Big avg-speed number (green / orange / red)
//   • Progress bar  ←──────────────→  remaining km
//   • Speed limit badge + elapsed time
//   • Over-limit warning banner
//
// TESLA MODE:
//   Always in DOM, visibility toggled via aria-hidden (no GPU layer churn).
//
// STANDARD:
//   Conditional render + opacity fade.

import { useSyncExternalStore } from 'react'
import { sectionStore } from './sectionEngine'
import { isTeslaBrowser } from '@/lib/browser'
import { t, langStore } from '@/lib/locale'
import { PremiumBadge } from '@/components/PremiumBadge'
import type { SectionSession, SpeedSection } from './sectionTypes'

// ── Card dimensions ────────────────────────────────────────────────────
const CARD_W = 230

export function SectionCard() {
  // Subscribe to lang changes so labels re-render on country switch
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

// ── Inner router ───────────────────────────────────────────────────────

function CardContent({
  session,
  lastExit,
  preWarn,
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

// ── ActiveView ─────────────────────────────────────────────────────────

function ActiveView({ session }: { session: SectionSession }) {
  const { section, avgKmh, enteredAt, distM, warned } = session
  const elapsedS  = Math.round((Date.now() - enteredAt) / 1000)
  const mins      = Math.floor(elapsedS / 60)
  const secs      = elapsedS % 60

  // Round distM to nearest 50m for display — avoids sub-50m jitter
  const displayDistM = Math.round(distM / 50) * 50
  const progress    = Math.min(1, displayDistM / section.lengthM)
  const remainingM  = Math.max(0, section.lengthM - displayDistM)
  const remainingKm = (remainingM / 1000).toFixed(1)

  const ratio     = avgKmh / section.limitKmh
  const overLimit = avgKmh > section.limitKmh
  const avgColor  = overLimit         ? '#ef4444'
                  : ratio > 0.93      ? '#f97316'
                  : '#22c55e'

  // Progress bar fill color mirrors avg speed color
  const barColor  = overLimit ? '#ef4444' : ratio > 0.93 ? '#f97316' : '#3b82f6'

  return (
    <div
      className={isTeslaBrowser ? 'glass tesla-overlay-inner' : 'glass'}
      style={{ padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 8 }}
    >
      {/* ── Road + section label ─────────────────────────────────── */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontSize: 13 }}>📏</span>
          <span style={{
            fontSize: 10, fontWeight: 800, color: 'rgba(255,255,255,0.45)',
            textTransform: 'uppercase', letterSpacing: '0.09em',
          }}>
            {t('sections.label')}
          </span>
          <PremiumBadge feature="average_speed_sections" />
        </div>
        <div style={{ fontSize: 12, fontWeight: 700, color: 'rgba(255,255,255,0.85)', lineHeight: 1.25 }}>
          {section.road}
        </div>
        <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)', lineHeight: 1.3 }}>
          {section.name}
        </div>
      </div>

      {/* ── Big avg speed ────────────────────────────────────────── */}
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 5 }}>
        <span style={{ fontSize: 38, fontWeight: 900, color: avgColor, lineHeight: 1, letterSpacing: '-0.02em' }}>
          {avgKmh > 0 ? avgKmh : '—'}
        </span>
        <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.45)', fontWeight: 500 }}>{t('sections.kmh')}</span>
      </div>

      {/* ── Progress bar ─────────────────────────────────────────── */}
      <div>
        <div style={{
          height: 6, borderRadius: 3,
          background: 'rgba(255,255,255,0.12)',
          overflow: 'hidden',
        }}>
          <div style={{
            height: '100%',
            width:  `${(progress * 100).toFixed(1)}%`,
            background: barColor,
            borderRadius: 3,
            transition: isTeslaBrowser ? undefined : 'width 1s linear',
          }} />
        </div>

        {/* ── km row below bar ─────────────────────────────────── */}
        <div style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          marginTop: 5,
        }}>
          <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)' }}>
            {(displayDistM / 1000).toFixed(1)} {t('routePanel.km')}
          </div>
          <div style={{ fontSize: 12, fontWeight: 700, color: 'rgba(255,255,255,0.75)' }}>
            {remainingKm} {t('routePanel.km')} →
          </div>
        </div>
      </div>

      {/* ── Limit + elapsed ──────────────────────────────────────── */}
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        paddingTop: 2, borderTop: '1px solid rgba(255,255,255,0.08)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
          <div style={{
            width: 28, height: 28, borderRadius: '50%',
            border: '2px solid #ef4444',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 11, fontWeight: 800, color: '#ef4444',
          }}>
            {section.limitKmh}
          </div>
          <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.35)' }}>{t('sections.limit')}</span>
        </div>
        <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)' }}>
          {mins > 0 ? `${mins}${t('routePanel.minAbbr')} ` : ''}{secs}{t('routePanel.secAbbr')}
        </div>
      </div>

      {/* ── Over-limit warning ───────────────────────────────────── */}
      {overLimit && (
        <div style={{
          padding: '5px 8px', borderRadius: 6,
          background: 'rgba(239,68,68,0.18)',
          border: '1px solid rgba(239,68,68,0.45)',
          fontSize: 11, fontWeight: 700, color: '#ef4444',
          textAlign: 'center',
        }}>
          {t('sections.slowDown')}
        </div>
      )}
    </div>
  )
}

// ── PreWarnView ────────────────────────────────────────────────────────

function PreWarnView({ preWarn }: { preWarn: { section: SpeedSection; distM: number } }) {
  const { section, distM } = preWarn
  // Round to nearest 100m to avoid jitter from small GPS fluctuations
  const displayM = Math.round(distM / 100) * 100
  const distKm = displayM >= 1000
    ? `${(displayM / 1000).toFixed(1)} ${t('routePanel.km')}`
    : `${displayM} ${t('routePanel.m')}`

  return (
    <div
      className={isTeslaBrowser ? 'glass tesla-overlay-inner' : 'glass'}
      style={{ padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 8 }}
    >
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <span style={{ fontSize: 15 }}>⚠️</span>
        <span style={{
          fontSize: 10, fontWeight: 800, color: 'rgba(255,255,255,0.45)',
          textTransform: 'uppercase', letterSpacing: '0.09em',
        }}>
          {t('sections.approach')}
        </span>
      </div>

      {/* Road + name */}
      <div>
        <div style={{ fontSize: 12, fontWeight: 700, color: 'rgba(255,255,255,0.85)' }}>
          {section.road}
        </div>
        <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)', marginTop: 2 }}>
          {section.name}
        </div>
      </div>

      {/* Distance + limit row */}
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
        <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
          <div style={{
            width: 26, height: 26, borderRadius: '50%',
            border: '2px solid #ef4444',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 10, fontWeight: 800, color: '#ef4444',
          }}>
            {section.limitKmh}
          </div>
          <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.35)' }}>{t('sections.kmh')}</span>
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
          <span style={{ fontSize: 10, fontWeight: 800, color: 'rgba(255,255,255,0.45)', textTransform: 'uppercase', letterSpacing: '0.09em' }}>
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
        {ok ? t('sections.withinLimit') : `${t('sections.overLimit')} ${limitKmh} ${t('sections.kmh')}`}
      </div>
    </div>
  )
}
