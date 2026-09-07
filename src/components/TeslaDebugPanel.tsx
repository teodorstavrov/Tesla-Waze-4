// ─── Tesla browser debug panel ─────────────────────────────────────────
// Shown only when ?teslaDebug=1 is present in the URL.
// Provides real-time viewport / DPR / detection-signal diagnostics for
// verifying compatibility mode on the real Tesla car.
//
// Usage: open https://tesradar.tech/?teslaDebug=1 in Tesla browser.

import { useState, useEffect } from 'react'
import { isTeslaBrowser, isTesla2026Zoomed, TESLA_COMPAT_VIEWPORT_W, teslaZoomedSignals } from '@/lib/browser'
import { evStore } from '@/features/ev/evStore'
import { filterStore } from '@/features/ev/filterStore'

const ENABLED = new URLSearchParams(window.location.search).get('teslaDebug') === '1'

function Row({
  label, value, ok,
}: { label: string; value: string | number; ok?: boolean }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, minWidth: 280 }}>
      <span style={{ color: 'rgba(180,255,180,0.65)', flexShrink: 0, fontSize: 10 }}>{label}</span>
      <span style={{
        fontWeight: 700, fontSize: 10.5,
        color: ok === true ? '#4ade80' : ok === false ? '#f87171' : '#fff',
        textAlign: 'right',
      }}>{value}</span>
    </div>
  )
}

function Divider() {
  return <div style={{ height: 1, background: 'rgba(74,222,128,0.15)', margin: '5px 0' }} />
}

export function TeslaDebugPanel() {
  const [tick, setTick] = useState(0)

  useEffect(() => {
    if (!ENABLED) return
    const id = setInterval(() => setTick(t => t + 1), 1000)
    return () => clearInterval(id)
  }, [])

  if (!ENABLED) return null

  const vv = window.visualViewport
  const compatActive = document.documentElement.hasAttribute('data-tesla-zoomed')
  const { score, maxScore, confidence, matched, unmatched } = teslaZoomedSignals

  return (
    <div
      style={{
        position:   'fixed',
        top:        8,
        right:      8,
        zIndex:     99999,
        background: 'rgba(0,0,0,0.92)',
        color:      '#d1ffd1',
        fontFamily: '"Courier New", Courier, monospace',
        lineHeight: 1.6,
        padding:    '10px 14px',
        borderRadius: 8,
        border:     `1px solid ${isTesla2026Zoomed ? 'rgba(74,222,128,0.5)' : 'rgba(248,113,113,0.5)'}`,
        boxShadow:  '0 4px 24px rgba(0,0,0,0.7)',
        pointerEvents: 'none',
        userSelect: 'none',
        WebkitUserSelect: 'none',
        maxWidth:   340,
      }}
      aria-hidden="true"
      data-tick={tick}
    >
      {/* Header */}
      <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 6, color: '#4ade80', letterSpacing: '0.05em' }}>
        ⚡ TesRadar Debug
      </div>

      {/* Summary */}
      <Row label="Tesla-like browser:"    value={isTeslaBrowser    ? 'YES ✓' : 'NO ✗'} ok={isTeslaBrowser} />
      <Row label="2026.26 detected:"      value={isTesla2026Zoomed ? 'YES ✓' : 'NO ✗'} ok={isTesla2026Zoomed} />
      <Row label="Compat active:"         value={compatActive       ? 'YES ✓' : 'NO ✗'} ok={compatActive} />
      <Row label="Detection confidence:"  value={`${confidence}% (${score}/${maxScore})`} ok={confidence >= 64} />
      <Row label="Target layout width:"   value={`${TESLA_COMPAT_VIEWPORT_W}px`} />

      <Divider />

      {/* Viewport values */}
      <Row label="innerWidth:"    value={`${window.innerWidth}px`} />
      <Row label="innerHeight:"   value={`${window.innerHeight}px`} />
      <Row label="screen:"        value={`${screen.width} × ${screen.height}px`} />
      <Row label="DPR:"           value={window.devicePixelRatio.toFixed(3)} />
      {vv && <>
        <Row label="vvp.width:"   value={`${Math.round(vv.width)}px`} />
        <Row label="vvp.height:"  value={`${Math.round(vv.height)}px`} />
        <Row label="vvp.scale:"   value={vv.scale.toFixed(3)} />
      </>}

      <Divider />

      {/* Signal breakdown */}
      <div style={{ fontSize: 9.5, color: '#4ade80', fontWeight: 700, marginBottom: 3 }}>
        DETECTION SIGNALS
      </div>
      {matched.map(s => (
        <div key={s} style={{ fontSize: 9, color: '#4ade80', lineHeight: 1.5 }}>✓ {s}</div>
      ))}
      {unmatched.map(s => (
        <div key={s} style={{ fontSize: 9, color: '#f87171', lineHeight: 1.5 }}>✗ {s}</div>
      ))}

      <Divider />

      {/* EV station diagnostics */}
      <div style={{ fontSize: 9.5, color: '#4ade80', fontWeight: 700, marginBottom: 3 }}>
        EV STATIONS
      </div>
      {(() => {
        const evState     = evStore.getState()
        const filterState = filterStore.getState()
        const filtered    = filterStore.getFilteredStations()
        const hidden      = document.hidden
        return <>
          <Row label="doc.hidden:"        value={hidden ? 'YES ✗ (fetch blocked!)' : 'NO ✓'} ok={!hidden} />
          <Row label="markersVisible:"    value={evState.markersVisible     ? 'YES ✓' : 'NO ✗'} ok={evState.markersVisible} />
          <Row label="filtersBarEnabled:" value={filterState.filtersBarEnabled ? 'YES ✓' : 'NO ✗ (hides all!)'} ok={filterState.filtersBarEnabled} />
          <Row label="stations in store:" value={evState.stations.length} ok={evState.stations.length > 0} />
          <Row label="stations filtered:" value={filtered.length} ok={filtered.length > 0} />
          <Row label="fetch status:"      value={evState.status} ok={evState.status === 'ok'} />
          {filterState.connector   != null && <Row label="connector filter:" value={filterState.connector} />}
          {filterState.minPowerKw  != null && <Row label="minPower filter:"  value={`${filterState.minPowerKw} kW`} />}
          {filterState.onlyAvailable       && <Row label="only available:"   value="YES" />}
        </>
      })()}

      <Divider />

      {/* User agent */}
      <div style={{ fontSize: 8, color: 'rgba(180,255,180,0.4)', wordBreak: 'break-all' }}>
        {navigator.userAgent}
      </div>
    </div>
  )
}
