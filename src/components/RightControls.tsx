// ─── Right-side vertical control strip ─────────────────────────────────
// Theme toggle + satellite toggle + country picker.
// Gear button (always visible) opens the settings panel.
// The 6 action buttons can be hidden via the settings panel.
import { useSyncExternalStore, useState, useCallback, useRef } from 'react'
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

  // Transient labels — show for 3s after toggle
  const [trafficLabel, setTrafficLabel]   = useState<string | null>(null)
  const [roadworksLabel, setRoadworksLabel] = useState<string | null>(null)
  const trafficTimer   = useRef<ReturnType<typeof setTimeout> | null>(null)
  const roadworksTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const isBg = getLang() === 'bg'

  const handleTraffic = useCallback(() => {
    settingsStore.toggleTraffic()
    const next = !showTraffic
    setTrafficLabel(next
      ? (isBg ? 'Трафик показан'  : 'Traffic shown')
      : (isBg ? 'Трафик скрит'   : 'Traffic hidden'))
    if (trafficTimer.current) clearTimeout(trafficTimer.current)
    trafficTimer.current = setTimeout(() => setTrafficLabel(null), 3000)
  }, [showTraffic, isBg])

  const handleRoadworks = useCallback(() => {
    roadworksStore.toggle()
    const next = !showRoadworks
    setRoadworksLabel(next
      ? (isBg ? 'Затворени пътища показани' : 'Road closures shown')
      : (isBg ? 'Затворени пътища скрити'   : 'Road closures hidden'))
    if (roadworksTimer.current) clearTimeout(roadworksTimer.current)
    roadworksTimer.current = setTimeout(() => setRoadworksLabel(null), 3000)
  }, [showRoadworks, isBg])

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
          <div style={{ position: 'relative' }}>
            <button
              className="icon-btn"
              onClick={handleTraffic}
              title={showTraffic ? 'Hide traffic' : 'Show traffic'}
              aria-label={showTraffic ? 'Hide traffic' : 'Show traffic'}
              aria-pressed={showTraffic}
              style={{ width: 63, height: 63, color: showTraffic ? '#22c55e' : undefined }}
            >
              <TrafficIcon active={showTraffic} />
            </button>
            {trafficLabel && (
              <div style={{
                position: 'absolute', right: 71, top: '50%', transform: 'translateY(-50%)',
                background: 'rgba(12,12,20,0.93)', border: '1px solid rgba(255,255,255,0.15)',
                borderRadius: 8, padding: '5px 10px',
                fontSize: 12, fontWeight: 600, color: '#22c55e',
                whiteSpace: 'nowrap', pointerEvents: 'none',
              }}>
                {trafficLabel}
              </div>
            )}
          </div>

          <div style={{ position: 'relative' }}>
            <button
              className="icon-btn"
              onClick={handleRoadworks}
              title={showRoadworks ? 'Hide road closures' : 'Show road closures'}
              aria-label={showRoadworks ? 'Hide road closures' : 'Show road closures'}
              aria-pressed={showRoadworks}
              style={{ width: 63, height: 63, color: showRoadworks ? '#f97316' : undefined }}
            >
              {rwStatus === 'loading' ? <RoadworksLoadingIcon /> : <ClosedRoadIcon active={showRoadworks} />}
            </button>
            {roadworksLabel && (
              <div style={{
                position: 'absolute', right: 71, top: '50%', transform: 'translateY(-50%)',
                background: 'rgba(12,12,20,0.93)', border: '1px solid rgba(255,255,255,0.15)',
                borderRadius: 8, padding: '5px 10px',
                fontSize: 12, fontWeight: 600, color: '#f97316',
                whiteSpace: 'nowrap', pointerEvents: 'none',
              }}>
                {roadworksLabel}
              </div>
            )}
          </div>
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

function ClosedRoadIcon({ active }: { active: boolean }) {
  const c  = active ? '#f97316' : 'currentColor'
  const bg = active ? '#f9731622' : 'none'
  return (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      {/* Road surface */}
      <rect x="2" y="10" width="20" height="6" rx="1"
        fill={bg} stroke={c} strokeWidth="1.6" />
      {/* Center dashes */}
      <line x1="5" y1="13" x2="7" y2="13" stroke={c} strokeWidth="1.2" strokeDasharray="2 1.5" />
      <line x1="10" y1="13" x2="14" y2="13" stroke={c} strokeWidth="1.2" strokeDasharray="2 1.5" />
      <line x1="17" y1="13" x2="19" y2="13" stroke={c} strokeWidth="1.2" strokeDasharray="2 1.5" />
      {/* Barrier — red/orange X across the road */}
      <line x1="3" y1="8" x2="21" y2="18" stroke={c} strokeWidth="2.2" strokeLinecap="round" />
      <line x1="21" y1="8" x2="3" y2="18" stroke={c} strokeWidth="2.2" strokeLinecap="round" />
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
