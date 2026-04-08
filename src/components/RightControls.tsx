// ─── Right-side vertical control strip ─────────────────────────────────
// Theme toggle + satellite toggle + country picker.
// Buttons are 10% larger than standard (48px) and 50% opaque.
import { useSyncExternalStore } from 'react'
import { ThemeToggle } from '@/components/ThemeToggle'
import { SatelliteButton } from '@/components/SatelliteButton'
import { openCountryPicker } from '@/components/CountryPicker'
import { countryStore } from '@/lib/countryStore'
import { langStore } from '@/lib/locale'

export function RightControls() {
  const countryFlag = useSyncExternalStore(
    langStore.subscribe.bind(langStore),
    () => countryStore.getCountryOrDefault().flag,
    () => countryStore.getCountryOrDefault().flag,
  )

  return (
    <div
      className="right-controls"
      style={{
        position: 'absolute',
        right: 12,
        top: '50%',
        transform: 'translateY(-50%)',
        zIndex: 400,
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
        opacity: 0.5,
      }}
    >
      <ThemeToggle />
      <SatelliteButton />
      <button
        className="icon-btn"
        onClick={openCountryPicker}
        title="Switch country"
        aria-label="Switch country"
        style={{ width: 48, height: 48, fontSize: 22, lineHeight: 1 }}
      >
        {countryFlag}
      </button>
    </div>
  )
}
