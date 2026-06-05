// ─── Settings panel + gear trigger ─────────────────────────────────────────
// The gear button lives in RightControls (calls uiStore.toggleSettings).
// This component renders the backdrop + panel overlay, mounted in App.tsx.

import { useSyncExternalStore } from 'react'
import { uiStore } from '@/features/settings/uiStore'
import { useThemeStore } from '@/features/theme/store'
import { settingsStore } from '@/features/settings/settingsStore'
import { roadworksStore } from '@/features/roadworks/roadworksStore'
import { evStore } from '@/features/ev/evStore'
import { openCountryPicker } from '@/components/CountryPicker'
import { countryStore } from '@/lib/countryStore'
import { langStore, getLang, t } from '@/lib/locale'

const FB_GROUP_URL = 'https://www.facebook.com/groups/1496658052161240'

export function SettingsPanel() {
  useSyncExternalStore(langStore.subscribe, langStore.getLang, langStore.getLang)

  const { settingsOpen } = useSyncExternalStore(
    uiStore.subscribe,
    uiStore.getState,
    uiStore.getState,
  )

  if (!settingsOpen) return null

  return (
    <>
      {/* Backdrop — tap outside to close */}
      <div
        style={{ position: 'absolute', inset: 0, zIndex: 450 }}
        onClick={uiStore.closeSettings}
      />

      {/* Panel */}
      <PanelContent />
    </>
  )
}

function PanelContent() {
  useSyncExternalStore(langStore.subscribe, langStore.getLang, langStore.getLang)

  const showTraffic = useSyncExternalStore(
    settingsStore.subscribe.bind(settingsStore),
    () => settingsStore.get().showTraffic,
    () => false,
  )
  const { visible: showRoadworks } = useSyncExternalStore(
    roadworksStore.subscribe,
    roadworksStore.getState,
    roadworksStore.getState,
  )
  const { markersVisible: showEV } = useSyncExternalStore(
    evStore.subscribe,
    evStore.getState,
    evStore.getState,
  )
  const { theme, mapMode, toggleNight, toggleSatellite } = useThemeStore()
  const isNight     = theme === 'dark' && mapMode === 'normal'
  const isSatellite = mapMode === 'satellite'

  const countryFlag = useSyncExternalStore(
    langStore.subscribe,
    () => {
      const code = countryStore.getCode()
      if (code === 'BG' && getLang() === 'en') return '🇬🇧'
      return countryStore.getCountryOrDefault().flag
    },
    () => countryStore.getCountryOrDefault().flag,
  )

  const { showRightControls, showClock } = useSyncExternalStore(
    uiStore.subscribe,
    uiStore.getState,
    uiStore.getState,
  )

  function handleCountry() {
    uiStore.closeSettings()
    openCountryPicker()
  }

  return (
    <div
      onClick={(e) => e.stopPropagation()}
      style={{
        position:   'absolute',
        right:      88,
        top:        '50%',
        transform:  'translateY(-50%)',
        zIndex:     460,
        width:      300,
        background: 'rgba(12,12,20,0.97)',
        border:     '1px solid rgba(255,255,255,0.12)',
        borderRadius: 16,
        overflow:   'hidden',
      }}
    >
      {/* Header */}
      <div style={{
        padding:       '14px 20px 10px',
        fontSize:      12,
        fontWeight:    700,
        color:         'rgba(255,255,255,0.35)',
        letterSpacing: '0.12em',
        textTransform: 'uppercase',
        borderBottom:  '1px solid rgba(255,255,255,0.08)',
      }}>
        {t('settings.title')}
      </div>

      {/* Traffic */}
      <Row
        icon={<TrafficIcon active={showTraffic} />}
        label={t('settings.traffic')}
        state={showTraffic}
        onToggle={() => settingsStore.toggleTraffic()}
      />

      {/* EV Stations */}
      <Row
        icon={<EVIcon active={showEV} />}
        label={t('settings.evStations')}
        state={showEV}
        stateColor="#22c55e"
        onToggle={() => evStore.toggleMarkersVisible()}
      />

      {/* Roadworks */}
      <Row
        icon={<RoadworksIcon active={showRoadworks} />}
        label={t('settings.roadworks')}
        state={showRoadworks}
        stateColor="#f97316"
        onToggle={() => roadworksStore.toggle()}
      />

      {/* Night / Day mode */}
      <Row
        icon={isNight ? <SunIcon /> : <MoonIcon />}
        label={isNight ? t('settings.dayMode') : t('settings.nightMode')}
        state={isNight}
        onToggle={toggleNight}
      />

      {/* Satellite */}
      <Row
        icon={isSatellite ? <GridIcon /> : <GlobeIcon />}
        label={isSatellite ? t('settings.standardMap') : t('settings.satellite')}
        state={isSatellite}
        stateColor="#2b7fff"
        onToggle={toggleSatellite}
      />

      {/* Country picker */}
      <Row
        icon={<span style={{ fontSize: 22, lineHeight: 1 }}>{countryFlag}</span>}
        label={t('settings.country')}
        onToggle={handleCountry}
      />

      {/* Facebook */}
      <a
        href={FB_GROUP_URL}
        target="_blank"
        rel="noopener noreferrer"
        style={{ display: 'block', textDecoration: 'none', color: 'inherit' }}
        onClick={uiStore.closeSettings}
      >
        <Row
          icon={<FacebookIcon />}
          label={t('settings.facebook')}
        />
      </a>

      {/* Divider */}
      <div style={{ height: 1, background: 'rgba(255,255,255,0.08)', margin: '4px 0' }} />

      {/* Show right panel */}
      <Row
        icon={<PanelIcon />}
        label={t('settings.showRightPanel')}
        state={showRightControls}
        onToggle={uiStore.toggleRightControls}
      />

      {/* Show clock */}
      <Row
        icon={<ClockIcon />}
        label={t('settings.showClock')}
        state={showClock}
        onToggle={uiStore.toggleClock}
      />
    </div>
  )
}

