// ─── Left-side vertical control strip ─────────────────────────────────
// Includes zoom controls (moved from right side).
import { useSyncExternalStore } from 'react'
import { LocationButton } from '@/components/LocationButton'
import { getMap } from '@/components/MapShell'
import { openVoiceAssistant, MicButtonIcon } from '@/features/voice/VoiceAssistant'
import { openVehicleProfileModal } from '@/components/VehicleProfileModal'
import { openPricingModal } from '@/components/PricingModal'
import { langStore, t, getLang } from '@/lib/locale'
import { isPremiumEnabled } from '@/lib/featureFlags'
import { settingsStore, PITCH_STEP, PITCH_MIN, PITCH_MAX } from '@/features/settings/settingsStore'

export function LeftControls() {
  useSyncExternalStore(langStore.subscribe.bind(langStore), getLang, getLang)
  const headingMode = useSyncExternalStore(
    settingsStore.subscribe.bind(settingsStore),
    () => settingsStore.get().headingMode,
    () => settingsStore.get().headingMode,
  )
  const mapPitch = useSyncExternalStore(
    settingsStore.subscribe.bind(settingsStore),
    () => settingsStore.get().mapPitch,
    () => 0,
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
      <button
        className="icon-btn"
        onClick={() => settingsStore.setMapPitch(mapPitch + PITCH_STEP)}
        disabled={mapPitch >= PITCH_MAX}
        title={t('controls.tiltUp')}
        aria-label={t('controls.tiltUp')}
        style={{ opacity: mapPitch >= PITCH_MAX ? 0.3 : 1 }}
      >
        <TiltUpIcon />
      </button>
      <button
        className="icon-btn"
        onClick={() => settingsStore.setMapPitch(mapPitch - PITCH_STEP)}
        disabled={mapPitch <= PITCH_MIN}
        title={t('controls.tiltDown')}
        aria-label={t('controls.tiltDown')}
        style={{ opacity: mapPitch <= PITCH_MIN ? 0.3 : 1 }}
      >
        <TiltDownIcon />
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


// Perspective grid — tilt up (more 3D)
function TiltUpIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
      {/* Horizon lines converging — wider at bottom, narrower at top */}
      <line x1="10" y1="7"  x2="14" y2="7"  />
      <line x1="7"  y1="12" x2="17" y2="12" />
      <line x1="4"  y1="17" x2="20" y2="17" />
      {/* Side edges forming trapezoid */}
      <line x1="10" y1="7"  x2="4"  y2="17" />
      <line x1="14" y1="7"  x2="20" y2="17" />
      {/* Up arrow top-right */}
      <polyline points="19,4 21,2 23,4" strokeWidth="1.5" />
      <line x1="21" y1="2" x2="21" y2="6" strokeWidth="1.5" />
    </svg>
  )
}

// Flat grid — tilt down (more top-down)
function TiltDownIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
      {/* Equal horizontal lines — flat top-down view */}
      <line x1="4" y1="8"  x2="20" y2="8"  />
      <line x1="4" y1="13" x2="20" y2="13" />
      <line x1="4" y1="18" x2="20" y2="18" />
      {/* Vertical sides */}
      <line x1="4"  y1="8" x2="4"  y2="18" />
      <line x1="20" y1="8" x2="20" y2="18" />
      {/* Down arrow top-right */}
      <polyline points="19,2 21,4 23,2" strokeWidth="1.5" />
      <line x1="21" y1="4" x2="21" y2="0" strokeWidth="1.5" />
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


