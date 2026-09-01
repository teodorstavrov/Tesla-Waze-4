import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@/styles/globals.css'
import { App } from '@/app/App'
import { ErrorBoundary } from '@/components/ErrorBoundary'
import { initSentry } from '@/lib/sentry'
import { inject } from '@vercel/analytics'
import { injectSpeedInsights } from '@vercel/speed-insights'
import { isTeslaBrowser } from '@/lib/browser'

void initSentry()
inject()
injectSpeedInsights()

// Mark <html> so CSS can suppress expensive animations on Tesla
if (isTeslaBrowser) document.documentElement.setAttribute('data-tesla', '')

// ── Viewport CSS variables ─────────────────────────────────────────────────
// Set --vh / --vw to actual window.innerHeight / innerWidth on every resize.
// These are used in CSS clamp() formulas instead of 100vh/100vw so that layouts
// work correctly even on Tesla firmware where 100vh > window.innerHeight
// (known Chromium bug: browser chrome height is included in 100vh on some builds).
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
