// ─── Station Detail Panel ──────────────────────────────────────────────
// Bottom sheet that slides up when a station marker is tapped.
// Subscribes to evStore.selectedStation — null → hidden.

import { useSyncExternalStore } from 'react'
import { evStore } from './evStore'
import { routeStore } from '@/features/route/routeStore'
import { eventStore } from '@/features/events/eventStore'
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
          <InfoItem label="Мрежа" value={station.network} />
        )}
        {station.totalPorts > 0 && (
          <InfoItem
            label="Порта"
            value={
              station.availablePorts != null
                ? `${station.availablePorts}/${station.totalPorts} свободни`
                : String(station.totalPorts)
            }
          />
        )}
        {station.maxPowerKw != null && (
          <InfoItem label="Макс. мощност" value={`${station.maxPowerKw} kW`} />
        )}
        {station.isFree != null && (
          <InfoItem label="Цена" value={station.isFree ? 'Безплатно' : 'Платено'} />
        )}
      </div>

      {/* Connectors */}
      {station.connectors.length > 0 && (
        <ConnectorList connectors={station.connectors} />
      )}

      {/* Last updated */}
      {station.lastUpdated && (
        <div style={{ fontSize: 11, color: 'var(--text-secondary)', textAlign: 'right' }}>
          Обновено {formatAge(station.lastUpdated)}
        </div>
      )}

      {/* Actions */}
      <div style={{ display: 'flex', gap: 8 }}>
        <button
          onClick={() => {
            void routeStore.navigateTo({ lat: station.lat, lng: station.lng, name: station.name })
            evStore.selectStation(null)
          }}
          style={{
            flex: 1,
            padding: '11px 0',
            borderRadius: 10,
            background: '#2B7FFF22',
            border: '1.5px solid #2B7FFF55',
            color: '#2B7FFF',
            fontSize: 13,
            fontWeight: 700,
            cursor: 'pointer',
            touchAction: 'manipulation',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 6,
          }}
        >
          ↗ Навигирай
        </button>

        <button
          onClick={() => {
            evStore.selectStation(null)
            eventStore.openReportModal({ lat: station.lat, lng: station.lng })
          }}
          title="Report an issue at this station"
          style={{
            padding: '11px 14px',
            borderRadius: 10,
            background: '#f59e0b18',
            border: '1.5px solid #f59e0b55',
            color: '#f59e0b',
            fontSize: 13,
            fontWeight: 700,
            cursor: 'pointer',
            touchAction: 'manipulation',
            whiteSpace: 'nowrap',
          }}
        >
          ⚠️ Проблем
        </button>
      </div>
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

function formatAge(iso: string): string {
  const ms   = Date.now() - new Date(iso).getTime()
  const days = Math.floor(ms / 86_400_000)
  if (days > 0) return `преди ${days}д`
  const hr = Math.floor(ms / 3_600_000)
  if (hr > 0)   return `преди ${hr}ч`
  return 'току-що'
}

function SourceBadge({ source }: { source: NormalizedStation['source'] }) {
  const labels: Record<string, string> = {
    tesla: 'Tesla',
    ocm:   'OCM',
    osm:   'OSM',  // OpenStreetMap
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
    available: { label: 'Свободна',  color: '#22c55e' },
    busy:      { label: 'Заета',     color: '#f59e0b' },
    offline:   { label: 'Офлайн',   color: '#ef4444' },
    planned:   { label: 'Планирана', color: '#8b8b8b' },
    unknown:   { label: '?',         color: '#8b8b8b' },
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
