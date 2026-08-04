// ─── Bottom-center action dock ─────────────────────────────────────────
// Phase 4: EV toggle. Phase 6: Report button opens event modal.

import { useSyncExternalStore, useState, useRef } from 'react'
import { evStore } from '@/features/ev/evStore'
import { eventStore } from '@/features/events/eventStore'
import { routeStore } from '@/features/route/routeStore'
import { langStore, t } from '@/lib/locale'
import { v8SportEngine, v8MuscleEngine, v8AmgEngine, v8W12Engine } from '@/features/v8sound/v8Engine'
import { v8HeaderEngine } from '@/features/v8sound/audioEngine'
import { muscleCarEngine } from '@/features/enginePack/SampleEngine'

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

  type V8Mode = 'off' | 'sport' | 'muscle' | 'header' | 's63' | 'w12' | 'musclecar'
  const [v8Mode,    setV8Mode]    = useState<V8Mode>('off')
  const [v8Loading, setV8Loading] = useState(false)
  const [v8Volume,  setV8Volume]  = useState(1.0)   // 1.0 = default, range 0.5-5

  function applyVolume(mode: V8Mode, mult: number) {
    if (mode === 'sport')  v8SportEngine.setVolumeMultiplier(mult)
    if (mode === 'muscle') v8MuscleEngine.setVolumeMultiplier(mult)
    if (mode === 'header') v8HeaderEngine.setVolumeMultiplier(mult)
    if (mode === 's63')    v8AmgEngine.setVolumeMultiplier(mult)
    if (mode === 'w12')      v8W12Engine.setVolumeMultiplier(mult)
    if (mode === 'musclecar') muscleCarEngine.setVolumeMultiplier(mult)
  }

  function setEngineVolume(mult: number) {
    const clamped = Math.round(mult * 10) / 10
    setV8Volume(clamped)
    applyVolume(v8Mode, clamped)
  }

  function showEngineToast() {
    if (engineToastTimer.current) clearTimeout(engineToastTimer.current)
    setEngineToast(true)
    engineToastTimer.current = setTimeout(() => setEngineToast(false), 3000)
  }

  function handleV8Cycle() {
    if (v8Loading) return
    showEngineToast()
    if (v8Mode === 'off') {
      v8SportEngine.start()
      v8SportEngine.setVolumeMultiplier(v8Volume)
      setV8Mode('sport')
    } else if (v8Mode === 'sport') {
      v8SportEngine.stop()
      v8MuscleEngine.start()
      v8MuscleEngine.setVolumeMultiplier(v8Volume)
      setV8Mode('muscle')
    } else if (v8Mode === 'muscle') {
      v8MuscleEngine.stop()
      setV8Mode('header')
      setV8Loading(true)
      v8HeaderEngine.start()
        .then(() => { v8HeaderEngine.setVolumeMultiplier(v8Volume); setV8Loading(false) })
        .catch(() => { setV8Mode('off'); setV8Loading(false) })
    } else if (v8Mode === 'header') {
      v8HeaderEngine.stop()
      v8AmgEngine.start()
      v8AmgEngine.setVolumeMultiplier(v8Volume)
      setV8Mode('s63')
    } else if (v8Mode === 's63') {
      v8AmgEngine.stop()
      v8W12Engine.start()
      v8W12Engine.setVolumeMultiplier(v8Volume)
      setV8Mode('w12')
    } else if (v8Mode === 'w12') {
      v8W12Engine.stop()
      setV8Mode('musclecar')
      setV8Loading(true)
      muscleCarEngine.start()
        .then(() => { muscleCarEngine.setVolumeMultiplier(v8Volume); setV8Loading(false) })
        .catch(() => { setV8Mode('off'); setV8Loading(false) })
    } else {
      muscleCarEngine.stop()
      setV8Mode('off')
    }
  }

  const v8Label = v8Mode === 'sport'     ? t('dock.v8Sport')
               : v8Mode === 'muscle'    ? t('dock.v8Muscle')
               : v8Mode === 'header'    ? t('dock.v8Header')
               : v8Mode === 's63'      ? t('dock.v8S63')
               : v8Mode === 'w12'      ? t('dock.v8W12')
               : v8Mode === 'musclecar' ? t('dock.v8MuscleCar')
               : t('dock.v8Off')

  const [engineToast, setEngineToast] = useState(false)
  const engineToastTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

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
      <div style={{ position: 'relative', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>

        {/* Engine Simulator toast — shown for 3s on mode change */}
        {engineToast && v8Mode === 'off' && (
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
            letterSpacing: '0.04em',
          }}>
            {t('dock.engineSimulator')}
          </div>
        )}

        {/* Volume panel — visible while engine is running */}
        {v8Mode !== 'off' && (
          <V8VolumePanel
            volume={v8Volume}
            accentColor={
              v8Mode === 'sport'  ? '#e31937'
            : v8Mode === 'muscle' ? '#f59e0b'
            : v8Mode === 'header'    ? '#10b981'
            : v8Mode === 's63'      ? '#8b5cf6'
            : v8Mode === 'w12'      ? '#eab308'
            :                          '#f97316'
            }
            onChange={setEngineVolume}
          />
        )}
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
      </div>

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

