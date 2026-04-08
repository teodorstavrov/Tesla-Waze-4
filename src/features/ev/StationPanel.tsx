// ─── Station Detail Panel ──────────────────────────────────────────────
// Bottom sheet that slides up when a station marker is tapped.
// Subscribes to evStore.selectedStation — null → hidden.
//
// TESLA MODE: always in DOM, visibility-toggled (same rationale as EventPanel).

import { useSyncExternalStore, useEffect, useState, useCallback } from 'react'
import { evStore } from './evStore'
import { audioManager } from '@/features/audio/audioManager'
import { routeStore } from '@/features/route/routeStore'
import { getMap } from '@/components/MapShell'
import { isTeslaBrowser } from '@/lib/browser'
import type { NormalizedStation, Connector } from './types'

export function StationPanel() {
  const station = useSyncExternalStore(
    evStore.subscribe.bind(evStore),
    () => evStore.getState().selectedStation,
    () => null,
  )

  const [shown, setShown] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [refreshedAt, setRefreshedAt] = useState<number | null>(null)

  const handleRefresh = useCallback(async () => {
    if (refreshing) return
    setRefreshing(true)
    const map = getMap()
    const bounds = map?.getBounds()
    const bbox = bounds
      ? { minLat: bounds.getSouth(), minLng: bounds.getWest(), maxLat: bounds.getNorth(), maxLng: bounds.getEast() }
      : { minLat: 41.0, minLng: 22.0, maxLat: 44.5, maxLng: 28.7 }
    await evStore.forceRefresh(bbox)
    setRefreshing(false)
    setRefreshedAt(Date.now())
  }, [refreshing])

  useEffect(() => {
    if (station) {
      audioManager.uiBeep()
      if (!isTeslaBrowser) {
        setShown(false)
        requestAnimationFrame(() => requestAnimationFrame(() => setShown(true)))
      }
    } else {
      setShown(false)
    }
  }, [station?.id])

  const isVisible = Boolean(station)

  if (!isTeslaBrowser && !isVisible) return null

  return (
    // ── Tesla: always-present host — visibility toggled via aria-hidden ──
    <div
      className={isTeslaBrowser ? 'tesla-overlay-host' : undefined}
      aria-hidden={isTeslaBrowser ? !isVisible : undefined}
      style={{
        position:  'absolute',
        // On narrow phones the panel needs to sit above the bottom dock.
        // Formula: 375px→99px · 480px→79px · 768px→24px · 900px+→24px
        bottom:    'max(24px, calc(170px - 19vw))',
        left:      '50%',
        transform: 'translateX(-50%)',
        width:     'min(400px, calc(100vw - 24px))',
        zIndex:    500,
      }}
    >
      <div
        role="dialog"
        aria-label={station?.name ?? ''}
        className={isTeslaBrowser ? 'glass tesla-overlay-inner' : 'glass'}
        style={{
          padding:       '16px 20px',
          display:       'flex',
          flexDirection: 'column',
          gap:           12,
          ...(isTeslaBrowser ? {} : {
            opacity:       shown ? 1 : 0,
            transform:     shown ? 'scale(1)' : 'scale(0.97)',
            transition:    'opacity 0.2s ease-out, transform 0.2s ease-out',
          }),
        }}
      >
        {station && (
          <>
            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{
                  fontSize: 18, fontWeight: 700,
                  color: 'var(--text-primary)',
                  whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                }}>
                  {station.name}
                </div>
                {(station.address || station.city) && (
                  <div style={{ fontSize: 14, color: 'var(--text-secondary)', marginTop: 2 }}>
                    {[station.address, station.city].filter(Boolean).join(', ')}
                  </div>
                )}
              </div>

              <div style={{ display: 'flex', gap: 6, flexShrink: 0, alignItems: 'center' }}>
                <SourceBadge source={station.source} />
                <StatusBadge status={station.status} />
                <button
                  onClick={() => evStore.selectStation(null)}
                  aria-label="Затвори"
                  style={{
                    background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.12)',
                    color: 'var(--text-secondary)', cursor: 'pointer',
                    padding: 0, borderRadius: 8, lineHeight: 1, flexShrink: 0,
                    width: 36, height: 36, display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}
                >
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true"
                    stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
                    <line x1="3" y1="3" x2="13" y2="13" />
                    <line x1="13" y1="3" x2="3" y2="13" />
                  </svg>
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
              {station.pricePerKwh != null ? (
                <InfoItem
                  label="Цена"
                  value={
                    station.pricePerKwh === 0
                      ? 'Безплатно'
                      : `${station.pricePerKwh.toFixed(2)} ${station.priceCurrency ?? ''}/kWh`.trim()
                  }
                />
              ) : station.isFree != null ? (
                <InfoItem label="Цена" value={station.isFree ? 'Безплатно' : 'Платено'} />
              ) : null}
            </div>

            {/* Connectors */}
            {station.connectors.length > 0 && (
              <ConnectorList connectors={station.connectors} />
            )}

            {/* Last updated + refresh */}
            {station.lastUpdated && (
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                  {refreshedAt
                    ? 'Обновено преди малко ✓'
                    : `Обновено ${formatAge(station.lastUpdated)}`}
                </div>
                <button
                  onClick={() => void handleRefresh()}
                  disabled={refreshing}
                  title="Обнови данните"
                  aria-label="Обнови данните"
                  style={{
                    background: 'rgba(255,255,255,0.06)',
                    border: '1px solid rgba(255,255,255,0.12)',
                    borderRadius: 8, cursor: refreshing ? 'default' : 'pointer',
                    padding: '5px 10px', display: 'flex', alignItems: 'center', gap: 5,
                    color: refreshing ? 'rgba(255,255,255,0.3)' : 'rgba(255,255,255,0.6)',
                    fontSize: 12, fontWeight: 600, touchAction: 'manipulation',
                  }}
                >
                  <RefreshIcon spinning={refreshing} />
                  {refreshing ? 'Зарежда...' : 'Обнови'}
                </button>
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
                  fontSize: 15,
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
            </div>
          </>
        )}
      </div>
    </div>
  )
}

// ── Sub-components ────────────────────────────────────────────────

function InfoItem({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div style={{ fontSize: 12, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.07em' }}>
        {label}
      </div>
      <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-primary)', marginTop: 1 }}>
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
            fontSize: 13,
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

function RefreshIcon({ spinning }: { spinning: boolean }) {
  return (
    <svg
      width="13" height="13" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"
      aria-hidden="true"
      style={spinning ? { animation: 'spin 0.8s linear infinite' } : undefined}
    >
      <polyline points="23 4 23 10 17 10" />
      <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
    </svg>
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
