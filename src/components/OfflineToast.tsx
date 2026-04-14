// ─── Offline Toast ─────────────────────────────────────────────────────
// Listens to browser online/offline events.
// Shows a pill banner when network is unavailable.
// Auto-hides 3s after connectivity is restored.
//
// TESLA MODE: always in DOM, visibility-toggled.
// role="status" matches the [data-tesla] [role="status"] CSS rule that
// removes box-shadow. The element is pre-promoted to its own GPU layer
// at startup (translateZ(0)) so appearing/disappearing is a free
// compositor visibility op — no layer allocation, no map repaint.

import { useEffect, useState, useRef } from 'react'
import { useSyncExternalStore } from 'react'
import { audioManager } from '@/features/audio/audioManager'
import { t, getLang, langStore } from '@/lib/locale'
import { isTeslaBrowser } from '@/lib/browser'

export function OfflineToast() {
  useSyncExternalStore(langStore.subscribe.bind(langStore), getLang, getLang)
  const [offline, setOffline] = useState(!navigator.onLine)
  const [visible, setVisible] = useState(!navigator.onLine)
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    function onOffline() {
      if (hideTimer.current) clearTimeout(hideTimer.current)
      setOffline(true)
      setVisible(true)
      audioManager.uiBeep()
    }

    function onOnline() {
      setOffline(false)
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

  if (isTeslaBrowser) {
    // ── Tesla: always in DOM, GPU layer pre-allocated, visibility-toggled ──
    // No box-shadow, no scale transition, no opacity animation.
    // translateZ(0) on style promotes to GPU layer at load time — first
    // appearance is a free compositor op with no layer tree rebuild.
    return (
      <div
        role="status"
        aria-live="polite"
        aria-hidden={!visible}
        className="tesla-alert-banner"
        style={{
          position:        'fixed',
          top:             12,
          left:            '50%',
          transform:       'translateX(-50%) translateZ(0)',
          zIndex:          1100,
          display:         'flex',
          alignItems:      'center',
          gap:             6,
          padding:         '6px 14px',
          borderRadius:    20,
          background:      offline ? 'rgba(239,68,68,0.97)' : 'rgba(34,197,94,0.97)',
          color:           '#fff',
          fontSize:        12,
          fontWeight:      600,
          pointerEvents:   'none',
          userSelect:      'none',
          WebkitUserSelect: 'none',
          whiteSpace:      'nowrap',
          contain:         'layout style paint' as React.CSSProperties['contain'],
        }}
      >
        <span style={{ fontSize: 10 }}>{offline ? '⬤' : '⬤'}</span>
        {offline ? t('offline.offline') : t('offline.online')}
      </div>
    )
  }

  // ── Standard browser: opacity + scale fade ───────────────────────────
  return (
    <div
      role="status"
      aria-live="polite"
      style={{
        position:        'fixed',
        top:             12,
        left:            '50%',
        transform:       visible ? 'translateX(-50%) scale(1)' : 'translateX(-50%) scale(0.94)',
        zIndex:          1100,
        display:         'flex',
        alignItems:      'center',
        gap:             6,
        padding:         '6px 14px',
        borderRadius:    20,
        background:      offline ? 'rgba(239,68,68,0.92)' : 'rgba(34,197,94,0.92)',
        color:           '#fff',
        fontSize:        12,
        fontWeight:      600,
        boxShadow:       '0 2px 12px rgba(0,0,0,0.4)',
        pointerEvents:   'none',
        userSelect:      'none',
        WebkitUserSelect: 'none',
        whiteSpace:      'nowrap',
        opacity:         visible ? 1 : 0,
        transition:      'opacity 0.2s ease-out, transform 0.2s ease-out',
      }}
    >
      <span style={{ fontSize: 10 }}>{offline ? '⬤' : '⬤'}</span>
      {offline ? t('offline.offline') : t('offline.online')}
    </div>
  )
}
