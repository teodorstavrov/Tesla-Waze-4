// ─── Right-side vertical control strip ─────────────────────────────────
// Theme toggle + satellite toggle + country picker.
// Gear button (always visible) opens the settings panel.
// The 6 action buttons can be hidden via the settings panel.
import { useSyncExternalStore } from 'react'
import { ThemeToggle } from '@/components/ThemeToggle'
import { SatelliteButton } from '@/components/SatelliteButton'
import { openCountryPicker } from '@/components/CountryPicker'
import { countryStore } from '@/lib/countryStore'
import { langStore, getLang } from '@/lib/locale'
import { settingsStore } from '@/features/settings/settingsStore'
import { roadworksStore } from '@/features/roadworks/roadworksStore'
import { uiStore } from '@/features/settings/uiStore'

const FB_GROUP_URL = 'https://www.facebook.com/groups/1496658052161240'

function _pickerIcon(): string {
  const code = countryStore.getCode()
  if (code === 'BG' && getLang() === 'en') return '🇬🇧'
  return countryStore.getCountryOrDefault().flag
}

export function RightControls() {
  useSyncExternalStore(langStore.subscribe.bind(langStore), _pickerIcon, _pickerIcon)

  const countryFlag = useSyncExternalStore(
    langStore.subscribe.bind(langStore),
    _pickerIcon,
    _pickerIcon,
  )
  const showTraffic = useSyncExternalStore(
    settingsStore.subscribe.bind(settingsStore),
    () => settingsStore.get().showTraffic,
    () => false,
  )
  const { visible: showRoadworks, status: rwStatus } = useSyncExternalStore(
    roadworksStore.subscribe,
    roadworksStore.getState,
    roadworksStore.getState,
  )
  const { showRightControls, settingsOpen } = useSyncExternalStore(
    uiStore.subscribe,
    uiStore.getState,
    uiStore.getState,
  )

  return (
    <div
      className="right-controls"
      style={{
        position:      'absolute',
        right:         12,
        top:           '50%',
        transform:     'translateY(-50%)',
        zIndex:        400,
        display:       'flex',
        flexDirection: 'column',
        gap:           8,
        alignItems:    'center',
      }}
    >
      {/* Action buttons — conditionally visible */}
      {showRightControls && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, opacity: 0.5 }}>
          <button
            className="icon-btn"
            onClick={() => settingsStore.toggleTraffic()}
            title={showTraffic ? 'Hide traffic' : 'Show traffic'}
            aria-label={showTraffic ? 'Hide traffic' : 'Show traffic'}
            aria-pressed={showTraffic}
            style={{ width: 63, height: 63, color: showTraffic ? '#22c55e' : undefined }}
          >
            <TrafficIcon active={showTraffic} />
          </button>
          <button
            className="icon-btn"
            onClick={() => roadworksStore.toggle()}
            title={showRoadworks ? 'Hide road closures' : 'Show road closures'}
            aria-label={showRoadworks ? 'Hide road closures' : 'Show road closures'}
            aria-pressed={showRoadworks}
            style={{ width: 63, height: 63, color: showRoadworks ? '#f97316' : undefined }}
          >
            {rwStatus === 'loading' ? <RoadworksLoadingIcon /> : <RoadworksIcon active={showRoadworks} />}
          </button>
          <ThemeToggle />
          <SatelliteButton />
          <button
            className="icon-btn"
            onClick={openCountryPicker}
            title="Switch country"
            aria-label="Switch country"
            style={{ width: 63, height: 63, fontSize: 29, lineHeight: 1 }}
          >
            {countryFlag}
          </button>
          <a
            href={FB_GROUP_URL}
            target="_blank"
            rel="noopener noreferrer"
            title="TesRadar Facebook група"
            aria-label="TesRadar Facebook група"
            className="icon-btn"
            style={{ width: 63, height: 63, display: 'flex', alignItems: 'center', justifyContent: 'center', textDecoration: 'none', color: 'inherit' }}
          >
            <FacebookIcon />
          </a>
        </div>
      )}

      {/* Gear — always visible */}
      <button
        className="icon-btn"
        onClick={uiStore.toggleSettings}
        title="Settings"
        aria-label="Settings"
        style={{
          width:   63,
          height:  63,
          opacity: settingsOpen ? 1 : 0.5,
          background: settingsOpen ? 'rgba(255,255,255,0.15)' : undefined,
        }}
      >
        <GearIcon />
      </button>
    </div>
  )
}

function RoadworksIcon({ active }: { active: boolean }) {
  const c = active ? '#f97316' : 'currentColor'
  return (
    <svg width="26" height="26" viewBox="0 0 24 24" fill="none"
      stroke={c} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"
        fill={active ? '#f9731622' : 'none'} />
      <line x1="12" y1="9" x2="12" y2="13" strokeWidth="2.5" stroke={c} />
      <circle cx="12" cy="17" r="0.5" fill={c} stroke={c} strokeWidth="1.5" />
    </svg>
  )
}

function RoadworksLoadingIcon() {
  return (
    <svg width="26" height="26" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2" strokeLinecap="round"
      style={{ animation: 'spin 0.8s linear infinite' }} aria-hidden="true">
      <path d="M21 12a9 9 0 1 1-6.219-8.56" />
    </svg>
  )
}

function TrafficIcon({ active }: { active: boolean }) {
  return (
    <svg width="26" height="26" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="8" y="2" width="8" height="20" rx="2" strokeWidth="1.5" />
      <circle cx="12" cy="7"  r="2" fill={active ? '#ef4444' : 'currentColor'} stroke="none" opacity={active ? 1 : 0.3} />
      <circle cx="12" cy="12" r="2" fill={active ? '#eab308' : 'currentColor'} stroke="none" opacity={active ? 1 : 0.3} />
      <circle cx="12" cy="17" r="2" fill={active ? '#22c55e' : 'currentColor'} stroke="none" opacity={active ? 1 : 0.3} />
    </svg>
  )
}

function FacebookIcon() {
  return (
    <svg width="26" height="26" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M24 12.073C24 5.405 18.627 0 12 0S0 5.405 0 12.073C0 18.1 4.388 23.094 10.125 24v-8.437H7.078v-3.49h3.047V9.41c0-3.025 1.792-4.697 4.533-4.697 1.313 0 2.686.236 2.686.236v2.97h-1.513c-1.491 0-1.956.93-1.956 1.886v2.268h3.328l-.532 3.49h-2.796V24C19.612 23.094 24 18.1 24 12.073z"/>
    </svg>
  )
}

function GearIcon() {
  return (
    <svg width="26" height="26" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  )
}
