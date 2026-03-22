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
import { BottomDock } from '@/components/BottomDock'
import { useUserPosition } from '@/features/gps/useUserPosition'
import { useAudioUnlock } from '@/features/audio/useAudioUnlock'
import { EvMarkerLayer } from '@/features/ev/EvMarkerLayer'
import { StationPanel } from '@/features/ev/StationPanel'
import { FilterBar } from '@/features/ev/FilterBar'
import { EventMarkerLayer } from '@/features/events/EventMarkerLayer'
import { ReportModal } from '@/features/events/ReportModal'
import { EventPanel } from '@/features/events/EventPanel'

export function App() {
  // Start GPS watching (feeds gpsStore; no rerenders from GPS ticks)
  useUserPosition()

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

      {/* Layer 1: floating UI */}
      <FloatingTitleCard />
      <SearchBar />
      <FloatingStatsCard />
      <LeftControls />
      <ZoomControls />
      <BottomDock />

      {/* Layer 2: panels + filter bar (above dock) */}
      <FilterBar />
      <StationPanel />
      <EventPanel />

      {/* Layer 3: modal overlays */}
      <ReportModal />
    </div>
  )
}
