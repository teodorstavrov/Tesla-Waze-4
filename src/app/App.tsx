// ─── Tesla EV Nav — App root ───────────────────────────────────────────
// Phase 1+2: foundation shell + GPS/follow/audio UX.
// Phase 4: EV marker layer + station panel.
// Phase 6: road event markers + report modal.
// Phase 14: auto dark/light theme + onboarding.
// Phase 21: turn-by-turn navigation HUD + voice directions.

import { useEffect } from 'react'
import { Analytics } from '@vercel/analytics/react'
import { MapShell } from '@/components/MapShell'
import { HeadingAvatar } from '@/components/HeadingAvatar'
import { FloatingTitleCard } from '@/components/FloatingTitleCard'
import { FloatingStatsCard } from '@/components/FloatingStatsCard'
import { SearchBar } from '@/components/SearchBar'
import { LeftControls } from '@/components/LeftControls'
import { BottomDock } from '@/components/BottomDock'
import { Onboarding } from '@/components/Onboarding'
import { useUserPosition } from '@/features/gps/useUserPosition'
import { useAudioUnlock } from '@/features/audio/useAudioUnlock'
import { EvMarkerLayer } from '@/features/ev/EvMarkerLayer'
import { StationPanel } from '@/features/ev/StationPanel'
import { FilterBar } from '@/features/ev/FilterBar'
import { EventMarkerLayer } from '@/features/events/EventMarkerLayer'
import { ReportModal } from '@/features/events/ReportModal'
import { EventPanel } from '@/features/events/EventPanel'
import { RouteLayer } from '@/features/route/RouteLayer'
import { RoutePanel } from '@/features/route/RoutePanel'
import { TurnInstruction } from '@/features/route/TurnInstruction'
import { AlertToast } from '@/features/audio/AlertToast'
import { OfflineToast } from '@/components/OfflineToast'
import { alertEngine } from '@/features/audio/alertEngine'
import { useThemeStore } from '@/features/theme/store'

export function App() {
  // Start GPS watching (feeds gpsStore; no rerenders from GPS ticks)
  useUserPosition()

  // Start proximity alert engine once on mount (not in render body — side-effect safety)
  useEffect(() => { alertEngine.start() }, [])

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
      <RouteLayer />

      {/* Layer 1: floating UI */}
      <FloatingTitleCard />
      <TurnInstruction />
      <SearchBar />
      <FloatingStatsCard />
      <LeftControls />
      <BottomDock />

      {/* Layer 2: panels + filter bar (above dock) */}
      <FilterBar />
      <RoutePanel />
      <StationPanel />
      <EventPanel />

      {/* Layer 3: modal overlays */}
      <ReportModal />

      {/* Layer 4: alert toast (above everything) */}
      <AlertToast />

      {/* Layer 5: first-visit onboarding (above toast, dismissable) */}
      <Onboarding />

      {/* Layer 6: offline indicator */}
      <OfflineToast />

      {/* Vercel Web Analytics */}
      <Analytics />
    </div>
  )
}
