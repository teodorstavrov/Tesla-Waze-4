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

// ── Viewport-proportional marker scale ────────────────────────────────────
// Keeps map markers proportional to left-button size across all Tesla models.
// Formula matches left-button clamp: (vh - 195) / (7 × 88px-max) → range 0.55–1.
// Set as CSS var so .marker-scale-wrap can multiply it with the counter-scale.
function _setMarkerViewportScale() {
  const scale = Math.min(1, Math.max(0.55, (window.innerHeight - 195) / 616))
  document.documentElement.style.setProperty('--marker-viewport-scale', scale.toFixed(4))
}
_setMarkerViewportScale()
window.addEventListener('resize', _setMarkerViewportScale, { passive: true })

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
