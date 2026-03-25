// ─── Offline Toast ─────────────────────────────────────────────────────
// Listens to browser online/offline events.
// Shows a pill banner when network is unavailable.
// Auto-hides 3s after connectivity is restored.

import { useEffect, useState, useRef } from 'react'

export function OfflineToast() {
  const [offline, setOffline] = useState(!navigator.onLine)
  const [visible, setVisible] = useState(!navigator.onLine)
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    function onOffline() {
      if (hideTimer.current) clearTimeout(hideTimer.current)
      setOffline(true)
      setVisible(true)
    }

    function onOnline() {
      setOffline(false)
      // Keep visible briefly so user sees "Онлайн" confirmation
      hideTimer.current = setTimeout(() => setVisible(false), 3000)
    }

    window.addEventListener('offline', onOffline)
    window.addEventListener('online',  onOnline)
    return () => {
      window.removeEventListener('offline', onOffline)
      window.removeEventListener('online',  onOnline)
      if (hideTimer.current) clearTimeout(hideTimer.current)
    }
  }, [])

  if (!visible) return null

  return (
    <div
      style={{
        position:   'fixed',
        top:        12,
        left:       '50%',
        transform:  'translateX(-50%)',
        zIndex:     1100,
        display:    'flex',
        alignItems: 'center',
        gap:        6,
        padding:    '6px 14px',
        borderRadius: 20,
        background: offline ? 'rgba(239,68,68,0.92)' : 'rgba(34,197,94,0.92)',
        color:      '#fff',
        fontSize:   12,
        fontWeight: 600,
        boxShadow:  '0 2px 12px rgba(0,0,0,0.4)',
        pointerEvents: 'none',
        userSelect: 'none',
        whiteSpace: 'nowrap',
      }}
      aria-live="polite"
    >
      <span style={{ fontSize: 10 }}>{offline ? '⬤' : '⬤'}</span>
      {offline ? 'Офлайн — картата и станциите са кеширани' : 'Връзката е възстановена'}
    </div>
  )
}
