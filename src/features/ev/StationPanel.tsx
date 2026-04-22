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
import { t, getLang, langStore } from '@/lib/locale'
import { buildWazeDeepLink } from '@/lib/waze'
import type { NormalizedStation, Connector } from './types'

export function StationPanel() {
  // Re-render on country/language change
  useSyncExternalStore(langStore.subscribe.bind(langStore), getLang, getLang)

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
                  aria-label={t('common.close')}
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
                <InfoItem label={t('station.network')} value={station.network} />
              )}
              {station.totalPorts > 0 && (
                <InfoItem
                  label={t('station.ports')}
                  value={
                    station.availablePorts != null
                      ? `${station.availablePorts}/${station.totalPorts} ${t('filter.available').toLowerCase()}`
                      : String(station.totalPorts)
                  }
                />
              )}
              {station.maxPowerKw != null && (
                <InfoItem label={t('station.maxPower')} value={`${station.maxPowerKw} kW`} />
              )}
              {station.pricePerKwh != null ? (
                <InfoItem
                  label={t('station.price')}
                  value={
                    station.pricePerKwh === 0
                      ? t('station.free')
                      : `${station.pricePerKwh.toFixed(2)} ${station.priceCurrency ?? ''}/kWh`.trim()
                  }
                />
              ) : station.isFree != null ? (
                <InfoItem label={t('station.price')} value={station.isFree ? t('station.free') : t('station.paid')} />
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
                    ? t('station.justUpdated')
                    : `${t('station.updatedPrefix')} ${formatAge(station.lastUpdated)}`}
                </div>
                <button
                  onClick={() => void handleRefresh()}
                  disabled={refreshing}
                  title={t('station.refreshTitle')}
                  aria-label={t('station.refreshTitle')}
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
                  {refreshing ? t('station.refreshing') : t('station.refresh')}
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
                {t('station.navigate')}
              </button>

              {/* Waze deep link — web only (Waze is not available in Tesla browser) */}
              {!isTeslaBrowser && (
                <a
                  href={buildWazeDeepLink({ lat: station.lat, lon: station.lng, navigate: true, query: station.name })}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label="Open in Waze"
                  title="Open in Waze"
                  style={{
                    padding: '11px 14px',
                    borderRadius: 10,
                    background: '#07C5CE22',
                    border: '1.5px solid #07C5CE55',
                    color: '#07C5CE',
                    fontSize: 13,
                    fontWeight: 700,
                    cursor: 'pointer',
                    touchAction: 'manipulation',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 5,
                    textDecoration: 'none',
                    flexShrink: 0,
                  }}
                >
                  <WazeIcon />
                  Waze
                </a>
              )}
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
  const lang = getLang()
  const ms   = Date.now() - new Date(iso).getTime()
  const days = Math.floor(ms / 86_400_000)
  if (days > 0) return lang === 'bg' ? `преди ${days}д` : `${days}d ago`
  const hr = Math.floor(ms / 3_600_000)
  if (hr > 0)   return lang === 'bg' ? `преди ${hr}ч` : `${hr}h ago`
  return lang === 'bg' ? 'току-що' : 'just now'
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

function WazeIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M12 2C6.477 2 2 6.477 2 12c0 2.09.638 4.03 1.728 5.635L2.5 21l3.48-1.188A9.956 9.956 0 0 0 12 22c5.523 0 10-4.477 10-10S17.523 2 12 2zm0 18a8 8 0 0 1-4.073-1.112l-.292-.174-3.025 1.033.982-3.094-.19-.31A8 8 0 1 1 12 20zm4.077-6.022c-.222-.111-1.315-.648-1.518-.722-.203-.074-.351-.111-.499.111-.148.222-.574.722-.703.87-.129.148-.259.167-.48.056-.223-.111-.94-.346-1.79-1.104-.661-.59-1.107-1.319-1.237-1.541-.129-.222-.014-.342.097-.453.1-.099.222-.26.333-.389.111-.13.148-.222.222-.37.074-.148.037-.278-.018-.389-.056-.111-.499-1.203-.684-1.648-.18-.432-.363-.374-.499-.38-.129-.007-.278-.009-.426-.009-.148 0-.389.056-.593.278-.203.222-.78.762-.78 1.857 0 1.096.799 2.154.91 2.302.111.148 1.573 2.4 3.81 3.366.532.229.948.366 1.272.469.535.17 1.021.146 1.406.088.429-.064 1.315-.537 1.5-1.057.186-.52.186-.965.13-1.057-.055-.092-.203-.148-.426-.259z"/>
    </svg>
  )
}

function StatusBadge({ status }: { status: NormalizedStation['status'] }) {
  const key: Record<string, string> = {
    available: 'station.statusAvailable',
    busy:      'station.statusBusy',
    offline:   'station.statusOffline',
    planned:   'station.statusPlanned',
  }
  const colors: Record<string, string> = {
    available: '#22c55e',
    busy:      '#f59e0b',
    offline:   '#ef4444',
    planned:   '#8b8b8b',
    unknown:   '#8b8b8b',
  }
  const color = colors[status] ?? colors['unknown']!
  const label = key[status] ? t(key[status]!) : '?'
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
