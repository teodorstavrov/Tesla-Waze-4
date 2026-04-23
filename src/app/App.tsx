// ─── Tesla EV Nav — App root ───────────────────────────────────────────
// Phase 1+2: foundation shell + GPS/follow/audio UX.
// Phase 4: EV marker layer + station panel.
// Phase 6: road event markers + report modal.
// Phase 14: auto dark/light theme + onboarding.
// Phase 21: turn-by-turn navigation HUD + voice directions.

import { useEffect, lazy, Suspense } from 'react'
import { MapShell } from '@/components/MapShell'
import { HeadingAvatar } from '@/components/HeadingAvatar'
import { FloatingTitleCard } from '@/components/FloatingTitleCard'
import { FloatingStatsCard } from '@/components/FloatingStatsCard'
import { SearchBar } from '@/components/SearchBar'
import { LeftControls } from '@/components/LeftControls'
import { RightControls } from '@/components/RightControls'
import { BottomDock } from '@/components/BottomDock'
const Onboarding   = lazy(() => import('@/components/Onboarding').then(m => ({ default: m.Onboarding })))
import { useUserPosition } from '@/features/gps/useUserPosition'
import { useAudioUnlock } from '@/features/audio/useAudioUnlock'
import { EvMarkerLayer } from '@/features/ev/EvMarkerLayer'
import { StationPanel } from '@/features/ev/StationPanel'
import { FilterBar } from '@/features/ev/FilterBar'
import { EventMarkerLayer } from '@/features/events/EventMarkerLayer'
const ReportModal  = lazy(() => import('@/features/events/ReportModal').then(m => ({ default: m.ReportModal })))
import { EventPanel } from '@/features/events/EventPanel'
import { CameraMarkerLayer } from '@/features/cameras/CameraMarkerLayer'
import { SectionLayer } from '@/features/cameras/SectionLayer'
import { SectionCard } from '@/features/cameras/SectionCard'
import { sectionEngine } from '@/features/cameras/sectionEngine'
import { RouteLayer } from '@/features/route/RouteLayer'
import { SavedPlacesLayer } from '@/features/places/SavedPlacesLayer'
import { RoadworksLayer } from '@/features/roadworks/RoadworksLayer'
import { RoutePanel } from '@/features/route/RoutePanel'
import { TurnInstruction } from '@/features/route/TurnInstruction'
import { AlertToast } from '@/features/audio/AlertToast'
const OfflineToast = lazy(() => import('@/components/OfflineToast').then(m => ({ default: m.OfflineToast })))
import { SupportModal } from '@/components/SupportModal'
import { DonationNudge } from '@/components/DonationNudge'
import { RatingModal } from '@/components/RatingModal'
import { VehicleProfileModal } from '@/components/VehicleProfileModal'
import { CountryPicker } from '@/components/CountryPicker'
import { NorwayBetaBanner } from '@/components/NorwayBetaBanner'
import { OnlineCounter } from '@/components/OnlineCounter'
import { UpgradeModal } from '@/components/UpgradeModal'
import { PricingModal } from '@/components/PricingModal'
import { alertEngine } from '@/features/audio/alertEngine'
import { batteryTracker } from '@/features/planning/batteryTracker'
import { useThemeStore } from '@/features/theme/store'
import { teslaStore } from '@/features/tesla/teslaStore'
import { teslaPoller } from '@/features/tesla/teslaPoller'

export function App() {
  // Start GPS watching (feeds gpsStore; no rerenders from GPS ticks)
  useUserPosition()

  // Start proximity alert engine once on mount (not in render body — side-effect safety)
  useEffect(() => { alertEngine.start() }, [])
  useEffect(() => { batteryTracker.start() }, [])
  useEffect(() => { sectionEngine.start() }, [])
  useEffect(() => { teslaPoller.start() }, [])

  // Tesla connection: check status on app load + handle OAuth redirect result
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const connected = params.get('tesla_connected')
    const error     = params.get('tesla_error')

    if (connected === '1' || error) {
      // Clean the URL params so they don't persist on reload
      const clean = window.location.pathname
      window.history.replaceState(null, '', clean)
    }

    if (error === 'denied') {
      teslaStore.setError('denied')
    } else if (error) {
      teslaStore.setError('server_error')
    }

    // Always check backend status (restores connection after page reload too)
    void teslaStore.checkStatus()
  }, [])  // eslint-disable-line react-hooks/exhaustive-deps

  // Get the audio unlock trigger
  const { unlock } = useAudioUnlock()

  // Auto dark/light theme — re-checks every hour (only when not manually set)
  const applyAutoTheme = useThemeStore((s) => s.applyAutoTheme)
  useEffect(() => {
    applyAutoTheme()
    const interval = setInterval(applyAutoTheme, 60 * 60 * 1000)
    return () => clearInterval(interval)
  }, [applyAutoTheme])

  return (
    // Any tap on the app unlocks audio — safe since tryUnlock() is idempotent
    // eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions
    <div
      onClick={unlock}
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        width: '100%',
        height: '100%',
        overflow: 'hidden',
        background: '#0a0a0f',
      }}
    >
      {/* Layer 0: full-screen Leaflet map */}
      <MapShell />

      {/* Layer 0.5: imperative map overlays (no React DOM output) */}
      <HeadingAvatar />
      <EvMarkerLayer />
      <EventMarkerLayer />
      <CameraMarkerLayer />
      <SectionLayer />
      <RouteLayer />
      <SavedPlacesLayer />
      <RoadworksLayer />

      {/* Layer 1: floating UI */}
      <NorwayBetaBanner />
      <FloatingTitleCard />
      <TurnInstruction />
      <SearchBar />
      <FloatingStatsCard />
      <LeftControls />
      <RightControls />
      <BottomDock />
      <OnlineCounter />

      {/* Layer 2: panels + filter bar (above dock) */}
      <SectionCard />
      <FilterBar />
      <RoutePanel />
      <StationPanel />
      <EventPanel />

      {/* Layer 3: modal overlays */}
      <Suspense fallback={null}><ReportModal /></Suspense>

      {/* Layer 4: alert toast (above everything) */}
      <AlertToast />

      {/* Layer 5: first-visit onboarding (above toast, dismissable) */}
      <Suspense fallback={null}><Onboarding /></Suspense>

      {/* Layer 6: offline indicator */}
      <Suspense fallback={null}><OfflineToast /></Suspense>

      {/* Layer 7: support/donation modal (portal, above everything) */}
      {/* Wire stripeLink + qrImageUrl when Stripe is ready */}
      <RatingModal />
      <VehicleProfileModal />
      <DonationNudge qrImageUrl="/stripe-qr.png" donationLink="https://buy.stripe.com/14AaEXfak7HT744daj8g001" />

      {/* Layer 8: country picker — blocks first load; in-app switcher via openCountryPicker() */}
      <CountryPicker />

      {/* Layer 9: premium upgrade modal (Stripe-ready; stripeLink/qrImageUrl filled in when live) */}
      <UpgradeModal
        price="PRO Plan"
        // stripeLink="https://buy.stripe.com/…"   ← uncomment + fill when Stripe is ready
        // qrImageUrl="/pro-qr.png"                ← uncomment + add QR image when ready
      />

      {/* Layer 10: pricing / plan comparison modal */}
      <PricingModal
        price="€4.99 / month"
        // stripeLink="https://buy.stripe.com/…"   ← same link as UpgradeModal
      />

      <SupportModal
        qrImageUrl="/stripe-qr.png"
        donationLink="https://buy.stripe.com/14AaEXfak7HT744daj8g001"
      />
    </div>
  )
}
