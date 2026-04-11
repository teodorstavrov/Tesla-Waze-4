// ─── GPS location / follow mode button ────────────────────────────────
//
// Behavior:
//  - Shows dot icon when no GPS yet
//  - Shows crosshair when GPS known but not following
//  - Shows filled/active icon when follow mode is on
//  - On click: pan to last known position + re-enable follow mode
//
// This component re-renders ONLY when follow mode changes (via
// useFollowing) or when the first GPS position arrives (useState).
// GPS ticks do NOT cause rerenders here.

import { useState, useEffect, useSyncExternalStore } from 'react'
import { useFollowing, followStore } from '@/features/follow/followStore'
import { gpsStore } from '@/features/gps/gpsStore'
import { getMap } from '@/components/MapShell'
import { langStore, t } from '@/lib/locale'
import { isTeslaBrowser } from '@/lib/browser'

export function LocationButton() {
  const following = useFollowing()
  const [hasGps, setHasGps] = useState(false)
  // Re-render when language changes
  useSyncExternalStore(langStore.subscribe.bind(langStore), langStore.getLang, langStore.getLang)

  // Update hasGps only once — when first position arrives
  useEffect(() => {
    if (gpsStore.getPosition()) {
      setHasGps(true)
      return
    }
    const unsub = gpsStore.onPosition(() => {
      setHasGps(true)
      unsub() // unsubscribe after first fix
    })
    return unsub
  }, [])

  function handleClick() {
    const map = getMap()
    if (!map) return

    const pos = gpsStore.getPosition()
    if (pos) {
      followStore.beginProgrammaticMove()
      map.once('moveend', () => followStore.endProgrammaticMove())
      map.panTo([pos.lat, pos.lng], { animate: !isTeslaBrowser, duration: 0.4 })
    }
    followStore.setFollowing(true)
  }

  const label = following ? t('map.following') : hasGps ? t('map.recenter') : t('map.waitingGps')

  return (
    <button
      className="icon-btn"
      onClick={handleClick}
      title={label}
      aria-label={label}
      aria-pressed={following}
      style={{ width: 48, height: 48 }}
    >
      {following ? <ActiveIcon /> : hasGps ? <CrosshairIcon /> : <IdleIcon />}
    </button>
  )
}

function ActiveIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v3M12 19v3M2 12h3M19 12h3"
        stroke="currentColor" strokeWidth="2" strokeLinecap="round" fill="none" />
    </svg>
  )
}

function CrosshairIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
      <circle cx="12" cy="12" r="3" />
      <path d="M12 2v3M12 19v3M2 12h3M19 12h3" />
      <circle cx="12" cy="12" r="9" strokeOpacity="0.35" />
    </svg>
  )
}

function IdleIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
      opacity="0.45" aria-hidden="true">
      <circle cx="12" cy="12" r="3" />
      <path d="M12 2v3M12 19v3M2 12h3M19 12h3" />
    </svg>
  )
}
