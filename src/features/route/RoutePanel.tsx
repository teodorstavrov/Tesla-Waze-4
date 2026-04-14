// ─── Route Panel ───────────────────────────────────────────────────────
// Shows active route info: remaining distance, ETA, arrival time.
// Live-updates remaining distance as GPS moves along the route.
// Shows Reroute button when GPS deviates > 200m from the route.
// Alternative route pills for switching between OSRM alternatives.
// Phase 26: expandable list of EV stations along the route.

import { useMemo, useState, useEffect } from 'react'
import { useSyncExternalStore } from 'react'
import { routeStore } from './routeStore.js'
import { evStore } from '@/features/ev/evStore'
import { followStore } from '@/features/follow/followStore'
import { gpsStore } from '@/features/gps/gpsStore'
import { getMap } from '@/components/MapShell'
import { isTeslaBrowser } from '@/lib/browser'
import { t, getLang, langStore } from '@/lib/locale'
import { findStationsAlongRoute, stationDotColor } from './routeStations.js'
import type { NormalizedStation } from '@/features/ev/types'
import { vehicleProfileStore } from '@/features/planning/store'
import { batteryStore } from '@/features/planning/batteryStore'
import { estimateArrivalBattery } from '@/features/planning/estimator'
import { PremiumBadge } from '@/components/PremiumBadge'

