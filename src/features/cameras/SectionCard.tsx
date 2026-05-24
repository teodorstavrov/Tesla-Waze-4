// ─── Active Speed Section Card + Section History Bar ──────────────────
//
// Top-right card — shown while driving through or approaching a section:
//   ActiveView:  [ Current speed ]  [ Limit sign ]  [ Avg speed ]  [ Remaining ]
//   PreWarnView: approach warning with distance + limit
//
// Bottom-right history bar — accumulates all completed sections this session:
//   Collapsed: row of colored pills  [✅ 88] [❌ 147] ...
//   Expanded:  glass card with full detail list

import { useState, useSyncExternalStore } from 'react'
import { sectionStore } from './sectionEngine'
import { gpsStore } from '@/features/gps/gpsStore'
import { isTeslaBrowser } from '@/lib/browser'
import { t, langStore } from '@/lib/locale'
import { PremiumBadge } from '@/components/PremiumBadge'
import type { SectionSession, SpeedSection, SectionExit } from './sectionTypes'

const CARD_W = 320

export function SectionCard() {
  useSyncExternalStore(langStore.subscribe, langStore.getLang, langStore.getLang)

  const { session, lastExit, preWarn, history } = useSyncExternalStore(
    sectionStore.subscribe.bind(sectionStore),
    () => sectionStore.getState(),
    () => sectionStore.getState(),
  )

  const topVisible = Boolean(session ?? preWarn)

  const wrapStyle: React.CSSProperties = {
    position: 'absolute',
    top:      70,
    right:    12,
    zIndex:   450,
    width:    CARD_W,
  }

  const topCard = isTeslaBrowser ? (
    <div aria-hidden={!topVisible} className="tesla-overlay-host" style={wrapStyle}>
      <TopCardContent session={session} preWarn={preWarn} />
    </div>
  ) : topVisible ? (
    <div style={wrapStyle}>
      <TopCardContent session={session} preWarn={preWarn} />
    </div>
  ) : null

  return (
    <>
      {topCard}
      {history.length > 0 && (
        <SectionHistoryBar history={history} lastExitTs={lastExit?.timestamp ?? null} />
      )}
    </>
  )
}

