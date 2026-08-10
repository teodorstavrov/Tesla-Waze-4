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
import { gpsStore } from '@/features/gps/gpsStore'
import { countryStore } from '@/lib/countryStore'

const HEARTBEAT_MS = 5 * 60_000   // 5 min — reduces Redis commands ~5x vs 60s

function getSessionData(): { sid: string; firstSeen: number } {
  const SID_KEY = 'tesradar:sid'
  const FS_KEY  = 'tesradar:firstSeen'
  let sid       = localStorage.getItem(SID_KEY)
  let firstSeen = parseInt(localStorage.getItem(FS_KEY) ?? '0', 10)
  const now     = Math.floor(Date.now() / 1000)
  if (!sid) {
    sid       = crypto.randomUUID()
    firstSeen = now
    localStorage.setItem(SID_KEY, sid)
    localStorage.setItem(FS_KEY, String(firstSeen))
  } else if (!firstSeen) {
    firstSeen = now
    localStorage.setItem(FS_KEY, String(firstSeen))
  }
  return { sid, firstSeen }
}

export function OnlineCounter() {
  const [count, setCount] = useState<number | null>(null)
  const sidRef       = useRef<string | null>(null)
  const firstSeenRef = useRef<number>(0)

  useEffect(() => {
    const { sid, firstSeen } = getSessionData()
    sidRef.current       = sid
    firstSeenRef.current = firstSeen

    async function heartbeat() {
      // Location: GPS if active, else country center
      const gpsPos  = gpsStore.getPosition()
      const country = countryStore.getCode() ?? 'unknown'
      let lat: number
      let lng: number
      if (gpsPos) {
        lat = gpsPos.lat
        lng = gpsPos.lng
      } else {
        ;[lat, lng] = countryStore.getCountryOrDefault().center
      }

      try {
        const res = await fetch('/api/online', {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify({ sid: sidRef.current, firstSeen: firstSeenRef.current, lat, lng, country }),
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
