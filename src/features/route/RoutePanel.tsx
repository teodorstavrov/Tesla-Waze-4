// ─── Route Panel ───────────────────────────────────────────────────────
// Shows active route info: distance, ETA, arrival time.
// Replaces FilterBar position when a route is active.

import { useSyncExternalStore } from 'react'
import { routeStore } from './routeStore.js'

export function RoutePanel() {
  const { route, destination, status, error } = useSyncExternalStore(
    routeStore.subscribe.bind(routeStore),
    () => routeStore.getState(),
    () => routeStore.getState(),
  )

  if (status === 'idle') return null

  return (
    <div
      style={{
        position:  'absolute',
        bottom:    90,
        left:      '50%',
        transform: 'translateX(-50%)',
        width:     'min(420px, calc(100vw - 24px))',
        zIndex:    500,
        padding:   '14px 18px',
      }}
      className="glass"
    >
      {status === 'loading' && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <Spinner />
          <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
            Calculating route to <b style={{ color: 'var(--text-primary)' }}>{destination?.name}</b>…
          </span>
        </div>
      )}

      {status === 'error' && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
          <span style={{ fontSize: 13, color: '#ef4444' }}>⚠ {error}</span>
          <CancelButton />
        </div>
      )}

      {status === 'ok' && route && destination && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          {/* Stats */}
          <div style={{ display: 'flex', gap: 18, flex: 1 }}>
            <Stat label="Distance" value={formatDist(route.distanceM)} />
            <Stat label="Duration" value={formatDur(route.durationS)} />
            <Stat label="Arrival"  value={formatArrival(route.durationS)} />
          </div>

          {/* Destination */}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 10, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.07em' }}>
              To
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
      aria-label="Cancel route"
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
      ✕ Cancel
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

// ── Formatters ────────────────────────────────────────────────────

function formatDist(metres: number): string {
  if (metres < 1000) return `${Math.round(metres)} m`
  return `${(metres / 1000).toFixed(1)} km`
}

function formatDur(seconds: number): string {
  const min = Math.round(seconds / 60)
  if (min < 60) return `${min} min`
  const h = Math.floor(min / 60)
  const m = min % 60
  return m > 0 ? `${h}h ${m}m` : `${h}h`
}

function formatArrival(seconds: number): string {
  const arrival = new Date(Date.now() + seconds * 1000)
  return arrival.toLocaleTimeString('bg-BG', { hour: '2-digit', minute: '2-digit' })
}
