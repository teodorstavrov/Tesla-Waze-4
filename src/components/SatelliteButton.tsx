// ─── Map style cycle button: normal → voyager → satellite → normal ─────
import { useSyncExternalStore } from 'react'
import { useThemeStore } from '@/features/theme/store'
import { langStore, t } from '@/lib/locale'

export function SatelliteButton() {
  // Re-render when language changes so title/aria-label update
  useSyncExternalStore(langStore.subscribe.bind(langStore), langStore.getLang, langStore.getLang)

  const { mapMode, toggleSatellite } = useThemeStore()
  const isActive = mapMode === 'satellite'

  const title    = isActive ? t('map.toVoyager')   : t('map.toSatellite')
  const ariaLabel = isActive ? t('map.toVoyager')  : t('map.toSatellite')

  return (
    <button
      className={`icon-btn${isActive ? ' active' : ''}`}
      onClick={toggleSatellite}
      title={title}
      aria-label={ariaLabel}
    >
      {mapMode === 'satellite' ? <VoyagerIcon /> : <SatelliteIcon />}
    </button>
  )
}

function SatelliteIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="10" />
      <line x1="2" y1="12" x2="22" y2="12" />
      <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
    </svg>
  )
}

function VoyagerIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <path d="M3 9h18M3 15h18M9 3v18M15 3v18" />
    </svg>
  )
}
