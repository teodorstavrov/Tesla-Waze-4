// ─── Station Detail Panel ──────────────────────────────────────────────
// Bottom sheet that slides up when a station marker is tapped.
// Subscribes to evStore.selectedStation — null → hidden.

import { useSyncExternalStore } from 'react'
import { evStore } from './evStore'
import type { NormalizedStation, Connector } from './types'

export function StationPanel() {
  const station = useSyncExternalStore(
    evStore.subscribe.bind(evStore),
    () => evStore.getState().selectedStation,
    () => null,
  )

  if (!station) return null

  return (
    <div
      role="dialog"
      aria-label={station.name}
      style={{
        position:   'absolute',
        bottom:     90,
        left:       '50%',
        transform:  'translateX(-50%)',
        width:      'min(480px, calc(100vw - 24px))',
        zIndex:     500,
        padding:    '16px 20px',
        display:    'flex',
        flexDirection: 'column',
        gap:        12,
      }}
      className="glass"
    >
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{
            fontSize: 15, fontWeight: 700,
            color: 'var(--text-primary)',
            whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
          }}>
            {station.name}
          </div>
          {(station.address || station.city) && (
            <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 2 }}>
              {[station.address, station.city].filter(Boolean).join(', ')}
            </div>
          )}
        </div>

        <div style={{ display: 'flex', gap: 6, flexShrink: 0, alignItems: 'center' }}>
          <SourceBadge source={station.source} />
          <StatusBadge status={station.status} />
          <button
            onClick={() => evStore.selectStation(null)}
            aria-label="Close"
            style={{
              background: 'none', border: 'none',
              color: 'var(--text-secondary)', cursor: 'pointer',
              padding: 4, borderRadius: 4, lineHeight: 1,
              fontSize: 18,
            }}
          >
            ✕
          </button>
        </div>
      </div>

      {/* Info row */}
      <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap' }}>
        {station.network && (
          <InfoItem label="Network" value={station.network} />
        )}
        {station.totalPorts > 0 && (
          <InfoItem
            label="Ports"
            value={
              station.availablePorts != null
                ? `${station.availablePorts}/${station.totalPorts} free`
                : String(station.totalPorts)
            }
          />
        )}
        {station.maxPowerKw != null && (
          <InfoItem label="Max power" value={`${station.maxPowerKw} kW`} />
        )}
        {station.isFree != null && (
          <InfoItem label="Cost" value={station.isFree ? 'Free' : 'Paid'} />
        )}
      </div>

      {/* Connectors */}
      {station.connectors.length > 0 && (
        <ConnectorList connectors={station.connectors} />
      )}
    </div>
  )
}

// ── Sub-components ────────────────────────────────────────────────

function InfoItem({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div style={{ fontSize: 10, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.07em' }}>
        {label}
      </div>
      <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', marginTop: 1 }}>
        {value}
      </div>
    </div>
  )
}

function ConnectorList({ connectors }: { connectors: Connector[] }) {
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
      {connectors.map((c, i) => (
        <div
          key={i}
          style={{
            padding: '4px 10px',
            borderRadius: 12,
            background: 'rgba(255,255,255,0.08)',
            border: '1px solid rgba(255,255,255,0.12)',
            fontSize: 11,
            color: 'var(--text-primary)',
            display: 'flex',
            alignItems: 'center',
            gap: 5,
          }}
        >
          <span style={{ fontWeight: 700 }}>{c.type}</span>
          {c.powerKw != null && (
            <span style={{ color: 'var(--text-secondary)' }}>{c.powerKw} kW</span>
          )}
          {c.count > 1 && (
            <span style={{
              background: 'rgba(255,255,255,0.15)',
              borderRadius: 8, padding: '0 5px',
              fontSize: 10, fontWeight: 700,
            }}>
              ×{c.count}
            </span>
          )}
        </div>
      ))}
    </div>
  )
}

function SourceBadge({ source }: { source: NormalizedStation['source'] }) {
  const labels: Record<string, string> = {
    tesla: 'Tesla',
    ocm:   'OCM',
    osm:   'OSM',
  }
  const colors: Record<string, string> = {
    tesla: '#e31937',
    ocm:   '#2B7FFF',
    osm:   '#22c55e',
  }
  return (
    <span style={{
      fontSize: 10, fontWeight: 700, letterSpacing: '0.05em',
      padding: '2px 7px', borderRadius: 8,
      background: colors[source] ?? '#888',
      color: '#fff',
    }}>
      {labels[source] ?? source.toUpperCase()}
    </span>
  )
}

function StatusBadge({ status }: { status: NormalizedStation['status'] }) {
  const cfg: Record<string, { label: string; color: string }> = {
    available: { label: 'Open',     color: '#22c55e' },
    busy:      { label: 'Busy',     color: '#f59e0b' },
    offline:   { label: 'Offline',  color: '#ef4444' },
    planned:   { label: 'Planned',  color: '#8b8b8b' },
    unknown:   { label: '?',        color: '#8b8b8b' },
  }
  const { label, color } = cfg[status] ?? cfg['unknown']!
  return (
    <span style={{
      fontSize: 10, fontWeight: 700,
      padding: '2px 7px', borderRadius: 8,
      background: `${color}28`,
      color,
      border: `1px solid ${color}55`,
    }}>
      {label}
    </span>
  )
}
