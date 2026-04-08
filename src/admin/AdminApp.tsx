// ─── Tesla Radar Admin Panel ────────────────────────────────────────────
// Left: stats + event list. Right: Leaflet map — click to add markers,
// click marker popup → delete.

import { useState, useEffect, useCallback, useRef } from 'react'
import type L from 'leaflet'

const EVENT_LABELS: Record<string, string> = {
  police:       '🚔 Полиция',
  accident:     '💥 Катастрофа',
  hazard:       '⚠️ Опасност',
  traffic:      '🚗 Задръстване',
  camera:      '📷 Камера',
  construction: '🏗️ Строителство',
}
const EVENT_TYPES = Object.keys(EVENT_LABELS) as EventType[]
type EventType = 'police' | 'accident' | 'hazard' | 'traffic' | 'camera' | 'construction'

interface Stats {
  redis: boolean
  stationCount: number | null
  lastSync: string | null
  eventCount: number
  providers: Record<string, { status: string; count: number }> | null
}

interface RoadEvent {
  id: string
  type: EventType
  lat: number
  lng: number
  reportedAt: string
  expiresAt: string
  confirms: number
  description: string | null
  permanent?: boolean
}

// ── Styles ──────────────────────────────────────────────────────────────

const S = {
  badge: (ok: boolean) => ({
    display: 'inline-block', padding: '2px 10px', borderRadius: 99,
    fontSize: 11, fontWeight: 600,
    background: ok ? '#22c55e22' : '#ef444422',
    color: ok ? '#4ade80' : '#f87171',
  } as const),
  btn: {
    padding: '8px 16px', borderRadius: 8, border: 'none',
    cursor: 'pointer', fontWeight: 600, fontSize: 13,
  } as const,
}

// ── Auth screen ──────────────────────────────────────────────────────────

function LoginScreen({ onLogin }: { onLogin: (secret: string) => void }) {
  const [secret, setSecret] = useState('')
  const [error, setError]   = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true); setError('')
    try {
      const r = await fetch('/api/admin/stats', { headers: { Authorization: `Bearer ${secret}` } })
      if (r.ok) { sessionStorage.setItem('admin_secret', secret); onLogin(secret) }
      else setError('Wrong secret')
    } catch { setError('Network error') }
    finally { setLoading(false) }
  }

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ background: '#161622', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 12, padding: '28px 32px', width: 340, textAlign: 'center' }}>
        <div style={{ fontSize: 22, fontWeight: 700, marginBottom: 24 }}>🔐 Tesla Radar Admin</div>
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <input
            type="password" placeholder="Admin secret" value={secret}
            onChange={(e) => setSecret(e.target.value)} autoFocus
            style={{ background: '#0d0d14', border: '1px solid rgba(255,255,255,0.15)', borderRadius: 8, color: '#fff', padding: '10px 14px', fontSize: 15, outline: 'none' }}
          />
          {error && <div style={{ color: '#f87171', fontSize: 13 }}>{error}</div>}
          <button type="submit" disabled={!secret || loading}
            style={{ ...S.btn, background: '#e31937', color: '#fff', opacity: (!secret || loading) ? 0.5 : 1 }}>
            {loading ? 'Checking…' : 'Login'}
          </button>
        </form>
      </div>
    </div>
  )
}

// ── Dashboard ────────────────────────────────────────────────────────────

