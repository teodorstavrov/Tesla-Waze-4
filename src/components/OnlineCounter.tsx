// ─── Real-time online user counter ─────────────────────────────────────
// Sends a POST heartbeat every 20s (session ID from sessionStorage).
// Shows a small green dot + count at bottom-left, very unobtrusive.
//
// TESLA MODE: always in DOM, GPU layer pre-allocated at startup.
// The `return null` pattern forces a compositor layer allocation when the
// first heartbeat arrives (~1-2s after page load) — this rebuilds the
// compositor layer tree and causes a visible map shake.
// Fix: always render; use visibility:hidden until count is available.
// translateZ(0) promotes the layer at load time so first appearance is free.

import { useState, useEffect, useRef } from 'react'
import { isTeslaBrowser } from '@/lib/browser'

const HEARTBEAT_MS = 20_000

function getSessionId(): string {
  const KEY = 'tesradar:sid'
  let sid = sessionStorage.getItem(KEY)
  if (!sid) {
    sid = crypto.randomUUID()
    sessionStorage.setItem(KEY, sid)
  }
  return sid
}

export function OnlineCounter() {
  const [count, setCount] = useState<number | null>(null)
  const sidRef = useRef<string | null>(null)

  useEffect(() => {
    sidRef.current = getSessionId()

    async function heartbeat() {
      try {
        const res = await fetch('/api/online', {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify({ sid: sidRef.current }),
        })
        if (res.ok) {
          const data = await res.json() as { count?: number }
          if (typeof data.count === 'number') setCount(data.count)
        }
      } catch {
        // network error — keep last known count
      }
    }

    heartbeat()
    const interval = setInterval(heartbeat, HEARTBEAT_MS)
    return () => clearInterval(interval)
  }, [])

  if (isTeslaBrowser) {
    // ── Tesla: always in DOM with GPU layer pre-allocated ─────────────────
    // visibility:hidden on unknown count → no layer churn when count arrives.
    // No boxShadow glow (forces rasterization every frame on old Chromium).
    // contain isolates repaints from the map layer.
    return (
      <div
        aria-label={count !== null ? `${count} users online` : undefined}
        style={{
          position:        'absolute',
          bottom:          10,
          left:            12,
          zIndex:          300,
          display:         'flex',
          alignItems:      'center',
          gap:             4,
          userSelect:      'none',
          WebkitUserSelect: 'none',
          pointerEvents:   'none',
          visibility:      count !== null ? 'visible' : 'hidden',
          transform:       'translateZ(0)',   // pre-promote GPU layer at startup
          contain:         'layout style paint' as React.CSSProperties['contain'],
        }}
      >
        <div style={{
          width:        6,
          height:       6,
          borderRadius: '50%',
          background:   '#22c55e',
          flexShrink:   0,
          // no box-shadow on Tesla — static glow forces rasterization
        }} />
        <span style={{
          fontSize:           10,
          fontWeight:         600,
          color:              'rgba(255,255,255,0.45)',
          fontVariantNumeric: 'tabular-nums',
          fontFamily:         'system-ui, sans-serif',
          lineHeight:         1,
        }}>
          {count ?? ''}
        </span>
      </div>
    )
  }

  // ── Standard browser: normal conditional render ──────────────────────
  if (count === null) return null

  return (
    <div
      aria-label={`${count} users online`}
      style={{
        position:        'absolute',
        bottom:          10,
        left:            12,
        zIndex:          300,
        display:         'flex',
        alignItems:      'center',
        gap:             4,
        userSelect:      'none',
        WebkitUserSelect: 'none',
        pointerEvents:   'none',
      }}
    >
      <div style={{
        width:        6,
        height:       6,
        borderRadius: '50%',
        background:   '#22c55e',
        boxShadow:    '0 0 4px #22c55e',
        flexShrink:   0,
      }} />
      <span style={{
        fontSize:           10,
        fontWeight:         600,
        color:              'rgba(255,255,255,0.45)',
        fontVariantNumeric: 'tabular-nums',
        fontFamily:         'system-ui, sans-serif',
        lineHeight:         1,
      }}>
        {count}
      </span>
    </div>
  )
}
