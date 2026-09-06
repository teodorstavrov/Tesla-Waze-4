// ─── Tesla browser debug panel ─────────────────────────────────────────
// Shown only when ?teslaDebug=1 is present in the URL.
// Provides real-time viewport / DPR / UA diagnostics to verify that the
// Tesla 2026.26 compatibility mode is working correctly on the real car.
//
// Usage: open https://tesradar.tech/?teslaDebug=1 in the Tesla browser.
// The panel is hidden in all other environments and has no production cost.

import { useState, useEffect } from 'react'
import { isTeslaBrowser, isTesla2026Zoomed, TESLA_COMPAT_VIEWPORT_W } from '@/lib/browser'

const ENABLED = new URLSearchParams(window.location.search).get('teslaDebug') === '1'

function Row({ label, value, ok }: { label: string; value: string; ok?: boolean }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, minWidth: 260 }}>
      <span style={{ color: 'rgba(180,255,180,0.7)', flexShrink: 0 }}>{label}</span>
      <span style={{
        fontWeight: 700,
        color: ok === true ? '#4ade80' : ok === false ? '#f87171' : '#fff',
        textAlign: 'right',
        wordBreak: 'break-all',
      }}>{value}</span>
    </div>
  )
}

export function TeslaDebugPanel() {
  const [tick, setTick] = useState(0)

  // Refresh once per second so viewport values update if they change
  useEffect(() => {
    if (!ENABLED) return
    const id = setInterval(() => setTick(t => t + 1), 1000)
    return () => clearInterval(id)
  }, [])

  if (!ENABLED) return null

  const vv = window.visualViewport
  const compatApplied = document.documentElement.hasAttribute('data-tesla-zoomed')

  return (
    <div
      style={{
        position:   'fixed',
        top:        8,
        right:      8,
        zIndex:     99999,
        background: 'rgba(0,0,0,0.88)',
        color:      '#d1ffd1',
        fontFamily: '"Courier New", Courier, monospace',
        fontSize:   11,
        lineHeight: 1.65,
        padding:    '10px 14px',
        borderRadius: 8,
        border:     '1px solid rgba(74,222,128,0.4)',
        boxShadow:  '0 4px 24px rgba(0,0,0,0.6)',
        pointerEvents: 'none',
        userSelect: 'none',
        WebkitUserSelect: 'none',
      }}
      aria-hidden="true"
      // re-render on tick (keeps values live)
      data-tick={tick}
    >
      <div style={{ fontWeight: 700, fontSize: 12.5, marginBottom: 6, color: '#4ade80', letterSpacing: '0.05em' }}>
        ⚡ TesRadar Debug
      </div>

      <Row label="Tesla browser:"      value={isTeslaBrowser ? 'YES ✓' : 'NO'} ok={isTeslaBrowser} />
      <Row label="2026.26 detected:"   value={isTesla2026Zoomed ? 'YES ✓' : 'NO'} ok={isTesla2026Zoomed} />
      <Row label="Compat active:"      value={compatApplied ? 'YES ✓' : 'NO'} ok={compatApplied} />
      <Row label="Target layout px:"   value={`${TESLA_COMPAT_VIEWPORT_W}px`} />

      <div style={{ height: 1, background: 'rgba(74,222,128,0.2)', margin: '6px 0' }} />

      <Row label="innerWidth:"         value={`${window.innerWidth}px`} />
      <Row label="innerHeight:"        value={`${window.innerHeight}px`} />
      <Row label="screen:"             value={`${screen.width}×${screen.height}px`} />
      <Row label="DPR:"                value={window.devicePixelRatio.toFixed(3)} />

      {vv && (
        <>
          <Row label="vvp.width:"      value={`${Math.round(vv.width)}px`} />
          <Row label="vvp.height:"     value={`${Math.round(vv.height)}px`} />
          <Row label="vvp.scale:"      value={vv.scale.toFixed(3)} />
        </>
      )}

      <div style={{ height: 1, background: 'rgba(74,222,128,0.2)', margin: '6px 0' }} />

      <div style={{ fontSize: 9, color: 'rgba(180,255,180,0.5)', wordBreak: 'break-all', maxWidth: 300 }}>
        {navigator.userAgent}
      </div>
    </div>
  )
}
