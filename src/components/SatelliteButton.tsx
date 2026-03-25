// ─── Satellite / normal map toggle ────────────────────────────────────
import { useThemeStore } from '@/features/theme/store'

export function SatelliteButton() {
  const { mapMode, toggleSatellite } = useThemeStore()
  const isSat = mapMode === 'satellite'

  return (
    <button
      className={`icon-btn${isSat ? ' active' : ''}`}
      onClick={toggleSatellite}
      title={isSat ? 'Стандартна карта' : 'Сателитен изглед'}
      aria-label={isSat ? 'Превключи към стандартна карта' : 'Превключи към сателитен изглед'}
      aria-pressed={isSat}
    >
      {isSat ? <MapIcon /> : <SatelliteIcon />}
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

function MapIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <polygon points="3 6 9 3 15 6 21 3 21 18 15 21 9 18 3 21" />
      <line x1="9" y1="3" x2="9" y2="18" />
      <line x1="15" y1="6" x2="15" y2="21" />
    </svg>
  )
}
