// ─── Tesla EV Nav — App root ───────────────────────────────────────────
// Phase 1+2: foundation shell + GPS/follow/audio UX.
// Phase 4: EV marker layer + station panel.
// Phase 6: road event markers + report modal.

import { MapShell } from '@/components/MapShell'
import { HeadingAvatar } from '@/components/HeadingAvatar'
import { FloatingTitleCard } from '@/components/FloatingTitleCard'
import { FloatingStatsCard } from '@/components/FloatingStatsCard'
import { SearchBar } from '@/components/SearchBar'
import { LeftControls } from '@/components/LeftControls'
import { ZoomControls } from '@/components/ZoomControls'
import { Speedometer } from '@/components/Speedometer'
import { BottomDock } from '@/components/BottomDock'
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
import { AlertToast } from '@/features/audio/AlertToast'
import { alertEngine } from '@/features/audio/alertEngine'

export function App() {
  // Start GPS watching (feeds gpsStore; no rerenders from GPS ticks)
  useUserPosition()

  // Start proximity alert engine (subscribes to gpsStore — no React)
  alertEngine.start()

  // Get the audio unlock trigger
  const { unlock } = useAudioUnlock()

  return (
    // Any tap on the app unlocks audio — safe since tryUnlock() is idempotent
    // eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions
    <div
      onClick={unlock}
      style={{
        position: 'relative',
        width: '100vw',
        height: '100dvh',
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
      <SearchBar />
      <FloatingStatsCard />
      <LeftControls />
      <ZoomControls />
      <Speedometer />
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
    </div>
  )
}
