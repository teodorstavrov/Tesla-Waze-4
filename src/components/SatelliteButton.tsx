// ─── Satellite / normal map toggle ────────────────────────────────────
import { useThemeStore } from '@/features/theme/store'

export function SatelliteButton() {
  const { mapMode, toggleSatellite } = useThemeStore()
  const isSat = mapMode === 'satellite'

  return (
    <button
      className={`icon-btn${isSat ? ' active' : ''}`}
      onClick={toggleSatellite}
      title={isSat ? 'Switch to map view' : 'Switch to satellite view'}
      aria-label="Toggle satellite view"
      aria-pressed={isSat}
    >
      <GlobeIcon />
    </button>
  )
}

function GlobeIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="10" />
      <line x1="2" y1="12" x2="22" y2="12" />
      <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
    </svg>
  )
}
