// ─── Left-side vertical control strip ─────────────────────────────────
// Includes zoom controls (moved from right side).
import { useSyncExternalStore, useState, useRef } from 'react'
import { LocationButton } from '@/components/LocationButton'
import { getMap } from '@/components/MapShell'
import { openSupportModal } from '@/components/SupportModal'
import { openVehicleProfileModal } from '@/components/VehicleProfileModal'
import { openPricingModal } from '@/components/PricingModal'
import { settingsStore } from '@/features/settings/settingsStore'
import { langStore, t, getLang } from '@/lib/locale'
import { isPremiumEnabled } from '@/lib/featureFlags'
import { isTeslaBrowser } from '@/lib/browser'

export function LeftControls() {
  useSyncExternalStore(langStore.subscribe.bind(langStore), getLang, getLang)
  const headingMode = useSyncExternalStore(
    settingsStore.subscribe.bind(settingsStore),
    () => settingsStore.get().headingMode,
    () => 'north-up' as const,
  )

  const showTraffic = useSyncExternalStore(
    settingsStore.subscribe.bind(settingsStore),
    () => settingsStore.get().showTraffic,
    () => false,
  )

  const isCourseUp    = headingMode === 'course-up'
  const [modeHint, setModeHint] = useState<string | null>(null)
  const modeHintTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  function handleHeadingToggle() {
    const next = isCourseUp ? 'north-up' : 'course-up'
    settingsStore.setHeadingMode(next)
    const text = next === 'course-up' ? t('map.courseUp') : t('map.northUp')
    setModeHint(text)
    if (modeHintTimer.current) clearTimeout(modeHintTimer.current)
    modeHintTimer.current = setTimeout(() => setModeHint(null), 5000)
  }

  return (
    <div
      className="left-controls-xl"
      style={{
        position: 'absolute',
        left: 12,
        top: '50%',
        transform: 'translateY(-50%)',
        zIndex: 400,
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
      }}
    >
      <div style={{ position: 'relative' }}>
        {modeHint && (
          <div style={{
            position: 'absolute',
            left: 'calc(100% + 10px)',
            top: '50%',
            transform: 'translateY(-50%)',
            background: 'rgba(18,18,26,0.92)',
            border: '1px solid rgba(255,255,255,0.14)',
            backdropFilter: isTeslaBrowser ? undefined : 'blur(10px)',
            WebkitBackdropFilter: isTeslaBrowser ? undefined : 'blur(10px)',
            color: '#fff',
            fontSize: 13,
            fontWeight: 600,
            padding: '7px 14px',
            borderRadius: 10,
            whiteSpace: 'nowrap',
            boxShadow: '0 2px 12px rgba(0,0,0,0.4)',
            pointerEvents: 'none',
            zIndex: 500,
          }}>
            {modeHint}
          </div>
        )}
        <button
          className="icon-btn"
          onClick={handleHeadingToggle}
          title={isCourseUp ? t('controls.courseUpHint') : t('controls.northUpHint')}
          aria-label={t('controls.orientLabel')}
          aria-pressed={isCourseUp}
          style={{ opacity: 1 }}
        >
          {isCourseUp ? <CourseUpIcon /> : <NorthUpIcon />}
        </button>
      </div>
      <div style={{ height: 1, background: 'var(--glass-border)', margin: '4px 0' }} />
      <LocationButton />
      <button className="icon-btn" onClick={() => getMap()?.zoomIn(1)}
        title="Zoom in" aria-label="Zoom in">
        <PlusIcon />
      </button>
      <button className="icon-btn" onClick={() => getMap()?.zoomOut(1)}
        title="Zoom out" aria-label="Zoom out">
        <MinusIcon />
      </button>
      <div style={{ height: 1, background: 'var(--glass-border)', margin: '4px 0' }} />
      <button
        className="icon-btn"
        onClick={() => settingsStore.toggleTraffic()}
        title={showTraffic ? 'Hide traffic' : 'Show traffic'}
        aria-label={showTraffic ? 'Hide traffic' : 'Show traffic'}
        aria-pressed={showTraffic}
        style={{ color: showTraffic ? '#22c55e' : undefined }}
      >
        <TrafficIcon active={showTraffic} />
      </button>
      <button className="icon-btn" onClick={openVehicleProfileModal}
        title={t('controls.vehicleProfile')}
        aria-label={t('controls.vehicleProfile')}>
        <CarBatteryIcon />
      </button>
      {isPremiumEnabled() && (
        <button
          className="icon-btn"
          onClick={openPricingModal}
          title="Plans & pricing"
          aria-label="Plans & pricing"
          style={{ fontSize: 16, lineHeight: 1 }}
        >
          👑
        </button>
      )}
      <button className="icon-btn" onClick={openSupportModal}
        title={t('controls.support')} aria-label={t('controls.support')}>
        <HeartIcon />
      </button>
    </div>
  )
}

