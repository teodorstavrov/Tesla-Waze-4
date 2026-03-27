// ─── EV Filter Bar ─────────────────────────────────────────────────────
// Horizontal chip strip above the bottom dock.
// Only rendered when EV markers are visible AND no active route.
// Hides when RoutePanel is showing (both occupy the same bottom: 90 slot).

import { useSyncExternalStore } from 'react'
import { evStore } from './evStore.js'
import { filterStore } from './filterStore.js'
import { routeStore } from '@/features/route/routeStore'
import type { ConnectorFilter, PowerFilter } from './filterStore.js'

export function FilterBar() {
  const markersVisible = useSyncExternalStore(
    evStore.subscribe.bind(evStore),
    () => evStore.getState().markersVisible,
    () => true,
  )

  const filterState = useSyncExternalStore(
    filterStore.subscribe.bind(filterStore),
    () => filterStore.getState(),
    () => filterStore.getState(),
  )

  const routeStatus = useSyncExternalStore(
    routeStore.subscribe.bind(routeStore),
    () => routeStore.getState().status,
    () => 'idle' as const,
  )

  if (!markersVisible || routeStatus !== 'idle') return null

  const { connector, minPowerKw, onlyAvailable } = filterState

  return (
    <div
      style={{
        position: 'absolute',
        bottom: 90,
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 400,
        display: 'flex',
        gap: 6,
        alignItems: 'center',
        overflowX: 'auto',
        maxWidth: 'calc(100vw - 24px)',
        scrollbarWidth: 'none',
        WebkitOverflowScrolling: 'touch' as React.CSSProperties['WebkitOverflowScrolling'],
        paddingBottom: 2,
      }}
      role="group"
      aria-label="Филтри за зарядни станции"
    >
      {/* Connector chips */}
      <Chip
        label="Tesla"
        color="#e31937"
        active={connector === 'Tesla'}
        onClick={() => filterStore.setConnector('Tesla')}
      />
      <Chip
        label="CCS"
        active={connector === 'CCS'}
        onClick={() => filterStore.setConnector('CCS')}
      />
      <Chip
        label="CHAdeMO"
        active={connector === 'CHAdeMO'}
        onClick={() => filterStore.setConnector('CHAdeMO')}
      />
      <Chip
        label="Type 2"
        active={connector === 'Type2'}
        onClick={() => filterStore.setConnector('Type2' as ConnectorFilter)}
      />

      <Divider />

      {/* Power chips */}
      <Chip
        label="50kW+"
        color="#22c55e"
        active={minPowerKw === 50}
        onClick={() => filterStore.setMinPower(50 as PowerFilter)}
      />
      <Chip
        label="150kW+"
        color="#F59E0B"
        active={minPowerKw === 150}
        onClick={() => filterStore.setMinPower(150 as PowerFilter)}
      />

      <Divider />

      {/* Availability */}
      <Chip
        label="Свободни"
        active={onlyAvailable}
        onClick={() => filterStore.toggleAvailable()}
      />

      {/* Reset */}
      {filterStore.isActive() && (
        <Chip
          label="✕ Изчисти"
          active={false}
          muted
          onClick={() => filterStore.reset()}
        />
      )}
    </div>
  )
}

// ── Sub-components ────────────────────────────────────────────────

interface ChipProps {
  label: string
  active: boolean
  color?: string
  muted?: boolean
  onClick: () => void
}

function Chip({ label, active, color, muted, onClick }: ChipProps) {
  const accentColor = color ?? '#e31937'

  return (
    <button
      onClick={onClick}
      style={{
        flexShrink: 0,
        padding: '6px 12px',
        borderRadius: 20,
        border: `1px solid ${active ? accentColor : 'var(--glass-border)'}`,
        background: active
          ? `${accentColor}28`
          : muted
          ? 'var(--surface-hover)'
          : 'var(--glass-bg)',
        backdropFilter: 'blur(16px)',
        WebkitBackdropFilter: 'blur(16px)',
        color: active ? accentColor : muted ? 'var(--text-secondary)' : 'var(--text-primary)',
        fontSize: 12,
        fontWeight: active ? 700 : 500,
        cursor: 'pointer',
        touchAction: 'manipulation',
        transition: 'background 0.12s, border-color 0.12s, color 0.12s',
        whiteSpace: 'nowrap',
        userSelect: 'none',
        WebkitUserSelect: 'none',
        boxShadow: active
          ? `0 0 0 1px ${accentColor}44, 0 2px 8px rgba(0,0,0,0.5)`
          : '0 2px 8px rgba(0,0,0,0.4)',
      }}
    >
      {label}
    </button>
  )
}

function Divider() {
  return (
    <div style={{
      flexShrink: 0,
      width: 1,
      height: 20,
      background: 'rgba(255,255,255,0.14)',
      borderRadius: 1,
    }} />
  )
}
