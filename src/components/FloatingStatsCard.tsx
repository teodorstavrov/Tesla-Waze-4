// ─── Top-right status card ─────────────────────────────────────────────
// Phase 1+2: static placeholders. Real data (EV count, event count, GPS
// accuracy) wired in later phases.

export function FloatingStatsCard() {
  return (
    <div
      className="glass"
      style={{
        position: 'absolute',
        top: 12,
        right: 12,
        zIndex: 400,
        padding: '8px 16px',
        display: 'flex',
        alignItems: 'center',
        gap: 18,
        userSelect: 'none',
        WebkitUserSelect: 'none',
      }}
    >
      <Stat label="Stations" value="—" />
      <Stat label="Events" value="—" />
      <Stat label="GPS" value="—" />
    </div>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ textAlign: 'center', minWidth: 34 }}>
      <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-primary)', lineHeight: 1.2 }}>
        {value}
      </div>
      <div style={{ fontSize: 9, color: 'var(--text-secondary)', letterSpacing: '0.07em', textTransform: 'uppercase', marginTop: 1 }}>
        {label}
      </div>
    </div>
  )
}
