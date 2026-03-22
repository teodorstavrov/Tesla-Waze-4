// ─── Custom zoom controls ──────────────────────────────────────────────
// 44px minimum touch targets — Tesla touchscreen safe.
// Leaflet's built-in zoom is hidden via CSS.

import { getMap } from '@/components/MapShell'

export function ZoomControls() {
  return (
    <div style={{
      position: 'absolute',
      right: 12,
      top: '50%',
      transform: 'translateY(-50%)',
      zIndex: 400,
      display: 'flex',
      flexDirection: 'column',
      gap: 6,
    }}>
      <button className="icon-btn" onClick={() => { getMap()?.zoomIn(1) }}
        title="Zoom in" aria-label="Zoom in">
        <PlusIcon />
      </button>
      <button className="icon-btn" onClick={() => { getMap()?.zoomOut(1) }}
        title="Zoom out" aria-label="Zoom out">
        <MinusIcon />
      </button>
    </div>
  )
}

function PlusIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden="true">
      <line x1="12" y1="5" x2="12" y2="19" />
      <line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  )
}

function MinusIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden="true">
      <line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  )
}
