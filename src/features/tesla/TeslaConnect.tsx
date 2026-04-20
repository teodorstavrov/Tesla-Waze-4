// ─── Tesla connection UI ──────────────────────────────────────────────────
// Minimal connect / connected / disconnect widget.
// Placed inside VehicleProfileModal — does not redesign the surrounding UI.

import { useSyncExternalStore } from 'react'
import { teslaStore } from './teslaStore.js'
import { getLang, langStore } from '@/lib/locale'

function _labels() {
  const isBg = getLang() === 'bg'
  return {
    sectionTitle: isBg ? 'Tesla акаунт'           : 'Tesla account',
    connect:      isBg ? 'Свържи Tesla акаунт'    : 'Connect Tesla',
    connected:    isBg ? 'Свързан'                : 'Connected',
    liveData:     isBg ? 'Живи данни'             : 'Live data',
    disconnect:   isBg ? 'Прекъсни'              : 'Disconnect',
    connecting:   isBg ? 'Зареждане...'           : 'Loading...',
    hint:         isBg
      ? 'Свържи Tesla за да се вижда реалният заряд на батерията в приложението.'
      : 'Connect your Tesla to show real battery data in the app.',
    errDenied:    isBg ? 'Достъпът беше отказан от Tesla.' : 'Access was denied by Tesla.',
    errGeneric:   isBg ? 'Грешка при свързване. Опитай отново.'
                       : 'Connection error. Please try again.',
  }
}

// ── Tesla "T" wordmark SVG (simplified) ─────────────────────────────────

function TeslaT() {
  return (
    <svg width="12" height="16" viewBox="0 0 100 130" fill="currentColor" aria-hidden="true">
      <path d="M50 22 L50 130 L42 130 L42 22 L0 22 L0 14 C16 19 34 22 50 22 C66 22 84 19 100 14 L100 22 Z"/>
      <path d="M0 0 L100 0 C80 8 66 14 50 14 C34 14 20 8 0 0 Z"/>
    </svg>
  )
}

// ── Component ────────────────────────────────────────────────────────────

export function TeslaConnect() {
  useSyncExternalStore(langStore.subscribe.bind(langStore), getLang, getLang)
  const state = useSyncExternalStore(
    teslaStore.subscribe,
    teslaStore.getState,
    teslaStore.getState,
  )
  const L = _labels()

  // ── Loading (only when not yet connected — avoids layout jump) ──────
  if (state.loading && !state.connected) {
    return (
      <div style={{ fontSize: 14, color: 'rgba(255,255,255,0.45)', padding: '8px 0' }}>
        {L.connecting}
      </div>
    )
  }

  // ── Connected ────────────────────────────────────────────────────────
  if (state.connected) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {/* Status badge + vehicle name */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <span style={{
            display:    'inline-flex',
            alignItems: 'center',
            gap:        5,
            padding:    '5px 10px',
            borderRadius: 20,
            background: 'rgba(34,197,94,0.15)',
            border:     '1px solid rgba(34,197,94,0.35)',
            fontSize:   13,
            color:      '#22c55e',
            fontWeight: 600,
          }}>
            {/* Pulsing dot */}
            <span style={{
              width: 6, height: 6,
              borderRadius: '50%',
              background:   '#22c55e',
            }} />
            {L.liveData}
          </span>
          {state.vehicleName && (
            <span style={{ fontSize: 14, color: 'rgba(255,255,255,0.65)' }}>
              {state.vehicleName}
            </span>
          )}
        </div>
        {/* Disconnect */}
        <button
          onClick={() => { void teslaStore.disconnect() }}
          style={{
            alignSelf:      'flex-start',
            padding:        '7px 14px',
            borderRadius:   8,
            background:     'transparent',
            border:         '1px solid rgba(255,255,255,0.12)',
            color:          'rgba(255,255,255,0.4)',
            fontSize:       13,
            cursor:         'pointer',
            touchAction:    'manipulation',
          }}
        >
          {L.disconnect}
        </button>
      </div>
    )
  }

  // ── Disconnected ─────────────────────────────────────────────────────
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {/* Error message */}
      {state.error && (
        <div style={{ fontSize: 13, color: '#ef4444', lineHeight: 1.4 }}>
          {state.error === 'denied' ? L.errDenied : L.errGeneric}
        </div>
      )}

      {/* Hint text */}
      {!state.error && (
        <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.4)', lineHeight: 1.5 }}>
          {L.hint}
        </div>
      )}

      {/* Connect button */}
      <button
        onClick={() => teslaStore.startConnect()}
        style={{
          alignSelf:      'flex-start',
          display:        'flex',
          alignItems:     'center',
          gap:            9,
          padding:        '11px 18px',
          borderRadius:   10,
          background:     'rgba(227,25,55,0.10)',
          border:         '1px solid rgba(227,25,55,0.40)',
          color:          '#f2f2f2',
          fontSize:       15,
          fontWeight:     600,
          cursor:         'pointer',
          touchAction:    'manipulation',
          letterSpacing:  '0.01em',
        }}
      >
        <TeslaT />
        {L.connect}
      </button>
    </div>
  )
}