function Dashboard({ secret }: { secret: string }) {
  const [stats,   setStats]   = useState<Stats | null>(null)
  const [events,  setEvents]  = useState<RoadEvent[]>([])
  const [syncing, setSyncing] = useState(false)
  const [syncMsg, setSyncMsg] = useState('')
  const [addMode, setAddMode] = useState(false)
  const [selType, setSelType] = useState<EventType>('police')

  const headers = { Authorization: `Bearer ${secret}` }

  const loadAll = useCallback(async () => {
    const [sr, er] = await Promise.all([
      fetch('/api/admin/stats',  { headers }),
      fetch('/api/admin/events', { headers }),
    ])
    if (sr.ok) setStats(await sr.json() as Stats)
    if (er.ok) setEvents(((await er.json()) as { events: RoadEvent[] }).events)
  }, [secret]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { void loadAll() }, [loadAll])

  async function triggerSync() {
    setSyncing(true); setSyncMsg('')
    try {
      const cronSecret = prompt('Enter CRON_SECRET:')
      if (!cronSecret) { setSyncing(false); return }
      const r = await fetch(`/api/cron/sync-stations?secret=${encodeURIComponent(cronSecret)}`)
      const data = await r.json() as Record<string, unknown>
      setSyncMsg(r.ok ? `✅ Synced ${String(data.stations)} stations` : `❌ ${String(data.error)}`)
      if (r.ok) await loadAll()
    } catch { setSyncMsg('❌ Network error') }
    finally { setSyncing(false) }
  }

  async function deleteEvent(id: string) {
    await fetch(`/api/admin/events?id=${id}`, { method: 'DELETE', headers })
    setEvents((prev) => prev.filter((e) => e.id !== id))
  }

  async function addEvent(lat: number, lng: number) {
    const r = await fetch('/api/admin/events', {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: selType, lat, lng }),
    })
    if (r.ok) {
      const { event } = await r.json() as { event: RoadEvent }
      setEvents((prev) => [event, ...prev])
    }
  }

  function fmt(iso: string) {
    return new Date(iso).toLocaleString('bg-BG', { dateStyle: 'short', timeStyle: 'short' })
  }

  return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden', background: '#0d0d14' }}>

      {/* ── Left sidebar ── */}
      <div style={{
        width: 300, flexShrink: 0,
        display: 'flex', flexDirection: 'column',
        borderRight: '1px solid rgba(255,255,255,0.07)',
        overflowY: 'auto',
      }}>
        {/* Header */}
        <div style={{ padding: '18px 18px 12px', borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ fontSize: 16, fontWeight: 700 }}>⚡ Admin</div>
            <button
              style={{ ...S.btn, padding: '5px 12px', background: 'rgba(255,255,255,0.07)', color: '#aaa' }}
              onClick={() => { sessionStorage.removeItem('admin_secret'); location.reload() }}>
              Logout
            </button>
          </div>
        </div>

        {/* Stats */}
        {stats && (
          <div style={{ padding: '14px 18px', borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px 14px', marginBottom: 12 }}>
              <StatBox label="Redis"   value={<span style={S.badge(stats.redis)}>{stats.redis ? 'OK' : 'Offline'}</span>} />
              <StatBox label="Stations" value={stats.stationCount ?? '—'} />
              <StatBox label="Events"  value={events.length} />
              <StatBox label="Last Sync" value={stats.lastSync ? fmt(stats.lastSync) : '—'} small />
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button style={{ ...S.btn, background: '#e31937', color: '#fff', flex: 1 }}
                onClick={() => { void triggerSync() }} disabled={syncing}>
                {syncing ? 'Syncing…' : '↻ Sync'}
              </button>
              <button style={{ ...S.btn, background: 'rgba(255,255,255,0.07)', color: '#ccc' }}
                onClick={() => { void loadAll() }}>
                ↺
              </button>
            </div>
            {syncMsg && <div style={{ fontSize: 12, color: '#888', marginTop: 8 }}>{syncMsg}</div>}
          </div>
        )}

        {/* Add marker controls */}
        <div style={{ padding: '14px 18px', borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: '#888', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 10 }}>
            Добави маркер
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginBottom: 10 }}>
            {EVENT_TYPES.map((t) => (
              <button key={t} onClick={() => setSelType(t)}
                style={{
                  padding: '6px 10px', borderRadius: 7, cursor: 'pointer', fontSize: 12,
                  border: `1px solid ${selType === t ? 'rgba(227,25,55,0.7)' : 'rgba(255,255,255,0.1)'}`,
                  background: selType === t ? 'rgba(227,25,55,0.18)' : 'rgba(255,255,255,0.04)',
                  color: selType === t ? '#fff' : '#aaa', fontWeight: selType === t ? 700 : 400,
                }}>
                {EVENT_LABELS[t]}
              </button>
            ))}
          </div>
          <button
            onClick={() => setAddMode((v) => !v)}
            style={{
              ...S.btn, width: '100%',
              background: addMode ? '#22c55e22' : 'rgba(255,255,255,0.06)',
              border: `1px solid ${addMode ? '#22c55e66' : 'rgba(255,255,255,0.1)'}`,
              color: addMode ? '#4ade80' : '#ccc',
            }}>
            {addMode ? '✅ Режим: кликни на картата' : '📍 Режим добавяне'}
          </button>
        </div>

        {/* Event stats */}
        <EventStats events={events} />
      </div>

      {/* ── Map ── */}
      <div style={{ flex: 1, position: 'relative' }}>
        {addMode && (
          <div style={{
            position: 'absolute', top: 12, left: '50%', transform: 'translateX(-50%)',
            background: 'rgba(34,197,94,0.15)', border: '1px solid #22c55e66',
            color: '#4ade80', borderRadius: 8, padding: '8px 16px',
            fontSize: 13, fontWeight: 600, zIndex: 1000, pointerEvents: 'none',
            whiteSpace: 'nowrap',
          }}>
            📍 Кликни на картата за да добавиш: {EVENT_LABELS[selType]}
          </div>
        )}
        <AdminMap
          events={events}
          addMode={addMode}
          onMapClick={(lat, lng) => { void addEvent(lat, lng) }}
          onDelete={(id) => { void deleteEvent(id) }}
        />
      </div>
    </div>
  )
}

