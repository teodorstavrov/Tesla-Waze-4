// ─── Bottom-center action dock ─────────────────────────────────────────
// Phase 4: EV toggle. Phase 6: Report button opens event modal.

import { useSyncExternalStore, useState, useRef } from 'react'
import { evStore } from '@/features/ev/evStore'
import { eventStore } from '@/features/events/eventStore'
import { routeStore } from '@/features/route/routeStore'
import { langStore, t } from '@/lib/locale'
import { v8SportEngine, v8MuscleEngine, v8AmgEngine, v8W12Engine } from '@/features/v8sound/v8Engine'
import { v8HeaderEngine } from '@/features/v8sound/audioEngine'

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

  type V8Mode = 'off' | 'sport' | 'muscle' | 'header' | 's63' | 'w12'
  const [v8Mode,    setV8Mode]    = useState<V8Mode>('off')
  const [v8Loading, setV8Loading] = useState(false)

  function handleV8Cycle() {
    if (v8Loading) return
    if (v8Mode === 'off') {
      v8SportEngine.start()
      setV8Mode('sport')
    } else if (v8Mode === 'sport') {
      v8SportEngine.stop()
      v8MuscleEngine.start()
      setV8Mode('muscle')
    } else if (v8Mode === 'muscle') {
      v8MuscleEngine.stop()
      setV8Mode('header')
      setV8Loading(true)
      v8HeaderEngine.start()
        .then(() => setV8Loading(false))
        .catch(() => { setV8Mode('off'); setV8Loading(false) })
    } else if (v8Mode === 'header') {
      v8HeaderEngine.stop()
      v8AmgEngine.start()
      setV8Mode('s63')
    } else if (v8Mode === 's63') {
      v8AmgEngine.stop()
      v8W12Engine.start()
      setV8Mode('w12')
    } else {
      v8W12Engine.stop()
      setV8Mode('off')
    }
  }

  const v8Label = v8Mode === 'sport'  ? t('dock.v8Sport')
               : v8Mode === 'muscle' ? t('dock.v8Muscle')
               : v8Mode === 'header' ? t('dock.v8Header')
               : v8Mode === 's63'   ? t('dock.v8S63')
               : v8Mode === 'w12'   ? t('dock.v8W12')
               : t('dock.v8Off')

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
      {/* V8 Sound cycle: off → sport → muscle → header → s63 → off */}
      <button
        className="icon-btn"
        onClick={handleV8Cycle}
        title={v8Label}
        aria-label={v8Label}
        disabled={v8Loading}
        style={{
          width: 'clamp(58px, 17vw, 83px)', height: 'clamp(58px, 17vw, 83px)',
          borderRadius: 'clamp(12px, 4vw, 16px)',
          background:  v8Mode === 'muscle' ? 'rgba(245,158,11,0.25)'
                     : v8Mode === 'sport'  ? 'rgba(227,25,55,0.25)'
                     : v8Mode === 'header' ? 'rgba(16,185,129,0.25)'
                     : v8Mode === 's63'   ? 'rgba(139,92,246,0.25)'
                     : v8Mode === 'w12'   ? 'rgba(234,179,8,0.25)'
                     : 'rgba(255,255,255,0.5)',
          borderColor: v8Mode === 'muscle' ? '#f59e0b'
                     : v8Mode === 'sport'  ? '#e31937'
                     : v8Mode === 'header' ? '#10b981'
                     : v8Mode === 's63'   ? '#8b5cf6'
                     : v8Mode === 'w12'   ? '#eab308'
                     : 'rgba(255,255,255,0.3)',
          color:       v8Mode === 'muscle' ? '#f59e0b'
                     : v8Mode === 'sport'  ? '#e31937'
                     : v8Mode === 'header' ? '#10b981'
                     : v8Mode === 's63'   ? '#8b5cf6'
                     : v8Mode === 'w12'   ? '#eab308'
                     : '#111',
          boxShadow:   v8Mode === 'muscle' ? '0 0 0 3px rgba(245,158,11,0.25)'
                     : v8Mode === 'sport'  ? '0 0 0 3px rgba(227,25,55,0.25)'
                     : v8Mode === 'header' ? '0 0 0 3px rgba(16,185,129,0.25)'
                     : v8Mode === 's63'   ? '0 0 0 3px rgba(139,92,246,0.25)'
                     : v8Mode === 'w12'   ? '0 0 0 3px rgba(234,179,8,0.25)'
                     : '0 2px 12px rgba(0,0,0,0.18)',
          opacity: v8Loading ? 0.5 : 1,
        }}
      >
        <V8Icon mode={v8Mode} loading={v8Loading} />
      </button>

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

type V8IconMode = 'off' | 'sport' | 'muscle' | 'header' | 's63' | 'w12'

function V8Icon({ mode, loading }: { mode: V8IconMode; loading?: boolean }) {
  // Real-audio modes (header, s63) show a waveform icon
  if (mode === 'header' || mode === 's63') {
    return (
      <svg width="28" height="28" viewBox="0 0 24 24" fill="none"
        stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        {loading
          ? <circle cx="12" cy="12" r="5" strokeDasharray="4 4" />
          : <>
              <line x1="2"  y1="12" x2="2"  y2="12" strokeWidth="3" />
              <line x1="5"  y1="8"  x2="5"  y2="16" strokeWidth="2.5" />
              <line x1="8"  y1="5"  x2="8"  y2="19" strokeWidth="2.5" />
              <line x1="11" y1="9"  x2="11" y2="15" strokeWidth="2.5" />
              <line x1="14" y1="3"  x2="14" y2="21" strokeWidth="2.5" />
              <line x1="17" y1="7"  x2="17" y2="17" strokeWidth="2.5" />
              <line x1="20" y1="10" x2="20" y2="14" strokeWidth="2.5" />
            </>
        }
      </svg>
    )
  }

  // W12 — wider block with 5 cylinder heads and W-pattern line suggesting 12-cyl layout
  if (mode === 'w12') {
    return (
      <svg width="28" height="28" viewBox="0 0 24 24" fill="none"
        stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <rect x="1" y="10" width="22" height="8" rx="2" />
        <line x1="4"  y1="10" x2="4"  y2="6" />
        <line x1="8"  y1="10" x2="8"  y2="6" />
        <line x1="12" y1="10" x2="12" y2="6" />
        <line x1="16" y1="10" x2="16" y2="6" />
        <line x1="20" y1="10" x2="20" y2="6" />
        <path d="M3 15 L5 12.5 L7 15 L9 12.5 L11 15" strokeWidth="1.3" strokeOpacity="0.75" />
        <path d="M1 14 Q0 14 0 17" />
      </svg>
    )
  }

  // Synth modes (off, sport, muscle) show a standard engine block icon
  return (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="3" y="9" width="18" height="9" rx="2" />
      <line x1="7"  y1="9" x2="7"  y2="5" />
      <line x1="12" y1="9" x2="12" y2="5" />
      <line x1="17" y1="9" x2="17" y2="5" />
      {mode === 'muscle' && <line x1="9.5"  y1="9" x2="9.5"  y2="6" strokeWidth="1.2" strokeOpacity="0.7" />}
      {mode === 'muscle' && <line x1="14.5" y1="9" x2="14.5" y2="6" strokeWidth="1.2" strokeOpacity="0.7" />}
      <path d="M3 13 Q1 13 1 16" />
    </svg>
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
