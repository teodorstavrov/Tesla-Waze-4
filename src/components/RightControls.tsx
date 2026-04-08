// ─── Right-side vertical control strip ─────────────────────────────────
// Night mode toggle + satellite toggle — smaller (44px) buttons on right side.
import { ThemeToggle } from '@/components/ThemeToggle'
import { SatelliteButton } from '@/components/SatelliteButton'

export function RightControls() {
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
      }}
    >
      <ThemeToggle />
      <SatelliteButton />
    </div>
  )
}
