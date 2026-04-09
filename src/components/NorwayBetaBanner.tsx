// ─── Norway Beta Banner ───────────────────────────────────────────────
// Shown at the top of the map when Norway (NO) is the active country.
// Informs the user that Norwegian support is still in early development.
// Dismissible for the session (sessionStorage flag).

import { useSyncExternalStore, useState } from 'react'
import { countryStore } from '@/lib/countryStore'

const SESSION_KEY = 'teslaradar:no-banner-dismissed'

export function NorwayBetaBanner() {
  const country = useSyncExternalStore(
    countryStore.subscribe.bind(countryStore),
    () => countryStore.getCode(),
    () => countryStore.getCode(),
  )

  const [dismissed, setDismissed] = useState(
    () => typeof sessionStorage !== 'undefined' && !!sessionStorage.getItem(SESSION_KEY)
  )

  if (country !== 'NO' || dismissed) return null

  function dismiss() {
    try { sessionStorage.setItem(SESSION_KEY, '1') } catch { /* ignore */ }
    setDismissed(true)
  }

  return (
    <div
      style={{
        position:   'absolute',
        top:        12,
        left:       '50%',
        transform:  'translateX(-50%)',
        zIndex:     490,
        width:      'min(322px, calc(100vw - 24px))',
        padding:    '7px 10px',
        borderRadius: 8,
        background: 'rgba(245,158,11,0.15)',
        border:     '1px solid rgba(245,158,11,0.4)',
        display:    'flex',
        alignItems: 'center',
        gap:        10,
        backdropFilter: 'blur(8px)',
        WebkitBackdropFilter: 'blur(8px)',
      }}
    >
      <span style={{ fontSize: 13, flexShrink: 0 }}>🚧</span>
      <span style={{ flex: 1, fontSize: 11, color: 'rgba(30,20,0,0.85)', lineHeight: 1.4 }}>
        Norway support is in early development. Some features may be limited or unavailable.
      </span>
      <button
        onClick={dismiss}
        aria-label="Dismiss"
        style={{
          flexShrink: 0,
          background: 'none',
          border:     'none',
          color:      'rgba(30,20,0,0.6)',
          cursor:     'pointer',
          fontSize:   17,
          lineHeight: 1,
          padding:    '0 2px',
        }}
      >
        ×
      </button>
    </div>
  )
}
