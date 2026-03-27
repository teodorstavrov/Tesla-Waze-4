// ─── Left-side vertical control strip ─────────────────────────────────
// Includes zoom controls (moved from right side).
import { ThemeToggle } from '@/components/ThemeToggle'
import { SatelliteButton } from '@/components/SatelliteButton'
import { LocationButton } from '@/components/LocationButton'
import { MuteButton } from '@/components/MuteButton'
import { getMap } from '@/components/MapShell'

export function LeftControls() {
  return (
    <div
      className="left-controls-xl"
      style={{
        position: 'absolute',
        left: 12,
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
      <MuteButton />
      <LocationButton />
      <div style={{ height: 1, background: 'var(--glass-border)', margin: '4px 0' }} />
      <button className="icon-btn" onClick={() => getMap()?.zoomIn(1)}
        title="Zoom in" aria-label="Zoom in">
        <PlusIcon />
      </button>
      <button className="icon-btn" onClick={() => getMap()?.zoomOut(1)}
        title="Zoom out" aria-label="Zoom out">
        <MinusIcon />
      </button>
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