function TopCardContent({
  session, preWarn,
}: {
  session:  SectionSession | null
  preWarn:  { section: SpeedSection; distM: number } | null
}) {
  if (session)  return <ActiveView session={session} />
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

  const avgOverLimit = avgKmh > section.limitKmh
  const avgRatio     = section.limitKmh > 0 ? avgKmh / section.limitKmh : 0
  const avgColor     = avgOverLimit    ? '#ef4444'
                     : avgRatio > 0.93 ? '#f97316'
                     :                   '#22c55e'

  const speedOver  = currentSpeed !== null && currentSpeed > section.limitKmh
  const speedRatio = currentSpeed !== null && section.limitKmh > 0
    ? currentSpeed / section.limitKmh : 0
  const speedColor = currentSpeed === null         ? 'rgba(255,255,255,0.6)'
                   : speedOver                     ? '#ef4444'
                   : speedRatio > 0.93             ? '#f97316'
                   :                                 '#fff'

  const barColor = avgOverLimit ? '#ef4444' : avgRatio > 0.93 ? '#f97316' : '#3b82f6'
  const limitFontSize = section.limitKmh >= 100 ? 15 : 19

  return (
    <div
      className={isTeslaBrowser ? 'glass tesla-overlay-inner' : 'glass'}
      style={{ padding: '10px 16px 10px' }}
    >
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

      <div style={{
        display:        'flex',
        alignItems:     'center',
        justifyContent: 'space-between',
        gap:            4,
      }}>
        <HudCell
          value={currentSpeed !== null ? String(currentSpeed) : '—'}
          valueColor={speedColor}
          label={t('sections.kmh')}
        />

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

        <HudCell
          value={avgKmh > 0 ? String(avgKmh) : '—'}
          valueColor={avgColor}
          label={t('sections.avg')}
        />

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

// ── SectionHistoryBar — bottom-right, accumulates all exits ───────────

function SectionHistoryBar({
  history,
  lastExitTs,
}: {
  history:    SectionExit[]
  lastExitTs: number | null
}) {
  const [expanded, setExpanded] = useState(false)

  const reversed = [...history].reverse()

  if (!expanded) {
    return (
      // eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions
      <div
        onClick={() => setExpanded(true)}
        style={{
          position:   'absolute',
          bottom:     80,
          right:      12,
          zIndex:     440,
          display:    'flex',
          gap:        5,
          flexDirection: 'row-reverse',
          maxWidth:   'calc(100vw - 24px)',
          flexWrap:   'nowrap',
          overflow:   'hidden',
          cursor:     'pointer',
          touchAction: 'manipulation',
        }}
      >
        {reversed.map((exit) => {
          const ok        = exit.avgKmh <= exit.limitKmh
          const isNew     = exit.timestamp === lastExitTs
          const background = ok ? 'rgba(34,197,94,0.18)'   : 'rgba(239,68,68,0.18)'
          const border    = ok ? 'rgba(34,197,94,0.55)'   : 'rgba(239,68,68,0.55)'
          const textColor = ok ? '#4ade80' : '#f87171'
          return (
            <div
              key={exit.timestamp}
              style={{
                background,
                border:       `1px solid ${border}`,
                borderRadius: 20,
                padding:      '5px 11px',
                fontSize:     13,
                fontWeight:   700,
                color:        textColor,
                display:      'flex',
                alignItems:   'center',
                gap:          4,
                flexShrink:   0,
                boxShadow:    isNew
                  ? `0 0 10px ${ok ? 'rgba(34,197,94,0.55)' : 'rgba(239,68,68,0.55)'}`
                  : 'none',
                fontVariantNumeric: 'tabular-nums',
              }}
            >
              <span>{ok ? '✅' : '❌'}</span>
              <span style={{ fontVariantNumeric: 'tabular-nums' }}>{exit.avgKmh}</span>
            </div>
          )
        })}
      </div>
    )
  }

  // ── Expanded panel ─────────────────────────────────────────────────
  return (
    <div
      className={isTeslaBrowser ? 'glass tesla-overlay-inner' : 'glass'}
      style={{
        position:  'absolute',
        bottom:    80,
        right:     12,
        zIndex:    440,
        width:     CARD_W,
        maxHeight: 380,
        display:   'flex',
        flexDirection: 'column',
      }}
    >
      {/* Header */}
      <div style={{
        display:        'flex',
        alignItems:     'center',
        justifyContent: 'space-between',
        padding:        '10px 14px 8px',
        borderBottom:   '1px solid rgba(255,255,255,0.08)',
        flexShrink:     0,
      }}>
        <span style={{
          fontSize: 11, fontWeight: 800,
          color: 'rgba(255,255,255,0.45)',
          textTransform: 'uppercase', letterSpacing: '0.09em',
        }}>
          {history.length} {t('sections.history')}
        </span>
        <button
          onClick={() => setExpanded(false)}
          style={{
            background: 'rgba(255,255,255,0.1)',
            border:     '1px solid rgba(255,255,255,0.18)',
            borderRadius: 6,
            color:      'rgba(255,255,255,0.6)',
            fontSize:   13,
            fontWeight: 700,
            padding:    '3px 9px',
            cursor:     'pointer',
            touchAction: 'manipulation',
          }}
        >
          ✕
        </button>
      </div>

      {/* Scrollable list */}
      <div style={{ overflowY: 'auto', padding: '6px 14px 12px' }}>
        {reversed.map((exit) => {
          const ok    = exit.avgKmh <= exit.limitKmh
          const color = ok ? '#22c55e' : '#ef4444'
          return (
            <div
              key={exit.timestamp}
              style={{
                paddingTop:   10,
                marginTop:    10,
                borderTop:    '1px solid rgba(255,255,255,0.07)',
              }}
            >
              <div style={{
                fontSize: 10, color: 'rgba(255,255,255,0.4)',
                marginBottom: 5, letterSpacing: '0.05em',
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              }}>
                {exit.section.road} · {exit.section.name}
              </div>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
                <span style={{
                  fontSize: 30, fontWeight: 900, color, lineHeight: 1,
                  fontVariantNumeric: 'tabular-nums', letterSpacing: '-0.02em',
                }}>
                  {exit.avgKmh}
                </span>
                <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)' }}>
                  {t('sections.kmh')}
                </span>
                <span style={{
                  marginLeft: 6, fontSize: 12, fontWeight: 600,
                  color: ok ? '#4ade80' : '#f87171',
                }}>
                  {ok
                    ? t('sections.withinLimit')
                    : `${t('sections.overLimit')} ${exit.limitKmh} ${t('sections.kmh')}`}
                </span>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