// ── Country bounds (for grouping) ───────────────────────────────────────

function countryFromCoords(lat: number, lng: number): string {
  if (lat >= 41.235 && lat <= 44.215 && lng >= 22.36 && lng <= 28.609) return '🇧🇬 България'
  if (lat >= 57.959 && lat <= 71.182 && lng >= 4.479  && lng <= 31.293) return '🇳🇴 Norge'
  return '🌍 Друго'
}

// ── Event stats panel ────────────────────────────────────────────────────

function EventStats({ events }: { events: RoadEvent[] }) {
  const [cities, setCities] = useState<Record<string, number>>({})
  const [citiesLoading, setCitiesLoading] = useState(false)

  // Group by country
  const byCountry: Record<string, number> = {}
  for (const ev of events) {
    const c = countryFromCoords(ev.lat, ev.lng)
    byCountry[c] = (byCountry[c] ?? 0) + 1
  }

  // Group by type
  const byType: Record<string, number> = {}
  for (const ev of events) {
    byType[ev.type] = (byType[ev.type] ?? 0) + 1
  }

  const permanentCount = events.filter((e) => e.permanent).length
  const userCount      = events.length - permanentCount

  async function loadCities() {
    if (citiesLoading) return
    setCitiesLoading(true)
    const grouped: Record<string, number> = {}

    // Deduplicate by 0.02° grid (~2km) to minimize API calls
    const seen = new Map<string, { lat: number; lng: number }>()
    for (const ev of events) {
      const key = `${(ev.lat * 50 | 0)},${(ev.lng * 50 | 0)}`
      if (!seen.has(key)) seen.set(key, { lat: ev.lat, lng: ev.lng })
    }

    const cells = Array.from(seen.entries())
    const cellCity: Record<string, string> = {}

    for (const [key, { lat, lng }] of cells) {
      try {
        const r = await fetch(
          `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json&zoom=10`,
          { headers: { 'Accept-Language': 'bg,en' } }
        )
        const data = await r.json() as { address?: { city?: string; town?: string; village?: string; county?: string } }
        const city = data.address?.city ?? data.address?.town ?? data.address?.village ?? data.address?.county ?? '—'
        cellCity[key] = city
      } catch {
        cellCity[key] = '—'
      }
      // Nominatim ToS: 1 req/sec
      await new Promise((res) => setTimeout(res, 1100))
    }

    // Map each event to its cell's city
    for (const ev of events) {
      const key  = `${(ev.lat * 50 | 0)},${(ev.lng * 50 | 0)}`
      const city = cellCity[key] ?? '—'
      grouped[city] = (grouped[city] ?? 0) + 1
    }

    setCities(grouped)
    setCitiesLoading(false)
  }

  const sortedCities = Object.entries(cities).sort((a, b) => b[1] - a[1])

  return (
    <div style={{ flex: 1, overflowY: 'auto', padding: '14px 18px' }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: '#888', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 10 }}>
        Статистика ({events.length} маркера)
      </div>

      {/* Permanent vs user */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
        <div style={{ flex: 1, background: 'rgba(227,25,55,0.12)', border: '1px solid rgba(227,25,55,0.25)', borderRadius: 8, padding: '8px 10px', textAlign: 'center' }}>
          <div style={{ fontSize: 18, fontWeight: 700, color: '#e31937' }}>{permanentCount}</div>
          <div style={{ fontSize: 10, color: '#888', marginTop: 2 }}>Служебни</div>
        </div>
        <div style={{ flex: 1, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 8, padding: '8px 10px', textAlign: 'center' }}>
          <div style={{ fontSize: 18, fontWeight: 700, color: '#fff' }}>{userCount}</div>
          <div style={{ fontSize: 10, color: '#888', marginTop: 2 }}>Потребителски</div>
        </div>
      </div>

      {/* By country */}
      <div style={{ marginBottom: 14 }}>
        <div style={{ fontSize: 11, color: '#666', marginBottom: 6 }}>По държава</div>
        {Object.entries(byCountry).map(([c, n]) => (
          <Row key={c} label={c} count={n} total={events.length} />
        ))}
      </div>

      {/* By type */}
      <div style={{ marginBottom: 14 }}>
        <div style={{ fontSize: 11, color: '#666', marginBottom: 6 }}>По тип</div>
        {Object.entries(byType).sort((a, b) => b[1] - a[1]).map(([t, n]) => (
          <Row key={t} label={EVENT_LABELS[t as EventType] ?? t} count={n} total={events.length} />
        ))}
      </div>

      {/* By city — lazy */}
      <div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
          <div style={{ fontSize: 11, color: '#666' }}>По град</div>
          {sortedCities.length === 0 && !citiesLoading && (
            <button
              onClick={() => { void loadCities() }}
              style={{ fontSize: 11, padding: '2px 8px', borderRadius: 5, border: '1px solid rgba(255,255,255,0.15)', background: 'rgba(255,255,255,0.06)', color: '#aaa', cursor: 'pointer' }}>
              Зареди
            </button>
          )}
          {citiesLoading && <span style={{ fontSize: 11, color: '#666' }}>Зарежда се…</span>}
        </div>
        {sortedCities.map(([city, n]) => (
          <Row key={city} label={city} count={n} total={events.length} />
        ))}
      </div>
    </div>
  )
}