// Course-up icon: map with rotation arrow (картата се върти)
function CourseUpIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {/* Map outline */}
      <polygon points="3,6 9,3 15,6 21,3 21,18 15,21 9,18 3,21" opacity="0.5" />
      {/* Arrow pointing up (avatar fixed) */}
      <polygon points="12,4 15,10 12,8 9,10" fill="currentColor" stroke="none" />
    </svg>
  )
}

// North-up icon: compass N fixed, map static (аватарът се върти)
function NorthUpIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {/* Compass circle */}
      <circle cx="12" cy="12" r="9" opacity="0.5" />
      {/* N arrow pointing up */}
      <polygon points="12,4 14.5,10 12,8.5 9.5,10" fill="currentColor" stroke="none" />
      {/* S dot */}
      <circle cx="12" cy="18.5" r="1" fill="currentColor" stroke="none" opacity="0.4" />
    </svg>
  )
}

function PlusIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden="true">
      <line x1="12" y1="5" x2="12" y2="19" />
      <line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  )
}

function MinusIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden="true">
      <line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  )
}

function CarBatteryIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {/* Car body */}
      <path d="M2 13 C2 13 3 9 5 8 C7 7 9 7 12 7 C15 7 17 7 19 8 C21 9 22 11 22 13 L22 15 C22 15.55 21.55 16 21 16 L20 16 C20 17.1 19.1 18 18 18 C16.9 18 16 17.1 16 16 L8 16 C8 17.1 7.1 18 6 18 C4.9 18 4 17.1 4 16 L3 16 C2.45 16 2 15.55 2 15 Z" />
      {/* Cabin */}
      <path d="M6 8 C7 6 9 5 12 5 C15 5 17 6 18 8" />
      {/* Wheels */}
      <circle cx="6"  cy="17" r="1.5" fill="currentColor" stroke="none" />
      <circle cx="18" cy="17" r="1.5" fill="currentColor" stroke="none" />
    </svg>
  )
}

function TrafficIcon({ active }: { active: boolean }) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {/* Road */}
      <path d="M12 2 L12 22" strokeDasharray="2 2" opacity="0.35" />
      <path d="M5 5 L19 5" strokeWidth="1.5" opacity="0.4" />
      <path d="M5 19 L19 19" strokeWidth="1.5" opacity="0.4" />
      {/* Traffic lights */}
      <rect x="8" y="8" width="8" height="8" rx="1.5" strokeWidth="1.5" />
      <circle cx="12" cy="10" r="1" fill={active ? '#22c55e' : 'currentColor'} stroke="none" />
      <circle cx="12" cy="12" r="1" fill={active ? '#eab308' : 'currentColor'} stroke="none" opacity={active ? 1 : 0.4} />
      <circle cx="12" cy="14" r="1" fill={active ? '#ef4444' : 'currentColor'} stroke="none" opacity={active ? 1 : 0.25} />
    </svg>
  )
}

function HeartIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
    </svg>
  )
}