// ── Row ──────────────────────────────────────────────────────────────────────

function Row({
  icon, label, state, stateColor = '#22c55e', onToggle,
}: {
  icon:        React.ReactNode
  label:       string
  state?:      boolean
  stateColor?: string
  onToggle?:   () => void
}) {
  return (
    <button
      onClick={onToggle}
      style={{
        width:        '100%',
        display:      'flex',
        alignItems:   'center',
        gap:          14,
        padding:      '0 20px',
        height:       56,
        background:   'none',
        border:       'none',
        borderBottom: '1px solid rgba(255,255,255,0.05)',
        cursor:       'pointer',
        color:        '#fff',
        touchAction:  'manipulation',
        textAlign:    'left',
      }}
    >
      <span style={{
        width: 28, display: 'flex', alignItems: 'center',
        justifyContent: 'center', flexShrink: 0, opacity: 0.65,
      }}>
        {icon}
      </span>
      <span style={{ flex: 1, fontSize: 15, fontWeight: 500 }}>
        {label}
      </span>
      {state !== undefined && (
        <span style={{
          width: 36, height: 20, borderRadius: 10, flexShrink: 0, position: 'relative',
          background: state ? stateColor : 'rgba(255,255,255,0.18)',
        }}>
          <span style={{
            position: 'absolute', top: 3,
            left: state ? 19 : 3,
            width: 14, height: 14, borderRadius: '50%', background: '#fff',
          }} />
        </span>
      )}
    </button>
  )
}

// ── Icons ────────────────────────────────────────────────────────────────────

function TrafficIcon({ active }: { active: boolean }) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="8" y="2" width="8" height="20" rx="2" strokeWidth="1.5" />
      <circle cx="12" cy="7"  r="2" fill={active ? '#ef4444' : 'currentColor'} stroke="none" opacity={active ? 1 : 0.3} />
      <circle cx="12" cy="12" r="2" fill={active ? '#eab308' : 'currentColor'} stroke="none" opacity={active ? 1 : 0.3} />
      <circle cx="12" cy="17" r="2" fill={active ? '#22c55e' : 'currentColor'} stroke="none" opacity={active ? 1 : 0.3} />
    </svg>
  )
}

function RoadworksIcon({ active }: { active: boolean }) {
  const c = active ? '#f97316' : 'currentColor'
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none"
      stroke={c} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"
        fill={active ? '#f9731622' : 'none'} />
      <line x1="12" y1="9" x2="12" y2="13" strokeWidth="2.5" stroke={c} />
      <circle cx="12" cy="17" r="0.5" fill={c} stroke={c} strokeWidth="1.5" />
    </svg>
  )
}

function MoonIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
    </svg>
  )
}

function SunIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="5" />
      <line x1="12" y1="1" x2="12" y2="3" />
      <line x1="12" y1="21" x2="12" y2="23" />
      <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
      <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
      <line x1="1" y1="12" x2="3" y2="12" />
      <line x1="21" y1="12" x2="23" y2="12" />
      <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
      <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
    </svg>
  )
}

function GlobeIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="10" />
      <line x1="2" y1="12" x2="22" y2="12" />
      <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
    </svg>
  )
}

function GridIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <path d="M3 9h18M3 15h18M9 3v18M15 3v18" />
    </svg>
  )
}

function FacebookIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M24 12.073C24 5.405 18.627 0 12 0S0 5.405 0 12.073C0 18.1 4.388 23.094 10.125 24v-8.437H7.078v-3.49h3.047V9.41c0-3.025 1.792-4.697 4.533-4.697 1.313 0 2.686.236 2.686.236v2.97h-1.513c-1.491 0-1.956.93-1.956 1.886v2.268h3.328l-.532 3.49h-2.796V24C19.612 23.094 24 18.1 24 12.073z"/>
    </svg>
  )
}

function PanelIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="2" y="3" width="20" height="18" rx="2" />
      <line x1="16" y1="3" x2="16" y2="21" />
    </svg>
  )
}

function EVIcon({ active }: { active: boolean }) {
  const c = active ? '#22c55e' : 'currentColor'
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none"
      stroke={c} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M5 18H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h3.19M15 6h2a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-3.19"
        fill={active ? '#22c55e18' : 'none'} />
      <line x1="23" y1="13" x2="23" y2="11" />
      <polyline points="11 6 7 12 13 12 9 18" stroke={c} strokeWidth="2.2" />
    </svg>
  )
}

function ClockIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="10" />
      <polyline points="12 6 12 12 16 14" />
    </svg>
  )
}
