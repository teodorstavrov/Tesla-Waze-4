// ─── Left-side vertical control strip ─────────────────────────────────
// Includes zoom controls (moved from right side).
import { useSyncExternalStore, useState, useRef } from 'react'
import { LocationButton } from '@/components/LocationButton'
import { getMap } from '@/components/MapShell'
import { openSupportModal } from '@/components/SupportModal'
import { openVehicleProfileModal } from '@/components/VehicleProfileModal'
import { openPricingModal } from '@/components/PricingModal'
import { settingsStore } from '@/features/settings/settingsStore'
import { countryStore } from '@/lib/countryStore'
import { langStore, t } from '@/lib/locale'
import { isPremiumEnabled } from '@/lib/featureFlags'
import { eventStore } from '@/features/events/eventStore'

function isAdminSession(): boolean {
  try { return !!sessionStorage.getItem('admin_secret') } catch { return false }
}

export function LeftControls() {
  const headingMode = useSyncExternalStore(
    settingsStore.subscribe.bind(settingsStore),
    () => settingsStore.get().headingMode,
    () => 'north-up' as const,
  )

  const isCourseUp    = headingMode === 'course-up'
  const hidePermanent = useSyncExternalStore(
    eventStore.subscribe.bind(eventStore),
    () => eventStore.getState().hidePermanent,
    () => false,
  )
  const isAdmin = isAdminSession()

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
            zIndex: 500,
          }}>
            {modeHint}
          </div>
        )}
        <button
          className="icon-btn"
          onClick={handleHeadingToggle}
          title={isCourseUp ? 'Режим: картата се върти (смени на аватар се върти)' : 'Режим: аватарът се върти (смени на картата се върти)'}
          aria-label="Смени режим на ориентация"
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
      <button className="icon-btn" onClick={openVehicleProfileModal}
        title={countryStore.getCountryOrDefault().locale === 'bg' ? 'Профил на автомобила' : 'Vehicle setup'}
        aria-label={countryStore.getCountryOrDefault().locale === 'bg' ? 'Профил на автомобила' : 'Vehicle setup'}>
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
      {isAdmin && (
        <button
          className="icon-btn"
          onClick={() => eventStore.toggleHidePermanent()}
          title={hidePermanent ? 'Покажи служебните маркери' : 'Скрий служебните маркери'}
          aria-label={hidePermanent ? 'Покажи служебните маркери' : 'Скрий служебните маркери'}
          aria-pressed={hidePermanent}
          style={{ opacity: hidePermanent ? 0.4 : 1 }}
        >
          <PinIcon />
        </button>
      )}
      <button className="icon-btn" onClick={openSupportModal}
        title="Подкрепи проекта" aria-label="Подкрепи проекта">
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
      stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="2" y="7" width="16" height="10" rx="2" />
      <path d="M22 11v2" />
      <line x1="6" y1="11" x2="6" y2="13" />
      <line x1="10" y1="11" x2="10" y2="13" />
    </svg>
  )
}

function PinIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z" />
      <circle cx="12" cy="9" r="2.5" />
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