function Row({ label, count, total }: { label: string; count: number; total: number }) {
  const pct = total > 0 ? Math.round((count / total) * 100) : 0
  return (
    <div style={{ marginBottom: 5 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 2 }}>
        <span style={{ fontSize: 12, color: '#ccc' }}>{label}</span>
        <span style={{ fontSize: 12, color: '#888' }}>{count}</span>
      </div>
      <div style={{ height: 4, borderRadius: 2, background: 'rgba(255,255,255,0.07)' }}>
        <div style={{ height: '100%', width: `${pct}%`, borderRadius: 2, background: '#e31937', transition: 'width 0.3s ease' }} />
      </div>
    </div>
  )
}

// ── Leaflet map component ────────────────────────────────────────────────

interface AdminMapProps {
  events: RoadEvent[]
  addMode: boolean
  onMapClick: (lat: number, lng: number) => void
  onDelete: (id: string) => void
}

function AdminMap({ events, addMode, onMapClick, onDelete }: AdminMapProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef       = useRef<L.Map | null>(null)
  const markersRef   = useRef<Map<string, L.Marker>>(new Map())
  const addModeRef   = useRef(addMode)
  const onClickRef   = useRef(onMapClick)
  const onDeleteRef  = useRef(onDelete)

  // Keep refs in sync (avoids stale cameras in Leaflet handlers)
  addModeRef.current  = addMode
  onClickRef.current  = onMapClick
  onDeleteRef.current = onDelete

  // Init map once
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return

    void import('leaflet').then((Lm) => {
      const L = Lm.default

      const map = L.map(containerRef.current!, {
        center: [42.73, 25.5],
        zoom: 8,
        zoomControl: true,
      })

      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap',
        maxZoom: 19,
      }).addTo(map)

      map.on('click', (e: L.LeafletMouseEvent) => {
        if (!addModeRef.current) return
        onClickRef.current(e.latlng.lat, e.latlng.lng)
      })

      mapRef.current = map
    })

    return () => {
      mapRef.current?.remove()
      mapRef.current = null
      markersRef.current.clear()
    }
  }, [])

  // Sync cursor style when addMode changes
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    el.style.cursor = addMode ? 'crosshair' : ''
  }, [addMode])

  // Sync markers when events change
  useEffect(() => {
    const map = mapRef.current
    if (!map) return

    void import('leaflet').then((Lm) => {
      const L = Lm.default

      const currentIds = new Set(events.map((e) => e.id))

      // Remove stale markers
      for (const [id, marker] of markersRef.current) {
        if (!currentIds.has(id)) {
          marker.remove()
          markersRef.current.delete(id)
        }
      }

      // Add new markers
      for (const ev of events) {
        if (markersRef.current.has(ev.id)) continue

        const icon = L.divIcon({
          className: '',
          html: `<div style="
            font-size:24px;line-height:1;
            filter:drop-shadow(0 1px 3px rgba(0,0,0,0.8));
            cursor:pointer;
          ">${eventEmoji(ev.type)}</div>`,
          iconSize:   [28, 28],
          iconAnchor: [14, 14],
        })

        const marker = L.marker([ev.lat, ev.lng], { icon }).addTo(map)

        marker.bindPopup(buildPopup(ev), { maxWidth: 220 })
        marker.on('popupopen', () => {
          const btn = document.getElementById(`del-${ev.id}`)
          btn?.addEventListener('click', () => {
            marker.closePopup()
            onDeleteRef.current(ev.id)
          })
        })

        markersRef.current.set(ev.id, marker)
      }
    })
  }, [events])

  return <div ref={containerRef} style={{ width: '100%', height: '100%' }} />
}

