// ─── Left-side vertical control strip ─────────────────────────────────
// Includes zoom controls (moved from right side).
import { useSyncExternalStore } from 'react'
import { LocationButton } from '@/components/LocationButton'
import { getMap } from '@/components/MapShell'
import { openLockSoundModal } from '@/components/LockSoundModal'
import { openVoiceAssistant, MicButtonIcon } from '@/features/voice/VoiceAssistant'
import { openVehicleProfileModal } from '@/components/VehicleProfileModal'
import { openPricingModal } from '@/components/PricingModal'
import { langStore, t, getLang } from '@/lib/locale'
import { isPremiumEnabled } from '@/lib/featureFlags'
import { settingsStore } from '@/features/settings/settingsStore'

export function LeftControls() {
  useSyncExternalStore(langStore.subscribe.bind(langStore), getLang, getLang)
  const headingMode = useSyncExternalStore(
    settingsStore.subscribe.bind(settingsStore),
    () => settingsStore.get().headingMode,
    () => settingsStore.get().headingMode,
  )

  function toggleHeadingMode(): void {
    settingsStore.setHeadingMode(headingMode === 'north-up' ? 'course-up' : 'north-up')
  }

  return (
    <div
      className="left-controls-xl"
      style={{
        position:        'absolute',
        left:            12,
        top:             74,
        bottom:          76,
        zIndex:          400,
        display:         'flex',
        flexDirection:   'column',
        justifyContent:  'center',
      }}
    >
      <LocationButton />
      <button className="icon-btn" onClick={() => getMap()?.zoomIn({ duration: 0 })}
        title="Zoom in" aria-label="Zoom in">
        <PlusIcon />
      </button>
      <button className="icon-btn" onClick={() => getMap()?.zoomOut({ duration: 0 })}
        title="Zoom out" aria-label="Zoom out">
        <MinusIcon />
      </button>
      <button className="icon-btn" onClick={openVehicleProfileModal}
        title={t('controls.vehicleProfile')}
        aria-label={t('controls.vehicleProfile')}>
        <CarBatteryIcon />
      </button>
      <button className="icon-btn" onClick={toggleHeadingMode}
        title={headingMode === 'course-up' ? t('controls.courseUp') : t('controls.northUp')}
        aria-label={headingMode === 'course-up' ? t('controls.courseUp') : t('controls.northUp')}
        style={{ position: 'relative' }}>
        {headingMode === 'course-up' ? <CourseUpIcon /> : <NorthUpIcon />}
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
      {/* Secondary: hidden on Tesla small screens (< 700px) to free space for larger buttons */}
      <div className="left-ctrl-secondary" style={{ display: 'contents' }}>
        <button className="icon-btn" onClick={openLockSoundModal}
          title="Tesla Lock Sounds" aria-label="Tesla Lock Sounds">
          <BellIcon />
        </button>
        <button className="icon-btn" onClick={openVoiceAssistant}
          title="TesRadar AI" aria-label="TesRadar AI — voice assistant"
          style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
          <MicButtonIcon />
          <span style={{ fontSize: 9, fontWeight: 700, opacity: 0.65, letterSpacing: '0.05em', lineHeight: 1, textTransform: 'uppercase' }}>
            AI voice
          </span>
        </button>
      </div>
    </div>
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


function BellIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
      <path d="M13.73 21a2 2 0 0 1-3.46 0" />
    </svg>
  )
}

// Compass needle pointing north — shown when in north-up mode (click → course-up)
function NorthUpIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="9" />
      <polygon points="12,5 14.5,12 12,10.5 9.5,12" fill="currentColor" stroke="none" />
      <polygon points="12,19 14.5,12 12,13.5 9.5,12" fill="currentColor" opacity="0.35" stroke="none" />
      <line x1="12" y1="3" x2="12" y2="5" />
      <text x="12" y="4.5" textAnchor="middle" fontSize="3.5" fontWeight="700"
        fill="currentColor" stroke="none" dominantBaseline="middle">N</text>
    </svg>
  )
}

// Rotating arrows around map — shown when in course-up mode (click → north-up)
function CourseUpIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {/* Rotation arc */}
      <path d="M12 3 A9 9 0 0 1 21 12" />
      <polyline points="21,8 21,12 17,12" />
      {/* Up arrow in center */}
      <line x1="12" y1="8" x2="12" y2="17" />
      <polyline points="9,11 12,8 15,11" />
    </svg>
  )
}


