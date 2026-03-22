// ─── Search bar shell ──────────────────────────────────────────────────
// Phase 1+2: visual shell with open/close behavior.
// Geocoding + EV search wired in Phase 7.

import { useState } from 'react'

export function SearchBar() {
  const [open, setOpen] = useState(false)

  return (
    <div
      style={{
        position: 'absolute',
        top: 12,
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 400,
        width: open ? 320 : 'auto',
        transition: 'width 0.18s ease',
      }}
    >
      {!open
        ? (
          <button
            className="icon-btn"
            onClick={() => { setOpen(true) }}
            aria-label="Open search"
            title="Search"
          >
            <SearchIcon />
          </button>
        )
        : (
          <div
            className="glass"
            style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 10px' }}
          >
            <SearchIcon style={{ color: 'var(--text-secondary)', flexShrink: 0 }} />
            <input
              autoFocus
              type="text"
              placeholder="Search location or charging station…"
              style={{
                flex: 1,
                background: 'transparent',
                border: 'none',
                outline: 'none',
                color: 'var(--text-primary)',
                fontSize: 14,
                padding: '4px 0',
                minWidth: 0,
              }}
              onBlur={() => { setOpen(false) }}
            />
            <button
              onClick={() => { setOpen(false) }}
              aria-label="Close search"
              style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', padding: 4, lineHeight: 1, flexShrink: 0 }}
            >
              ✕
            </button>
          </div>
        )
      }
    </div>
  )
}

function SearchIcon({ style }: { style?: React.CSSProperties }) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
      style={style} aria-hidden="true">
      <circle cx="11" cy="11" r="8" />
      <line x1="21" y1="21" x2="16.65" y2="16.65" />
    </svg>
  )
}