function eventEmoji(type: string): string {
  const map: Record<string, string> = {
    police: '🚔', accident: '💥', hazard: '⚠️',
    traffic: '🚗', camera: '🚧', construction: '🏗️',
  }
  return map[type] ?? '📍'
}

function buildPopup(ev: RoadEvent): string {
  const label = EVENT_LABELS[ev.type] ?? ev.type
  const date  = new Date(ev.reportedAt).toLocaleString('bg-BG', { dateStyle: 'short', timeStyle: 'short' })
  return `
    <div style="font-family:system-ui,sans-serif;font-size:13px;min-width:160px;">
      <div style="font-weight:700;font-size:15px;margin-bottom:4px;">${label}</div>
      <div style="color:#888;margin-bottom:2px;">${ev.lat.toFixed(5)}, ${ev.lng.toFixed(5)}</div>
      <div style="color:#888;margin-bottom:10px;">${date}</div>
      <button id="del-${ev.id}" style="
        width:100%;padding:7px 0;border-radius:7px;
        background:#ef444422;border:1px solid #f8717155;
        color:#f87171;font-size:13px;font-weight:600;cursor:pointer;
      ">🗑️ Изтрий</button>
    </div>
  `
}

// ── Helpers ──────────────────────────────────────────────────────────────

function StatBox({ label, value, small = false }: { label: string; value: React.ReactNode; small?: boolean }) {
  return (
    <div>
      <div style={{ fontSize: 11, color: '#666', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 2 }}>{label}</div>
      <div style={{ fontSize: small ? 13 : 20, fontWeight: 700, color: '#fff' }}>{value}</div>
    </div>
  )
}

// ── Root ─────────────────────────────────────────────────────────────────

export function AdminApp() {
  const [secret, setSecret] = useState(() => sessionStorage.getItem('admin_secret') ?? '')
  if (!secret) return <LoginScreen onLogin={setSecret} />
  return <Dashboard secret={secret} />
}
