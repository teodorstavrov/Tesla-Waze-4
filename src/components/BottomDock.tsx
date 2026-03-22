// ─── Bottom-center action dock ─────────────────────────────────────────
// Phase 1+2: visual shell. Report action, EV panel, and route picker
// wired in later phases.

export function BottomDock() {
  return (
    <div style={{
      position: 'absolute',
      bottom: 24,
      left: '50%',
      transform: 'translateX(-50%)',
      zIndex: 400,
      display: 'flex',
      gap: 10,
      alignItems: 'center',
    }}>
      {/* EV Stations */}
      <button className="icon-btn" style={{ width: 52, height: 52 }}
        title="EV Charging Stations" aria-label="EV stations panel">
        <EVIcon />
      </button>

      {/* Report — primary CTA */}
      <button
        aria-label="Report a road event"
        title="Report"
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          padding: '0 22px',
          height: 52,
          borderRadius: 26,
          background: '#e31937',
          border: 'none',
          color: '#fff',
          fontSize: 14,
          fontWeight: 700,
          letterSpacing: '0.04em',
          cursor: 'pointer',
          boxShadow: '0 4px 20px rgba(227,25,55,0.4)',
          touchAction: 'manipulation',
        }}
        onPointerDown={(e) => { (e.currentTarget as HTMLButtonElement).style.transform = 'scale(0.96)' }}
        onPointerUp={(e) => { (e.currentTarget as HTMLButtonElement).style.transform = '' }}
        onPointerLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.transform = '' }}
      >
        <AlertIcon />
        Report
      </button>

      {/* Route */}
      <button className="icon-btn" style={{ width: 52, height: 52 }}
        title="Route planning" aria-label="Route planning">
        <RouteIcon />
      </button>
    </div>
  )
}

function EVIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M13 2L4.5 13.5H11L10 22L19.5 10.5H13L13 2Z" />
    </svg>
  )
}

function AlertIcon() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
      <line x1="12" y1="9" x2="12" y2="13" />
      <line x1="12" y1="17" x2="12.01" y2="17" />
    </svg>
  )
}

function RouteIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="5" cy="6" r="2" />
      <circle cx="19" cy="18" r="2" />
      <path d="M5 8v3a3 3 0 0 0 3 3h8a3 3 0 0 1 3 3v1" />
    </svg>
  )
}
