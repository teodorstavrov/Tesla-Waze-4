// ─── Real-time online user counter ─────────────────────────────────────
// Sends a POST heartbeat every 20s (session ID from sessionStorage).
// Shows a small green dot + count at bottom-left, very unobtrusive.

import { useState, useEffect, useRef } from 'react'

const HEARTBEAT_MS = 20_000   // 20 seconds between pings

/** Returns or creates a stable session ID for this browser tab. */
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

  // Don't render until we have a real count
  if (count === null) return null

  return (
    <div
      aria-label={`${count} users online`}
      style={{
        position:   'absolute',
        bottom:     10,
        left:       12,
        zIndex:     300,
        display:    'flex',
        alignItems: 'center',
        gap:        4,
        userSelect: 'none',
        WebkitUserSelect: 'none',
        pointerEvents: 'none',
      }}
    >
      {/* Pulsing green dot */}
      <div style={{
        width:        6,
        height:       6,
        borderRadius: '50%',
        background:   '#22c55e',
        boxShadow:    '0 0 4px #22c55e',
        flexShrink:   0,
      }} />

      {/* Count */}
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
