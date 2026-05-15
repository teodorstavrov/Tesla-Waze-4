// ─── Bottom-center action dock ─────────────────────────────────────────
// Phase 4: EV toggle. Phase 6: Report button opens event modal.

import { useSyncExternalStore, useState, useRef } from 'react'
import { evStore } from '@/features/ev/evStore'
import { eventStore } from '@/features/events/eventStore'
import { routeStore } from '@/features/route/routeStore'
import { langStore, t } from '@/lib/locale'

export function BottomDock() {
  // Re-render on language change so button labels update
  useSyncExternalStore(langStore.subscribe.bind(langStore), langStore.getLang, langStore.getLang)

  const markersVisible = useSyncExternalStore(
    evStore.subscribe.bind(evStore),
    () => evStore.getState().markersVisible,
    () => true,
  )

  const routeActive = useSyncExternalStore(
    routeStore.subscribe.bind(routeStore),
    () => routeStore.getState().status !== 'idle',
    () => false,
  )

  const [noRouteMsg, setNoRouteMsg] = useState(false)
  const noRouteMsgTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  function handleRouteClick() {
    if (routeActive) {
      routeStore.clear()
    } else {
      setNoRouteMsg(true)
      if (noRouteMsgTimer.current) clearTimeout(noRouteMsgTimer.current)
      noRouteMsgTimer.current = setTimeout(() => setNoRouteMsg(false), 5000)
    }
  }

  return (
    <div style={{
      position: 'absolute',
      bottom: 24,
      left: '50%',
      transform: 'translateX(-50%)',
      zIndex: 400,
      display: 'flex',
      gap: 'clamp(6px, 2.5vw, 13px)',
      alignItems: 'center',
    }}>
      {/* EV Stations toggle */}
      <button
        className="icon-btn"
        style={{
          width: 'clamp(58px, 17vw, 83px)', height: 'clamp(58px, 17vw, 83px)',
          borderRadius: 'clamp(12px, 4vw, 16px)',
          background: 'rgba(255,255,255,0.5)',
          borderColor: 'rgba(255,255,255,0.3)',
          color: '#111',
          boxShadow: '0 2px 12px rgba(0,0,0,0.18)',
          opacity: markersVisible ? 1 : 0.35,
        }}
        title={markersVisible ? t('dock.hideStations') : t('dock.showStations')}
        aria-label={markersVisible ? t('dock.hideStations') : t('dock.showStations')}
        aria-pressed={markersVisible}
        onClick={() => evStore.toggleMarkersVisible()}
      >
        <EVIcon />
      </button>

      {/* Report — primary CTA */}
      <button
        aria-label={t('dock.report')}
        title={t('dock.report')}
        onClick={() => eventStore.openReportModal()}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 'clamp(6px, 2vw, 10px)',
          padding: '0 clamp(14px, 4.5vw, 32px)',
          height: 'clamp(58px, 17vw, 83px)',
          borderRadius: 'clamp(30px, 9vw, 42px)',
          background: '#e31937',
          border: 'none',
          color: '#fff',
          fontSize: 'clamp(13px, 3.5vw, 16px)',
          fontWeight: 700,
          letterSpacing: '0.04em',
          cursor: 'pointer',
          boxShadow: '0 6px 28px rgba(227,25,55,0.45)',
          touchAction: 'manipulation',
          opacity: 0.7,
          whiteSpace: 'nowrap',
        }}
        onPointerDown={(e) => { (e.currentTarget as HTMLButtonElement).style.transform = 'scale(0.96)' }}
        onPointerUp={(e) => { (e.currentTarget as HTMLButtonElement).style.transform = '' }}
        onPointerLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.transform = '' }}
      >
        <AlertIcon />
        {t('dock.report')}
      </button>

      {/* Route */}
      <div style={{ position: 'relative', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
        {noRouteMsg && (
          <div style={{
            position: 'absolute',
            bottom: '100%',
            left: '50%',
            transform: 'translateX(-50%)',
            marginBottom: 8,
            background: 'rgba(18,18,26,0.92)',
            border: '1px solid rgba(255,255,255,0.14)',
            backdropFilter: 'blur(10px)',
            WebkitBackdropFilter: 'blur(10px)',
            color: '#fff',
            fontSize: 13,
            fontWeight: 600,
            padding: '7px 14px',
            borderRadius: 10,
            whiteSpace: 'nowrap',
            boxShadow: '0 2px 12px rgba(0,0,0,0.4)',
            pointerEvents: 'none',
          }}>
            {t('dock.noRoute')}
          </div>
        )}
        <button
          className="icon-btn"
          style={{
            width: 'clamp(58px, 17vw, 83px)', height: 'clamp(58px, 17vw, 83px)',
            borderRadius: 'clamp(12px, 4vw, 16px)',
            background: routeActive ? 'rgba(43,127,255,0.5)' : 'rgba(255,255,255,0.5)',
            borderColor: routeActive ? '#2B7FFF' : 'rgba(255,255,255,0.3)',
            color: routeActive ? '#fff' : '#111',
            boxShadow: routeActive ? '0 0 0 3px rgba(43,127,255,0.3)' : '0 2px 12px rgba(0,0,0,0.18)',
          }}
          title={routeActive ? t('route.cancel') : t('dock.route')}
          aria-label={routeActive ? t('route.cancel') : t('dock.route')}
          onClick={handleRouteClick}
        >
          <RouteIcon />
        </button>
      </div>
    </div>
  )
}

function EVIcon() {
  return (
    <svg width="30" height="30" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M13 2L4.5 13.5H11L10 22L19.5 10.5H13L13 2Z" />
    </svg>
  )
}

function AlertIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
      <line x1="12" y1="9" x2="12" y2="13" />
      <line x1="12" y1="17" x2="12.01" y2="17" />
    </svg>
  )
}

function RouteIcon() {
  return (
    <svg width="29" height="29" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="5" cy="6" r="2" />
      <circle cx="19" cy="18" r="2" />
      <path d="M5 8v3a3 3 0 0 0 3 3h8a3 3 0 0 1 3 3v1" />
    </svg>
  )
}
