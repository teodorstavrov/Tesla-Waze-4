// ─── Left-side vertical control strip ─────────────────────────────────
import { ThemeToggle } from '@/components/ThemeToggle'
import { SatelliteButton } from '@/components/SatelliteButton'
import { LocationButton } from '@/components/LocationButton'
import { MuteButton } from '@/components/MuteButton'

export function LeftControls() {
  return (
    <div style={{
      position: 'absolute',
      left: 12,
      top: '50%',
      transform: 'translateY(-50%)',
      zIndex: 400,
      display: 'flex',
      flexDirection: 'column',
      gap: 8,
    }}>
      <ThemeToggle />
      <SatelliteButton />
      <MuteButton />
      <div style={{ marginTop: 4 }}>
        <LocationButton />
      </div>
    </div>
  )
}
