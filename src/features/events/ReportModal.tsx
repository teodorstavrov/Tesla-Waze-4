// ─── Report Modal ──────────────────────────────────────────────────────
// One-tap event reporting. User selects type → submits immediately.
// Uses GPS position from gpsStore. If no GPS, uses map center.

import { useSyncExternalStore, useState, useEffect } from 'react'
import { eventStore } from './eventStore.js'
import { gpsStore } from '@/features/gps/gpsStore'
import { audioManager } from '@/features/audio/audioManager'
import { getMap } from '@/components/MapShell'
import { EVENT_EMOJI, EVENT_COLORS } from './types.js'
import type { EventType } from './types.js'
import { isTeslaBrowser } from '@/lib/browser'
import { t, langStore } from '@/lib/locale'

const EVENT_TYPES: EventType[] = [
  'police', 'accident', 'hazard', 'camera',
]

export function ReportModal() {
  // Re-render on language change so labels update immediately
  useSyncExternalStore(langStore.subscribe, langStore.getLang, langStore.getLang)

  const open = useSyncExternalStore(
    eventStore.subscribe.bind(eventStore),
    () => eventStore.getState().reportModalOpen,
    () => false,
  )

  const [submitting, setSubmitting] = useState(false)
  const [shown, setShown] = useState(false)

  useEffect(() => {
    if (open) {
      if (isTeslaBrowser) { setShown(true) }
      else { requestAnimationFrame(() => requestAnimationFrame(() => setShown(true))) }
    } else {
      setShown(false)
    }
  }, [open])

  if (!open) return null

  async function handleSelect(type: EventType): Promise<void> {
    if (submitting) return
    setSubmitting(true)

    // Priority: preset location (e.g. station) → GPS → map center
    const preset = eventStore.getState().reportLocation
    const gps    = gpsStore.getPosition()
    let lat: number
    let lng: number

    if (preset) {
      lat = preset.lat
      lng = preset.lng
    } else if (gps) {
      lat = gps.lat
      lng = gps.lng
    } else {
      const map = getMap()
      const center = map?.getCenter()
      lat = center?.lat ?? 42.6977
      lng = center?.lng ?? 23.3219
    }

    await eventStore.report(type, lat, lng)
    audioManager.confirmBeep()
    setSubmitting(false)
    eventStore.closeReportModal()
  }

  return (
    <>
      {/* Backdrop — no blur on Tesla: full-screen blur forces a compositing pass
           over the entire viewport, causing the map to visibly redraw on mount. */}
      {/* eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions */}
      <div
        onClick={() => eventStore.closeReportModal()}
        style={{
          position: 'fixed', inset: 0, zIndex: 600,
          background: isTeslaBrowser ? 'rgba(0,0,0,0.80)' : 'rgba(0,0,0,0.65)',
          backdropFilter: isTeslaBrowser ? undefined : 'blur(4px)',
          WebkitBackdropFilter: isTeslaBrowser ? undefined : 'blur(4px)',
        }}
      />

      {/* Modal card */}
      <div
        role="dialog"
        aria-modal="true"
        aria-label={t('events.reportTitle')}
        style={{
          position: 'fixed',
          top: '50%', left: '50%',
          transform: shown ? 'translate(-50%, -50%) scale(1)' : 'translate(-50%, -50%) scale(0.96)',
          zIndex: 601,
          width: 'min(420px, calc(100vw - 32px))',
          padding: '24px 20px 20px',
          opacity: shown ? 1 : 0,
          transition: isTeslaBrowser ? undefined : 'opacity 0.2s ease-out, transform 0.2s ease-out',
        }}
        className="glass"
      >
        <div style={{
          fontSize: 17, fontWeight: 700,
          color: 'var(--text-primary)',
          marginBottom: 20,
          textAlign: 'center',
        }}>
          {t('events.reportWhat')}
        </div>

        {/* 3 × 2 type grid */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(2, 1fr)',
          gap: 10,
          marginBottom: 16,
        }}>
          {EVENT_TYPES.map((type) => (
            <TypeButton
              key={type}
              type={type}
              disabled={submitting}
              onClick={() => { void handleSelect(type) }}
            />
          ))}
        </div>

        <button
          onClick={() => eventStore.closeReportModal()}
          style={{
            width: '100%',
            padding: '10px',
            borderRadius: 10,
            background: 'rgba(255,255,255,0.07)',
            border: '1px solid rgba(255,255,255,0.14)',
            color: 'var(--text-secondary)',
            fontSize: 13,
            cursor: 'pointer',
            touchAction: 'manipulation',
          }}
        >
          {t('common.cancel')}
        </button>
      </div>
    </>
  )
}

function TypeButton({
  type, disabled, onClick,
}: {
  type: EventType
  disabled: boolean
  onClick: () => void
}) {
  const color = EVENT_COLORS[type]
  const emoji = EVENT_EMOJI[type]
  const label = t(`events.${type}`)

  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 9,
        padding: '21px 12px',
        borderRadius: 18,
        background: `${color}18`,
        border: `1.5px solid ${color}55`,
        color: 'var(--text-primary)',
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.6 : 1,
        touchAction: 'manipulation',
        transition: 'background 0.1s',
      }}
      onPointerDown={(e) => {
        if (!disabled) (e.currentTarget as HTMLElement).style.background = `${color}30`
      }}
      onPointerUp={(e) => {
        (e.currentTarget as HTMLElement).style.background = `${color}18`
      }}
      onPointerLeave={(e) => {
        (e.currentTarget as HTMLElement).style.background = `${color}18`
      }}
    >
      <span style={{ fontSize: 39 }}>{emoji}</span>
      <span style={{ fontSize: 16, fontWeight: 600, letterSpacing: '0.02em', color }}>{label}</span>
    </button>
  )
}
