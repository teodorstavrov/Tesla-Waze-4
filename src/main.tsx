import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@/styles/globals.css'
import { App } from '@/app/App'
import { ErrorBoundary } from '@/components/ErrorBoundary'
import { initSentry } from '@/lib/sentry'
import { inject } from '@vercel/analytics'
import { injectSpeedInsights } from '@vercel/speed-insights'
import { isTeslaBrowser, isTesla2026Zoomed, TESLA_COMPAT_VIEWPORT_W } from '@/lib/browser'

void initSentry()
inject()
injectSpeedInsights()

// Mark <html> so CSS can suppress expensive animations on Tesla
if (isTeslaBrowser) document.documentElement.setAttribute('data-tesla', '')

// ── Tesla 2026.26 compatibility mode ──────────────────────────────────────────
// Tesla software 2026.26 increased the Chromium browser's CSS zoom, shrinking
// the CSS viewport from ~1180×919 to ~773×601 (HW3). Physical display unchanged.
//
// Fix: set <meta name="viewport" content="width=<physical_px>"> to tell the
// browser to restore the original CSS layout width. The browser zooms back out
// so that CSS pixels map 1:1 to physical pixels, restoring all layout formulas,
// button sizes, clamp() values, and Leaflet dimensions exactly as before.
//
// After this line executes:
//   • window.innerWidth  ≈ 1180  (was 773)
//   • window.innerHeight ≈ 919   (was 601)
//   • 100vh ≈ 919px              (was 601px)
//   • devicePixelRatio ≈ 1.0     (was ≈1.526)
//
// Does NOT modify window.innerWidth directly — uses the proper browser API.
// Narrowly scoped: only fires when isTesla2026Zoomed is true.
if (isTesla2026Zoomed) {
  document.documentElement.setAttribute('data-tesla-zoomed', '')

  const metaViewport = document.querySelector('meta[name="viewport"]') as HTMLMetaElement | null
  if (metaViewport) {
    // width=<physical_px>: restore DPR≈1 layout width
    // Keep all other constraints (no user scaling while driving)
    metaViewport.content =
      `width=${TESLA_COMPAT_VIEWPORT_W}, initial-scale=1.0, minimum-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover`
  }
}

// ── Viewport CSS variables ─────────────────────────────────────────────────
// Set --vh / --vw to actual window.innerHeight / innerWidth on every resize.
// These are used in CSS clamp() formulas instead of 100vh/100vw so that layouts
// work correctly even on Tesla firmware where 100vh > window.innerHeight
// (known Chromium bug: browser chrome height is included in 100vh on some builds).
// After the 2026.26 compat meta update above, window.innerHeight ≈ 919 (restored).
// --marker-viewport-scale keeps map markers proportional to left-button size.
// Formula: (vh - 195) / (7 × 88px-max) → range 0.55–1.
function _updateViewportVars() {
  const h = window.innerHeight
  const w = window.innerWidth
  document.documentElement.style.setProperty('--vh', `${h}px`)
  document.documentElement.style.setProperty('--vw', `${w}px`)
  const scale = Math.min(1, Math.max(0.55, (h - 195) / 616))
  document.documentElement.style.setProperty('--marker-viewport-scale', scale.toFixed(4))
}
_updateViewportVars()
window.addEventListener('resize', _updateViewportVars, { passive: true })

// Register service worker for offline tile caching
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {
      // SW registration failure is non-fatal — app works without it
    })
  })
}

const rootEl = document.getElementById('root')
if (!rootEl) throw new Error('#root element not found')

createRoot(rootEl).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
)