// ── Volume panel ──────────────────────────────────────────────────────────────

function V8VolumePanel({
  volume,
  accentColor,
  onChange,
}: {
  volume:      number
  accentColor: string
  onChange:    (v: number) => void
}) {
  const [collapsed, setCollapsed] = useState(false)

  const MIN = 0.5
  const MAX = 5.0
  const STEP = 0.5

  const dec = () => onChange(Math.max(MIN, Math.round((volume - STEP) * 10) / 10))
  const inc = () => onChange(Math.min(MAX, Math.round((volume + STEP) * 10) / 10))

  const pct = ((volume - MIN) / (MAX - MIN)) * 100

  return (
    <div style={{
      position:          'absolute',
      right:             'calc(100% + 10px)',
      top:               '50%',
      transform:         'translateY(-50%)',
      width:             collapsed ? 'auto' : 224,
      minWidth:          collapsed ? 80 : undefined,
      background:        'rgba(14,14,22,0.90)',
      border:            `1px solid ${accentColor}44`,
      backdropFilter:    'blur(14px)',
      WebkitBackdropFilter: 'blur(14px)',
      borderRadius:      14,
      boxShadow:         `0 4px 24px rgba(0,0,0,0.5), 0 0 0 1px ${accentColor}22`,
      padding:           collapsed ? '8px 12px' : '10px 12px 10px',
      display:           'flex',
      flexDirection:     'column',
      gap:               6,
      userSelect:        'none',
      WebkitUserSelect:  'none',
    }}>

      {/* Label row — tap to toggle */}
      <div
        onPointerDown={() => setCollapsed(c => !c)}
        style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, cursor: 'pointer', touchAction: 'manipulation' }}
      >
        <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.45)', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
          Vol
        </span>
        <span style={{ fontSize: 15, fontWeight: 700, color: accentColor, letterSpacing: '0.04em' }}>
          ×{volume.toFixed(1)}
        </span>
        <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.35)', lineHeight: 1, transform: collapsed ? 'rotate(90deg)' : 'rotate(-90deg)', display: 'inline-block' }}>
          ▲
        </span>
      </div>

      {/* Slider + markers — hidden when collapsed */}
      {!collapsed && <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>

        {/* − button */}
        <button
          onPointerDown={dec}
          style={{
            width: 36, height: 36, borderRadius: 9,
            background: 'rgba(255,255,255,0.08)',
            border: '1px solid rgba(255,255,255,0.14)',
            color: '#fff', fontSize: 20, fontWeight: 300,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            cursor: 'pointer', flexShrink: 0, touchAction: 'manipulation',
            lineHeight: 1,
          }}
        >−</button>

        {/* Custom track + thumb */}
        <div style={{ flex: 1, position: 'relative', height: 36, display: 'flex', alignItems: 'center' }}>
          {/* Track background */}
          <div style={{
            position: 'absolute', left: 0, right: 0, height: 5,
            borderRadius: 3, background: 'rgba(255,255,255,0.12)',
          }} />
          {/* Filled portion */}
          <div style={{
            position: 'absolute', left: 0, width: `${pct}%`, height: 5,
            borderRadius: 3, background: accentColor,
            transition: 'width 0.07s',
          }} />
          {/* Native range (invisible, sits on top for touch interaction) */}
          <input
            type="range"
            min={MIN} max={MAX} step={STEP}
            value={volume}
            onChange={e => onChange(Number(e.target.value))}
            style={{
              position: 'absolute', inset: 0, width: '100%', height: '100%',
              opacity: 0, cursor: 'pointer', margin: 0,
              touchAction: 'manipulation',
            }}
          />
        </div>

        {/* + button */}
        <button
          onPointerDown={inc}
          style={{
            width: 36, height: 36, borderRadius: 9,
            background: 'rgba(255,255,255,0.08)',
            border: '1px solid rgba(255,255,255,0.14)',
            color: '#fff', fontSize: 20, fontWeight: 300,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            cursor: 'pointer', flexShrink: 0, touchAction: 'manipulation',
            lineHeight: 1,
          }}
        >+</button>
      </div>}

      {!collapsed && (
        <div style={{ display: 'flex', justifyContent: 'space-between', paddingInline: 44 }}>
          {[1, 2, 3, 4, 5].map(v => (
            <span key={v} style={{
              fontSize: 9, color: volume >= v ? accentColor : 'rgba(255,255,255,0.25)',
              fontWeight: volume >= v ? 700 : 400, transition: 'color 0.1s',
            }}>×{v}</span>
          ))}
        </div>
      )}
    </div>
  )
}

type V8IconMode = 'off' | 'sport' | 'muscle' | 'header' | 's63' | 'w12' | 'musclecar'

function V8Icon({ mode, loading }: { mode: V8IconMode; loading?: boolean }) {
  // Real-audio modes show a waveform icon
  if (mode === 'header' || mode === 's63' || mode === 'musclecar') {
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