export function RoutePanel() {
  // Re-render on country/language change
  useSyncExternalStore(langStore.subscribe.bind(langStore), getLang, getLang)

  const { route, routes, activeRouteIndex, destination, status, mode, error, deviated, remainingM } =
    useSyncExternalStore(
      routeStore.subscribe.bind(routeStore),
      () => routeStore.getState(),
      () => routeStore.getState(),
    )

  const [stations, setStations] = useState(() => evStore.getState().stations)
  useEffect(() => evStore.subscribe(() => setStations(evStore.getState().stations)), [])

  const [showStations, setShowStations] = useState(false)
  const [dismissed, setDismissed] = useState(false)

  // Battery arrival estimate — uses live battery session state (not just profile)
  const [vehicleProfile, setVehicleProfile] = useState(() => vehicleProfileStore.get())
  useEffect(() => vehicleProfileStore.subscribe(() => setVehicleProfile(vehicleProfileStore.get())), [])

  const [batterySession, setBatterySession] = useState(() => batteryStore.getState())
  useEffect(() => batteryStore.subscribe(() => setBatterySession(batteryStore.getState())), [])

  // Reset dismissed only when the destination changes (new route by the user).
  // Do NOT reset on status changes — rerouting (which also changes status) should
  // NOT reopen the panel if the user has explicitly hidden it.
  useEffect(() => {
    setDismissed(false)
  }, [destination?.name])

  // useMemo must be declared before any early returns (Rules of Hooks)
  const stationsOnRoute = useMemo(() => {
    if (!route) return []
    return findStationsAlongRoute(route.polyline, stations)
  }, [route, stations])

  function handleStart() {
    const map = getMap()
    const gps = gpsStore.getPosition()
    if (map && gps) {
      // panTo only — preserve user's current zoom level
      followStore.beginProgrammaticMove()
      map.once('moveend', () => followStore.endProgrammaticMove())
      map.panTo([gps.lat, gps.lng], { animate: !isTeslaBrowser })
    }
    followStore.setFollowing(true)
    routeStore.startNavigation()
  }

  if (status === 'idle') return null

  // When panel is hidden — show a small "ПОКАЖИ" pill at bottom
  if (dismissed) {
    return (
      <button
        onClick={() => setDismissed(false)}
        aria-label={t('routePanel.showPanel')}
        style={{
          position:       'absolute',
          bottom:         24,
          left:           'calc(25% - 40px)',
          transform:      'translateX(-50%)',
          zIndex:         500,
          padding:        '10px 28px',
          borderRadius:   24,
          // Tesla: no inline backdropFilter — inline styles override CSS class
          // rules ([data-tesla] .glass) and force GPU blur pass on every frame.
          background:     isTeslaBrowser ? 'rgba(13,13,19,0.98)' : 'rgba(18,18,26,0.92)',
          border:         '1px solid rgba(255,255,255,0.18)',
          backdropFilter:       isTeslaBrowser ? undefined : 'blur(12px)',
          WebkitBackdropFilter: isTeslaBrowser ? undefined : 'blur(12px)',
          color:          'rgba(255,255,255,0.85)',
          fontSize:       15,
          fontWeight:     700,
          letterSpacing:  '0.06em',
          cursor:         'pointer',
          touchAction:    'manipulation',
          boxShadow:      isTeslaBrowser ? 'none' : '0 4px 20px rgba(0,0,0,0.45)',
          display:        'flex',
          alignItems:     'center',
          gap:            8,
          whiteSpace:     'nowrap',
        }}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
          stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
          aria-hidden="true">
          <polyline points="6 9 12 15 18 9" />
        </svg>
        {t('routePanel.showPanel')}
      </button>
    )
  }

  const remainingDurationS =
    route && remainingM != null
      ? (remainingM / route.distanceM) * route.durationS
      : route?.durationS ?? 0

  return (
    <div
      style={{
        position:  'absolute',
        bottom:    24,
        left:      'calc(25% - 40px)',
        transform: 'translateX(-50%)',
        width:     'min(400px, calc(50vw - 220px))',
        zIndex:    500,
        padding:   '14px 18px',
      }}
      className="glass route-panel-container"
    >
      {status === 'loading' && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <Spinner />
          <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
            {t('routePanel.calculating')}{' '}
            <b style={{ color: 'var(--text-primary)' }}>{destination?.name}</b>...
          </span>
        </div>
      )}

      {status === 'error' && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
          <span style={{ fontSize: 13, color: '#ef4444' }}>&#9888; {error}</span>
          <CancelButton />
        </div>
      )}

      {status === 'ok' && route && destination && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>

          {/* Deviation banner */}
          {deviated && (
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              background: 'rgba(239,68,68,0.15)', border: '1px solid rgba(239,68,68,0.4)',
              borderRadius: 8, padding: '6px 10px',
            }}>
              <span style={{ fontSize: 12, color: '#f87171' }}>{t('route.deviated')}</span>
              <button
                onClick={() => { void routeStore.reroute() }}
                style={{
                  padding: '4px 10px', borderRadius: 6,
                  background: '#ef4444', border: 'none',
                  color: '#fff', fontSize: 12, fontWeight: 600,
                  cursor: 'pointer', touchAction: 'manipulation',
                }}
              >
                {t('route.reroute')}
              </button>
            </div>
          )}

          {/* Stats + destination + cancel */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <div style={{ display: 'flex', gap: 18, flex: 1 }}>
              <Stat label={t('route.remaining')} value={formatDist(remainingM ?? route.distanceM)} />
              <Stat label={t('route.duration')}  value={formatDur(remainingDurationS)} />
              <Stat label={t('route.arrival')}   value={formatArrival(remainingDurationS)} />
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.07em' }}>
                {t('route.to')}
              </div>
              <div style={{
                fontSize: 16, fontWeight: 600, color: 'var(--text-primary)',
                whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', marginTop: 1,
              }}>
                {destination.name}
              </div>
            </div>
            <CancelButton />
          </div>

          {/* Route pills — always shown so user can see/switch alternatives */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: -2 }}>
            <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.07em' }}>
              {t('routePanel.routes')}
            </span>
            <PremiumBadge feature="advanced_route_intelligence" />
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            {routes.map((r, i) => (
              <button
                key={i}
                onClick={() => routeStore.selectRoute(i)}
                style={{
                  flex: 1, padding: '7px 8px', borderRadius: 8,
                  border: i === activeRouteIndex
                    ? '1px solid rgba(43,127,255,0.8)'
                    : '1px solid rgba(255,255,255,0.16)',
                  background: i === activeRouteIndex
                    ? 'rgba(43,127,255,0.18)'
                    : 'rgba(255,255,255,0.06)',
                  color: i === activeRouteIndex ? '#7DB8FF' : 'var(--text-secondary)',
                  fontSize: 14, fontWeight: i === activeRouteIndex ? 600 : 400,
                  cursor: 'pointer', touchAction: 'manipulation', textAlign: 'center' as const,
                }}
              >
                {i === 0 ? t('route.primary') : `${t('route.alt')} ${i}`}
                <div style={{ fontSize: 13, marginTop: 2, opacity: 0.8 }}>{formatDist(r.distanceM)}</div>
              </button>
            ))}
          </div>

          {/* Battery arrival estimate */}
          {vehicleProfile && route && batterySession && (() => {
            const gps = gpsStore.getPosition()
            const distKm = (remainingM ?? route.distanceM) / 1000
            // Use live session battery % — more accurate than the static profile value
            const profileWithLiveBattery = {
              ...vehicleProfile,
              currentBatteryPercent: batterySession.currentBatteryPercent,
            }
            const est = estimateArrivalBattery({
              profile:     profileWithLiveBattery,
              distanceKm:  distKm,
              speedKmh:    gps?.speedKmh ?? null,
              tempCelsius: null,
            })
            const col = est.arrivalBatteryPercent >= 30 ? '#22c55e'
                      : est.arrivalBatteryPercent >= 15 ? '#eab308'
                      : '#ef4444'
            const currentCol = batterySession.currentBatteryPercent >= 50 ? '#22c55e'
                             : batterySession.currentBatteryPercent >= 25 ? '#eab308'
                             : '#ef4444'
            const isEstimate = batterySession.source === 'estimated'
            return (
              <div style={{
                background: 'var(--surface-hover)',
                border: '1px solid var(--glass-border)',
                borderRadius: 10, padding: '9px 13px',
              }}>
                {/* Current battery row */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                    <span style={{ fontSize: 11, color: 'var(--text-secondary)', letterSpacing: '0.06em', textTransform: 'uppercase' }}>
                      {t('routePanel.currentCharge')} {isEstimate ? t('routePanel.estimate') : ''}
                    </span>
                    <PremiumBadge feature="smart_arrival_battery" />
                  </div>
                  <div style={{ fontSize: 16, fontWeight: 700, color: currentCol, flexShrink: 0 }}>
                    {isEstimate ? '~' : ''}{Math.round(batterySession.currentBatteryPercent)}%
                  </div>
                </div>
                {/* Arrival battery row */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div>
                    <div style={{ fontSize: 11, color: 'var(--text-secondary)', letterSpacing: '0.06em', textTransform: 'uppercase' }}>
                      {t('routePanel.atArrival')}
                    </div>
                    <div style={{ fontSize: 10, color: 'var(--text-secondary)', marginTop: 2, opacity: 0.7 }}>
                      {est.note}
                    </div>
                  </div>
                  <div style={{ fontSize: 22, fontWeight: 800, color: col, flexShrink: 0, marginLeft: 12 }}>
                    ~{est.arrivalBatteryPercent}%
                  </div>
                </div>
              </div>
            )
          })()}

          {/* Start button — only in preview mode */}
          {mode === 'preview' && (
            <button
              onClick={handleStart}
              aria-label={t('route.start')}
              style={{
                width: '100%',
                height: 58,
                borderRadius: 12,
                background: 'linear-gradient(135deg, #22c55e, #16a34a)',
                border: 'none',
                color: '#fff',
                fontSize: 20,
                fontWeight: 800,
                letterSpacing: '0.06em',
                cursor: 'pointer',
                touchAction: 'manipulation',
                boxShadow: isTeslaBrowser ? 'none' : '0 4px 20px rgba(34,197,94,0.45)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 10,
              }}
            >
              <StartIcon />
              {t('route.start')}
            </button>
          )}

          {/* EV stations along route + Hide button row */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {stationsOnRoute.length > 0 && (
              <div style={{ flex: 1 }}>
                {/* Divider */}
                <div style={{ height: 1, background: 'rgba(255,255,255,0.08)', margin: '2px 0 8px' }} />

                {/* Toggle button */}
                <button
                  onClick={() => setShowStations((v) => !v)}
                  style={{
                    width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    background: 'none', border: 'none', padding: '0 0 2px',
                    cursor: 'pointer', touchAction: 'manipulation',
                  }}
                >
                  <span style={{ fontSize: 15, fontWeight: 600, color: '#e31937', display: 'flex', alignItems: 'center', gap: 5 }}>
                    <span style={{ fontSize: 18 }}>⚡</span>
                    {t('routePanel.chargeEnRoute')}
                    <span style={{
                      background: 'rgba(227,25,55,0.18)', border: '1px solid rgba(227,25,55,0.4)',
                      borderRadius: 8, padding: '0 6px', fontSize: 13, fontWeight: 700,
                      color: '#e31937',
                    }}>
                      {stationsOnRoute.length}
                    </span>
                  </span>
                  <ChevronIcon open={showStations} />
                </button>

                {/* Expandable list */}
                {showStations && (
                  <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 4 }}>
                    {stationsOnRoute.map(({ station, distFromRouteM }) => (
                      <StationRow
                        key={station.id}
                        station={station}
                        distFromRouteM={distFromRouteM}
                      />
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Hide panel button */}
            {!showStations && (
              <button
                onClick={() => setDismissed(true)}
                aria-label={t('routePanel.hidePanel')}
                style={{
                  marginLeft: stationsOnRoute.length > 0 ? 0 : 'auto',
                  marginTop: stationsOnRoute.length > 0 ? 8 : 0,
                  flexShrink: 0,
                  padding: '9px 22px',
                  borderRadius: 10,
                  background: 'rgba(255,255,255,0.10)',
                  border: '1px solid rgba(255,255,255,0.20)',
                  color: 'var(--text-secondary)',
                  fontSize: 15, fontWeight: 700,
                  cursor: 'pointer', touchAction: 'manipulation',
                  letterSpacing: '0.04em',
                }}
              >
                {t('routePanel.hidePanel')}
              </button>
            )}
          </div>

        </div>
      )}
    </div>
  )
}

// ── Station row ───────────────────────────────────────────────────

function StationRow({ station, distFromRouteM }: { station: NormalizedStation; distFromRouteM: number }) {
  const color = stationDotColor(station)

  function handleTap() {
    const map = getMap()
    if (map) map.setView([station.lat, station.lng], Math.max(map.getZoom(), 15), { animate: true })
    evStore.selectStation(station)
  }

  return (
    // eslint-disable-next-line jsx-a11y/click-events-have-key-events
    <div
      role="button"
      tabIndex={0}
      onClick={handleTap}
      style={{
        display: 'flex', alignItems: 'center', gap: 10,
        padding: '7px 10px', borderRadius: 8,
        background: 'rgba(255,255,255,0.04)',
        border: '1px solid rgba(255,255,255,0.08)',
        cursor: 'pointer', touchAction: 'manipulation',
      }}
      onPointerDown={(e) => { (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.09)' }}
      onPointerUp={(e) => { (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.04)' }}
      onPointerLeave={(e) => { (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.04)' }}
    >
      {/* Dot */}
      <div style={{
        width: 26, height: 26, borderRadius: '50%', flexShrink: 0,
        background: `${color}22`, border: `1.5px solid ${color}`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 11,
      }}>
        ⚡
      </div>

      {/* Info */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          fontSize: 12, fontWeight: 600, color: 'var(--text-primary)',
          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
        }}>
          {station.name}
        </div>
        <div style={{ fontSize: 10, color: 'var(--text-secondary)', marginTop: 1 }}>
          {[
            station.network,
            station.maxPowerKw ? `${station.maxPowerKw} kW` : null,
          ].filter(Boolean).join(' · ')}
        </div>
      </div>

      {/* Distance from route */}
      <div style={{ fontSize: 10, color: 'var(--text-secondary)', flexShrink: 0, textAlign: 'right' as const }}>
        ±{distFromRouteM < 1000
          ? `${distFromRouteM} ${t('routePanel.m')}`
          : `${(distFromRouteM / 1000).toFixed(1)} ${t('routePanel.km')}`}
      </div>
    </div>
  )
}

// ── Small components ──────────────────────────────────────────────

function StartIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <polygon points="5,3 19,12 5,21" />
    </svg>
  )
}

function ChevronIcon({ open }: { open: boolean }) {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
      stroke="var(--text-secondary)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
      style={{ transform: open ? 'rotate(180deg)' : 'rotate(0)', transition: 'transform 0.2s ease' }}
      aria-hidden="true">
      <polyline points="6 9 12 15 18 9" />
    </svg>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ textAlign: 'center' }}>
      <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--text-primary)', lineHeight: 1.2 }}>
        {value}
      </div>
      <div style={{ fontSize: 12, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.07em', marginTop: 1 }}>
        {label}
      </div>
    </div>
  )
}

function CancelButton() {
  return (
    <button
      onClick={() => routeStore.clear()}
      aria-label={t('route.cancel')}
      style={{
        flexShrink: 0, width: 36, height: 36, borderRadius: 8,
        background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.16)',
        color: 'var(--text-secondary)', cursor: 'pointer', touchAction: 'manipulation',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}
    >
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true"
        stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
        <line x1="3" y1="3" x2="13" y2="13" />
        <line x1="13" y1="3" x2="3" y2="13" />
      </svg>
    </button>
  )
}

function Spinner() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
      stroke="var(--text-secondary)" strokeWidth="2.5" strokeLinecap="round"
      style={{ flexShrink: 0, animation: 'spin 0.8s linear infinite' }}
      aria-hidden="true">
      <path d="M21 12a9 9 0 1 1-6.219-8.56" />
    </svg>
  )
}

function formatDist(metres: number): string {
  const m  = t('routePanel.m')
  const km = t('routePanel.km')
  if (metres < 1000) return `${Math.round(metres)} ${m}`
  return `${(metres / 1000).toFixed(1)} ${km}`
}

function formatDur(seconds: number): string {
  const min = Math.round(seconds / 60)
  const mins = t('routePanel.mins')
  const h    = t('routePanel.hours')
  if (min < 60) return `${min} ${mins}`
  const hh = Math.floor(min / 60)
  const mm = min % 60
  return mm > 0 ? `${hh}${h} ${mm}${mins}` : `${hh}${h}`
}

function formatArrival(seconds: number): string {
  const arrival = new Date(Date.now() + seconds * 1000)
  const locale  = getLang() === 'bg' ? 'bg-BG' : 'en-GB'
  return arrival.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' })
}
