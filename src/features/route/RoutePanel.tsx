// ─── Route Panel ───────────────────────────────────────────────────────
// Shows active route info: remaining distance, ETA, arrival time.
// Live-updates remaining distance as GPS moves along the route.
// Shows Reroute button when GPS deviates > 200m from the route.
// Alternative route pills for switching between OSRM alternatives.

import { useSyncExternalStore } from 'react'
import { routeStore } from './routeStore.js'

export function RoutePanel() {
  const { route, routes, activeRouteIndex, destination, status, error, deviated, remainingM } =
    useSyncExternalStore(
      routeStore.subscribe.bind(routeStore),
      () => routeStore.getState(),
      () => routeStore.getState(),
    )

  if (status === 'idle') return null

  const remainingDurationS =
    route && remainingM != null
      ? (remainingM / route.distanceM) * route.durationS
      : route?.durationS ?? 0

  return (
    <div
      style={{
        position:  'absolute',
        bottom:    90,
        left:      '50%',
        transform: 'translateX(-50%)',
        width:     'min(440px, calc(100vw - 24px))',
        zIndex:    500,
        padding:   '14px 18px',
      }}
      className="glass"
    >
      {status === 'loading' && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <Spinner />
          <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
            Изчисляване на маршрут до{' '}
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
          {/* Deviation banner + reroute */}
          {deviated && (
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              background: 'rgba(239,68,68,0.15)', border: '1px solid rgba(239,68,68,0.4)',
              borderRadius: 8, padding: '6px 10px',
            }}>
              <span style={{ fontSize: 12, color: '#f87171' }}>
                Отклонение от маршрута
              </span>
              <button
                onClick={() => { void routeStore.reroute() }}
                style={{
                  padding: '4px 10px', borderRadius: 6,
                  background: '#ef4444', border: 'none',
                  color: '#fff', fontSize: 12, fontWeight: 600,
                  cursor: 'pointer', touchAction: 'manipulation',
                }}
              >
                Пренасочи
              </button>
            </div>
          )}

          {/* Stats + destination + cancel */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <div style={{ display: 'flex', gap: 18, flex: 1 }}>
              <Stat label="Остава"      value={formatDist(remainingM ?? route.distanceM)} />
              <Stat label="Времетраене" value={formatDur(remainingDurationS)} />
              <Stat label="Пристигане"  value={formatArrival(remainingDurationS)} />
            </div>

            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 10, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.07em' }}>
                До
              </div>
              <div style={{
                fontSize: 13, fontWeight: 600, color: 'var(--text-primary)',
                whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                marginTop: 1,
              }}>
                {destination.name}
              </div>
            </div>

            <CancelButton />
          </div>

          {/* Alternative route pills */}
          {routes.length > 1 && (
            <div style={{ display: 'flex', gap: 6 }}>
              {routes.map((r, i) => (
                <button
                  key={i}
                  onClick={() => routeStore.selectRoute(i)}
                  style={{
                    flex: 1,
                    padding: '5px 8px',
                    borderRadius: 8,
                    border: i === activeRouteIndex
                      ? '1px solid rgba(43,127,255,0.8)'
                      : '1px solid rgba(255,255,255,0.16)',
                    background: i === activeRouteIndex
                      ? 'rgba(43,127,255,0.18)'
                      : 'rgba(255,255,255,0.06)',
                    color: i === activeRouteIndex ? '#7DB8FF' : 'var(--text-secondary)',
                    fontSize: 11,
                    fontWeight: i === activeRouteIndex ? 600 : 400,
                    cursor: 'pointer',
                    touchAction: 'manipulation',
                    textAlign: 'center' as const,
                  }}
                >
                  {i === 0 ? 'Основен' : `Алт ${i}`}
                  <div style={{ fontSize: 10, marginTop: 1, opacity: 0.8 }}>
                    {formatDist(r.distanceM)}
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ textAlign: 'center' }}>
      <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)', lineHeight: 1.2 }}>
        {value}
      </div>
      <div style={{ fontSize: 9, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.07em', marginTop: 1 }}>
        {label}
      </div>
    </div>
  )
}

function CancelButton() {
  return (
    <button
      onClick={() => routeStore.clear()}
      aria-label="Откажи маршрут"
      style={{
        flexShrink: 0,
        padding: '6px 12px',
        borderRadius: 8,
        background: 'rgba(255,255,255,0.08)',
        border: '1px solid rgba(255,255,255,0.16)',
        color: 'var(--text-secondary)',
        fontSize: 12,
        cursor: 'pointer',
        touchAction: 'manipulation',
      }}
    >
      &#x2715;
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
  if (metres < 1000) return `${Math.round(metres)} м`
  return `${(metres / 1000).toFixed(1)} км`
}

function formatDur(seconds: number): string {
  const min = Math.round(seconds / 60)
  if (min < 60) return `${min} мин`
  const h = Math.floor(min / 60)
  const m = min % 60
  return m > 0 ? `${h}ч ${m}м` : `${h}ч`
}

function formatArrival(seconds: number): string {
  const arrival = new Date(Date.now() + seconds * 1000)
  return arrival.toLocaleTimeString('bg-BG', { hour: '2-digit', minute: '2-digit' })
}
