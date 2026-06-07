// ─── TesRadar Admin Panel ────────────────────────────────────────────
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
        <div style={{ fontSize: 22, fontWeight: 700, marginBottom: 24 }}>🔐 TesRadar Admin</div>
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

interface StationComment {
  id:          string
  stationId:   string
  stationName: string
  lat:         number
  lng:         number
  text:        string
  submittedAt: string
}

interface UserStation {
  id:             string
  name:           string
  lat:            number
  lng:            number
  address:        string | null
  city:           string | null
  network:        string | null
  approvalStatus: 'pending' | 'approved'
  submittedAt:    string
  submitterNotes: string | null
  totalPorts:     number
  maxPowerKw:     number | null
  connectors:     Array<{ type: string; powerKw: number | null; count: number }>
}

interface AdminMeetup {
  id:             string
  title:          string
  date:           string
  lat:            number
  lng:            number
  organizer:      string | null
  organizerPhone: string | null
  organizerEmail: string | null
  facebook:       string | null
  followers:      string[]
}

function Dashboard({ secret }: { secret: string }) {
  const [stats,        setStats]        = useState<Stats | null>(null)
  const [events,       setEvents]       = useState<RoadEvent[]>([])
  const [userStations, setUserStations] = useState<UserStation[]>([])
  const [comments,     setComments]     = useState<StationComment[]>([])
  const [meetups,      setMeetups]      = useState<AdminMeetup[]>([])
  const [syncing, setSyncing] = useState(false)
  const [syncMsg, setSyncMsg] = useState('')
  const [addMode, setAddMode] = useState(false)
  const [selType, setSelType] = useState<EventType>('police')
  const [editingEvent, setEditingEvent] = useState<RoadEvent | null>(null)

  const headers = { Authorization: `Bearer ${secret}` }

  const loadAll = useCallback(async () => {
    const [sr, er, usr, cr, mr] = await Promise.all([
      fetch('/api/admin/stats',             { headers }),
      fetch('/api/admin/events',            { headers }),
      fetch('/api/admin/user-stations',     { headers }),
      fetch('/api/admin/station-comments',  { headers }),
      fetch('/api/admin/meetups',           { headers }),
    ])
    if (sr.ok)  setStats(await sr.json() as Stats)
    if (er.ok)  setEvents(((await er.json()) as { events: RoadEvent[] }).events)
    if (usr.ok) setUserStations(((await usr.json()) as { stations: UserStation[] }).stations)
    if (cr.ok)  setComments(((await cr.json()) as { comments: StationComment[] }).comments)
    if (mr.ok)  setMeetups(((await mr.json()) as { meetups: AdminMeetup[] }).meetups)
  }, [secret]) // eslint-disable-line react-hooks/exhaustive-deps

  async function deleteMeetup(id: string) {
    if (!confirm('Изтрий събитието?')) return
    await fetch(`/api/admin/meetups?id=${encodeURIComponent(id)}`, { method: 'DELETE', headers })
    setMeetups((prev) => prev.filter((m) => m.id !== id))
  }

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
    if (editingEvent?.id === id) setEditingEvent(null)
  }

  async function updateEvent(id: string, patch: Partial<Pick<RoadEvent, 'type' | 'lat' | 'lng' | 'description' | 'permanent'>>) {
    const r = await fetch('/api/admin/events', {
      method: 'PATCH',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, ...patch }),
    })
    if (r.ok) {
      const { event } = await r.json() as { event: RoadEvent }
      setEvents((prev) => prev.map((e) => e.id === id ? event : e))
      setEditingEvent(null)
    }
  }

  async function approveUserStation(id: string) {
    const r = await fetch('/api/admin/user-stations', {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, action: 'approve' }),
    })
    if (r.ok) setUserStations((prev) => prev.map((s) => s.id === id ? { ...s, approvalStatus: 'approved' as const } : s))
  }

  async function rejectUserStation(id: string) {
    if (!confirm('Сигурен ли си, че искаш да изтриеш тази станция?')) return
    const r = await fetch('/api/admin/user-stations', {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, action: 'reject' }),
    })
    if (r.ok) setUserStations((prev) => prev.filter((s) => s.id !== id))
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

  function exportPermanent() {
    const permanent = events.filter((e) => e.permanent)
    const blob = new Blob([JSON.stringify(permanent, null, 2)], { type: 'application/json' })
    const url  = URL.createObjectURL(blob)
    const a    = document.createElement('a')
    a.href     = url
    a.download = `permanent-markers-${new Date().toISOString().slice(0, 10)}.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  async function importPermanent(file: File) {
    try {
      const text = await file.text()
      const parsed = JSON.parse(text) as RoadEvent[]
      if (!Array.isArray(parsed)) { alert('Invalid file format'); return }

      let imported = 0
      for (const ev of parsed) {
        if (!ev.type || !isFinite(ev.lat) || !isFinite(ev.lng)) continue
        const r = await fetch('/api/admin/events', {
          method: 'POST',
          headers: { ...headers, 'Content-Type': 'application/json' },
          body: JSON.stringify({ type: ev.type, lat: ev.lat, lng: ev.lng, description: ev.description }),
        })
        if (r.ok) imported++
      }
      alert(`Импортирани: ${imported} маркера`)
      await loadAll()
    } catch (e) {
      alert(`Грешка: ${String(e)}`)
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
              <StatBox label="Събития" value={meetups.length} />
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

        {/* Export / Import permanent markers */}
        <div style={{ padding: '10px 18px', borderBottom: '1px solid rgba(255,255,255,0.07)', display: 'flex', gap: 8 }}>
          <button
            style={{ ...S.btn, flex: 1, background: 'rgba(255,255,255,0.06)', color: '#ccc', fontSize: 12 }}
            onClick={exportPermanent}
            title="Изтегли JSON с всички служебни маркери">
            ⬇ Експорт
          </button>
          <label style={{ ...S.btn, flex: 1, background: 'rgba(255,255,255,0.06)', color: '#ccc', fontSize: 12, cursor: 'pointer', textAlign: 'center' }}
            title="Зареди JSON с маркери">
            ⬆ Импорт
            <input type="file" accept=".json" style={{ display: 'none' }}
              onChange={(e) => { const f = e.target.files?.[0]; if (f) void importPermanent(f); e.target.value = '' }} />
          </label>
        </div>

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

        {/* User-submitted stations */}
        <UserStationsPanel
          stations={userStations}
          onApprove={(id) => { void approveUserStation(id) }}
          onReject={(id)  => { void rejectUserStation(id) }}
        />

        {/* Community events (meetups) */}
        <MeetupsPanel meetups={meetups} onDelete={(id) => { void deleteMeetup(id) }} />

        {/* Road events list */}
        <EventsListPanel
          events={events}
          editingId={editingEvent?.id ?? null}
          onEdit={setEditingEvent}
          onDelete={(id) => { void deleteEvent(id) }}
        />
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
          userStations={userStations}
          comments={comments}
          meetups={meetups}
          addMode={addMode}
          editingEventId={editingEvent?.id ?? null}
          onMapClick={(lat, lng) => { void addEvent(lat, lng) }}
          onDelete={(id) => { void deleteEvent(id) }}
          onEdit={setEditingEvent}
          onApproveStation={(id) => { void approveUserStation(id) }}
          onRejectStation={(id)  => { void rejectUserStation(id) }}
          onDeleteMeetup={(id) => { void deleteMeetup(id) }}
        />

        {/* Edit panel overlay */}
        {editingEvent && (
          <EventEditPanel
            event={editingEvent}
            onSave={(patch) => { void updateEvent(editingEvent.id, patch) }}
            onCancel={() => setEditingEvent(null)}
          />
        )}
      </div>
    </div>
  )
}

// ── Country bounds (for grouping) ───────────────────────────────────────

function countryFromCoords(lat: number, lng: number): string {
  if (lat >= 41.235 && lat <= 44.215 && lng >= 22.36  && lng <= 28.609) return '🇧🇬 България'
  if (lat >= 57.959 && lat <= 71.182 && lng >= 4.479  && lng <= 31.293) return '🇳🇴 Norge'
  if (lat >= 55.337 && lat <= 69.060 && lng >= 11.109 && lng <= 24.166) return '🇸🇪 Sverige'
  if (lat >= 59.693 && lat <= 70.093 && lng >= 20.556 && lng <= 31.587) return '🇫🇮 Suomi'
  return '🌍 Друго'
}

const LS_HIDE_PERMANENT = 'teslaradar:hidePermanent'

// ── Event stats panel ────────────────────────────────────────────────────

function EventStats({ events }: { events: RoadEvent[] }) {
  const [cities, setCities] = useState<Record<string, number>>({})
  const [citiesLoading, setCitiesLoading] = useState(false)
  const [hidden, setHidden] = useState(() => {
    try { return localStorage.getItem(LS_HIDE_PERMANENT) === '1' } catch { return false }
  })

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
  const userCount      = events.filter((e) => !e.permanent).length

  // ── Activity stats ───────────────────────────────────────────────────
  const now   = Date.now()
  const ago24 = now - 24 * 60 * 60 * 1000

  // Today window: 07:00 – 19:00 local time
  const todayStart = new Date(); todayStart.setHours(7,  0, 0, 0)
  const todayEnd   = new Date(); todayEnd.setHours(19, 0, 0, 0)

  const userEvents = events.filter((e) => !e.permanent)

  const last24h  = userEvents.filter((e) => new Date(e.reportedAt).getTime() >= ago24)
  const todayDay = userEvents.filter((e) => {
    const t = new Date(e.reportedAt).getTime()
    return t >= todayStart.getTime() && t <= todayEnd.getTime()
  })

  // Group by country
  function groupByCountry(evs: RoadEvent[]): Record<string, number> {
    const map: Record<string, number> = {}
    for (const e of evs) {
      const c = countryFromCoords(e.lat, e.lng)
      map[c] = (map[c] ?? 0) + 1
    }
    return map
  }

  const today24hByCountry  = groupByCountry(last24h)
  const todayDayByCountry  = groupByCountry(todayDay)

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
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: '#888', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
          Статистика ({events.length})
        </div>
        <div style={{
          display: 'inline-flex', alignItems: 'center', gap: 5,
          background: 'rgba(227,25,55,0.15)', border: '1px solid rgba(227,25,55,0.4)',
          borderRadius: 20, padding: '2px 10px',
        }}>
          <span style={{ fontSize: 12 }}>📍</span>
          <span style={{ fontSize: 12, fontWeight: 700, color: '#e31937' }}>{permanentCount}</span>
          <span style={{ fontSize: 10, color: '#aaa' }}>служебни</span>
        </div>
      </div>

      {/* ── Activity stats — new user events ── */}
      <div style={{ marginBottom: 14, background: 'rgba(255,255,255,0.03)', borderRadius: 10, padding: '10px 12px', border: '1px solid rgba(255,255,255,0.07)' }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: '#888', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>
          Нови потребителски маркери
        </div>

        {/* Row: Днес 7-19ч vs Последните 24ч */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
          <div style={{ flex: 1, background: 'rgba(34,197,94,0.08)', border: '1px solid rgba(34,197,94,0.25)', borderRadius: 8, padding: '8px 10px', textAlign: 'center' }}>
            <div style={{ fontSize: 22, fontWeight: 800, color: '#4ade80', lineHeight: 1 }}>{todayDay.length}</div>
            <div style={{ fontSize: 10, color: '#666', marginTop: 3 }}>Днес 7–19ч</div>
          </div>
          <div style={{ flex: 1, background: 'rgba(59,130,246,0.08)', border: '1px solid rgba(59,130,246,0.25)', borderRadius: 8, padding: '8px 10px', textAlign: 'center' }}>
            <div style={{ fontSize: 22, fontWeight: 800, color: '#60a5fa', lineHeight: 1 }}>{last24h.length}</div>
            <div style={{ fontSize: 10, color: '#666', marginTop: 3 }}>Последните 24ч</div>
          </div>
        </div>

        {/* By country — 24h */}
        {last24h.length > 0 && (
          <>
            <div style={{ fontSize: 10, color: '#555', marginBottom: 4 }}>24ч по държава</div>
            {Object.entries(today24hByCountry).sort((a, b) => b[1] - a[1]).map(([c, n]) => (
              <Row key={c} label={c} count={n} total={last24h.length} color="#60a5fa" />
            ))}
          </>
        )}

        {/* By country — today day */}
        {todayDay.length > 0 && (
          <>
            <div style={{ fontSize: 10, color: '#555', marginTop: 8, marginBottom: 4 }}>7–19ч по държава</div>
            {Object.entries(todayDayByCountry).sort((a, b) => b[1] - a[1]).map(([c, n]) => (
              <Row key={c} label={c} count={n} total={todayDay.length} color="#4ade80" />
            ))}
          </>
        )}

        {last24h.length === 0 && (
          <div style={{ fontSize: 12, color: '#555', textAlign: 'center', padding: '4px 0' }}>Няма нови маркери</div>
        )}
      </div>

      {/* Permanent vs user */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
        <button
          onClick={() => {
            const next = !hidden
            setHidden(next)
            try { localStorage.setItem(LS_HIDE_PERMANENT, next ? '1' : '0') } catch { /* ignore */ }
          }}
          title={hidden ? 'Покажи служебните маркери на публичната карта' : 'Скрий служебните маркери от публичната карта'}
          style={{
            flex: 1,
            background: hidden ? 'rgba(255,255,255,0.06)' : 'rgba(227,25,55,0.12)',
            border: `1px solid ${hidden ? 'rgba(255,255,255,0.15)' : 'rgba(227,25,55,0.35)'}`,
            borderRadius: 8, padding: '8px 10px', textAlign: 'center',
            cursor: 'pointer', transition: 'background 0.15s ease, border-color 0.15s ease',
          }}
        >
          <div style={{ fontSize: 18, fontWeight: 700, color: hidden ? '#666' : '#e31937' }}>{permanentCount}</div>
          <div style={{ fontSize: 10, color: hidden ? '#555' : '#888', marginTop: 2 }}>
            {hidden ? '🙈 Служебни' : '👁 Служебни'}
          </div>
        </button>
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

function Row({ label, count, total, color = '#e31937' }: { label: string; count: number; total: number; color?: string }) {
  const pct = total > 0 ? Math.round((count / total) * 100) : 0
  return (
    <div style={{ marginBottom: 5 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 2 }}>
        <span style={{ fontSize: 12, color: '#ccc' }}>{label}</span>
        <span style={{ fontSize: 12, color: '#888' }}>{count}</span>
      </div>
      <div style={{ height: 4, borderRadius: 2, background: 'rgba(255,255,255,0.07)' }}>
        <div style={{ height: '100%', width: `${pct}%`, borderRadius: 2, background: color, transition: 'width 0.3s ease' }} />
      </div>
    </div>
  )
}

// ── Leaflet map component ────────────────────────────────────────────────

interface AdminMapProps {
  events:           RoadEvent[]
  userStations:     UserStation[]
  comments:         StationComment[]
  meetups:          AdminMeetup[]
  addMode:          boolean
  editingEventId:   string | null
  onMapClick:       (lat: number, lng: number) => void
  onDelete:         (id: string) => void
  onEdit:           (event: RoadEvent) => void
  onApproveStation: (id: string) => void
  onRejectStation:  (id: string) => void
  onDeleteMeetup:   (id: string) => void
}

function AdminMap({ events, userStations, comments, meetups, addMode, editingEventId, onMapClick, onDelete, onEdit, onApproveStation, onRejectStation, onDeleteMeetup }: AdminMapProps) {
  const containerRef        = useRef<HTMLDivElement>(null)
  const mapRef              = useRef<L.Map | null>(null)
  const markersRef          = useRef<Map<string, L.Marker>>(new Map())
  const markerRevisionRef   = useRef<Map<string, string>>(new Map())
  const stationMarkersRef   = useRef<Map<string, L.Marker>>(new Map())
  const commentMarkersRef   = useRef<Map<string, L.Marker>>(new Map())
  const meetupMarkersRef    = useRef<Map<string, L.Marker>>(new Map())
  const addModeRef          = useRef(addMode)
  const onClickRef          = useRef(onMapClick)
  const onDeleteRef         = useRef(onDelete)
  const onEditRef           = useRef(onEdit)
  const onApproveStationRef = useRef(onApproveStation)
  const onRejectStationRef  = useRef(onRejectStation)
  const onDeleteMeetupRef   = useRef(onDeleteMeetup)

  // Keep refs in sync (avoids stale closures in Leaflet handlers)
  addModeRef.current          = addMode
  onClickRef.current          = onMapClick
  onDeleteRef.current         = onDelete
  onEditRef.current           = onEdit
  onApproveStationRef.current = onApproveStation
  onRejectStationRef.current  = onRejectStation
  onDeleteMeetupRef.current   = onDeleteMeetup

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
      stationMarkersRef.current.clear()
      commentMarkersRef.current.clear()
    }
  }, [])

  // Sync cursor style when addMode changes
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    el.style.cursor = addMode ? 'crosshair' : ''
  }, [addMode])

  // Sync markers when events change — revision tracking so edits re-render
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
          markerRevisionRef.current.delete(id)
        }
      }

      // Add / update markers
      for (const ev of events) {
        const revision = `${ev.type}|${ev.lat}|${ev.lng}|${String(ev.permanent)}`
        if (markerRevisionRef.current.get(ev.id) === revision) continue

        // Remove existing marker so we can re-create it with updated data
        const existing = markersRef.current.get(ev.id)
        if (existing) { existing.remove(); markersRef.current.delete(ev.id) }

        const isEditing = editingEventId === ev.id
        const icon = L.divIcon({
          className: '',
          html: ev.permanent
            ? `<div style="
                width:34px;height:34px;border-radius:50%;
                background:rgba(227,25,55,0.18);border:${isEditing ? '3px solid #facc15' : '2.5px solid #e31937'};
                display:flex;align-items:center;justify-content:center;
                font-size:17px;line-height:1;cursor:pointer;
                box-shadow:0 2px 8px ${isEditing ? 'rgba(250,204,21,0.7)' : 'rgba(227,25,55,0.5)'};
              ">${eventEmoji(ev.type)}</div>`
            : `<div style="
                font-size:24px;line-height:1;
                filter:drop-shadow(0 1px 3px rgba(0,0,0,0.8));
                cursor:pointer;
                outline:${isEditing ? '2px solid #facc15' : 'none'};
                border-radius:4px;
              ">${eventEmoji(ev.type)}</div>`,
          iconSize:   [34, 34],
          iconAnchor: [17, 17],
        })

        const marker = L.marker([ev.lat, ev.lng], { icon }).addTo(map)

        marker.bindPopup(buildPopup(ev), { maxWidth: 240 })
        marker.on('popupopen', () => {
          document.getElementById(`del-${ev.id}`)?.addEventListener('click', () => {
            marker.closePopup()
            onDeleteRef.current(ev.id)
          })
          document.getElementById(`edit-${ev.id}`)?.addEventListener('click', () => {
            marker.closePopup()
            onEditRef.current(ev)
          })
        })

        markersRef.current.set(ev.id, marker)
        markerRevisionRef.current.set(ev.id, revision)
      }
    })
  }, [events, editingEventId])

  // Community event (meetup) markers
  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    void import('leaflet').then((Lm) => {
      const L = Lm.default
      const ids = new Set(meetups.map((m) => m.id))
      for (const [id, marker] of meetupMarkersRef.current) {
        if (!ids.has(id)) { marker.remove(); meetupMarkersRef.current.delete(id) }
      }
      for (const m of meetups) {
        if (meetupMarkersRef.current.has(m.id) || m.lat == null || m.lng == null) continue
        const icon = L.divIcon({
          className: '',
          html: `<div style="width:30px;height:30px;border-radius:50%;
            background:#6366f1;border:2px solid rgba(255,255,255,0.9);
            display:flex;align-items:center;justify-content:center;font-size:15px;
            box-shadow:0 2px 8px rgba(99,102,241,0.6);cursor:pointer;">📅</div>`,
          iconSize: [30, 30], iconAnchor: [15, 15],
        })
        const marker = L.marker([m.lat, m.lng], { icon }).addTo(map)
        const esc = (s: string) => String(s ?? '').replace(/[<>&]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' }[c] ?? c))
        const when = new Date(m.date).toLocaleString('bg-BG', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
        marker.bindPopup(
          `<div style="min-width:170px">
            <div style="font-weight:800;margin-bottom:4px">📅 ${esc(m.title)}</div>
            <div style="font-size:12px;color:#555">${esc(when)}</div>
            ${m.organizer ? `<div style="font-size:12px;color:#555">👤 ${esc(m.organizer)}</div>` : ''}
            ${m.organizerPhone ? `<div style="font-size:12px;color:#555">📞 ${esc(m.organizerPhone)}</div>` : ''}
            <button id="delm-${m.id}" style="margin-top:8px;background:#ef4444;color:#fff;border:none;border-radius:6px;padding:4px 10px;font-size:12px;cursor:pointer">Изтрий</button>
          </div>`, { maxWidth: 240 })
        marker.on('popupopen', () => {
          document.getElementById(`delm-${m.id}`)?.addEventListener('click', () => {
            marker.closePopup(); onDeleteMeetupRef.current(m.id)
          })
        })
        meetupMarkersRef.current.set(m.id, marker)
      }
    })
  }, [meetups])

  // Sync user-station markers (orange circles)
  useEffect(() => {
    const map = mapRef.current
    if (!map) return

    void import('leaflet').then((Lm) => {
      const L = Lm.default

      const currentIds = new Set(userStations.map((s) => s.id))

      // Remove stale station markers
      for (const [id, marker] of stationMarkersRef.current) {
        if (!currentIds.has(id)) {
          marker.remove()
          stationMarkersRef.current.delete(id)
        }
      }

      // Add / update markers
      for (const s of userStations) {
        // Remove existing to re-render with latest approval status
        const existing = stationMarkersRef.current.get(s.id)
        if (existing) { existing.remove(); stationMarkersRef.current.delete(s.id) }

        const isPending = s.approvalStatus === 'pending'
        const icon = L.divIcon({
          className: '',
          html: `<div style="
            width:34px;height:34px;border-radius:50%;
            background:${isPending ? 'rgba(251,146,60,0.18)' : 'rgba(251,146,60,0.35)'};
            border:2.5px solid #f97316;
            display:flex;align-items:center;justify-content:center;
            font-size:17px;line-height:1;cursor:pointer;
            box-shadow:0 2px 8px rgba(249,115,22,0.5);
          ">⚡</div>`,
          iconSize:   [34, 34],
          iconAnchor: [17, 17],
        })

        const marker = L.marker([s.lat, s.lng], { icon }).addTo(map)

        const connStr = s.connectors.length
          ? s.connectors.map((c) => `${c.type}${c.powerKw ? ` ${c.powerKw}kW` : ''} ×${c.count}`).join(', ')
          : '—'
        const statusColor = isPending ? '#fb923c' : '#4ade80'
        const statusLabel = isPending ? 'НЕОДОБРЕНА' : 'ОДОБРЕНА'
        const date = new Date(s.submittedAt).toLocaleString('bg-BG', { dateStyle: 'short', timeStyle: 'short' })

        const popupHtml = `
          <div style="font-family:system-ui,sans-serif;font-size:13px;min-width:190px;">
            <div style="font-weight:700;font-size:15px;margin-bottom:4px;">${s.name}</div>
            <div style="color:#888;font-size:11px;margin-bottom:4px;">${s.lat.toFixed(5)}, ${s.lng.toFixed(5)}</div>
            <div style="font-size:11px;color:#94a3b8;margin-bottom:4px;">${connStr}</div>
            <div style="margin-bottom:8px;">
              <span style="font-size:10px;font-weight:700;padding:2px 7px;border-radius:8px;
                background:${statusColor}22;color:${statusColor};border:1px solid ${statusColor}55;">
                ${statusLabel}
              </span>
            </div>
            <div style="color:#666;font-size:10px;margin-bottom:10px;">${date}</div>
            <div style="display:flex;gap:6px;">
              ${isPending ? `<button id="approve-${s.id}" style="flex:1;padding:6px 0;border-radius:7px;
                background:#22c55e22;border:1px solid #22c55e55;color:#4ade80;
                font-size:12px;font-weight:700;cursor:pointer;">✅ Одобри</button>` : ''}
              <button id="reject-${s.id}" style="flex:1;padding:6px 0;border-radius:7px;
                background:#ef444422;border:1px solid #f8717155;color:#f87171;
                font-size:12px;font-weight:700;cursor:pointer;">🗑 Изтрий</button>
            </div>
          </div>`

        marker.bindPopup(popupHtml, { maxWidth: 240 })
        marker.on('popupopen', () => {
          document.getElementById(`approve-${s.id}`)?.addEventListener('click', () => {
            marker.closePopup()
            onApproveStationRef.current(s.id)
          })
          document.getElementById(`reject-${s.id}`)?.addEventListener('click', () => {
            marker.closePopup()
            onRejectStationRef.current(s.id)
          })
        })

        stationMarkersRef.current.set(s.id, marker)
      }
    })
  }, [userStations])

  // Sync comment markers (teal speech-bubble circles, grouped by station)
  useEffect(() => {
    const map = mapRef.current
    if (!map) return

    void import('leaflet').then((Lm) => {
      const L = Lm.default

      // Group comments by stationId
      const byStation = new Map<string, StationComment[]>()
      for (const c of comments) {
        const arr = byStation.get(c.stationId) ?? []
        arr.push(c)
        byStation.set(c.stationId, arr)
      }

      // Remove markers for stations that no longer have comments
      for (const [sid, marker] of commentMarkersRef.current) {
        if (!byStation.has(sid)) { marker.remove(); commentMarkersRef.current.delete(sid) }
      }

      // Add / refresh one marker per station
      for (const [sid, stComments] of byStation) {
        const existing = commentMarkersRef.current.get(sid)
        if (existing) { existing.remove(); commentMarkersRef.current.delete(sid) }

        const first = stComments[0]!
        const count = stComments.length

        const icon = L.divIcon({
          className: '',
          html: `<div style="
            width:34px;height:34px;border-radius:50%;
            background:rgba(20,184,166,0.2);border:2.5px solid #14b8a6;
            display:flex;align-items:center;justify-content:center;
            font-size:15px;line-height:1;cursor:pointer;
            box-shadow:0 2px 8px rgba(20,184,166,0.5);
            position:relative;
          ">
            💬
            ${count > 1 ? `<span style="position:absolute;top:-4px;right:-4px;background:#14b8a6;color:#fff;border-radius:99px;font-size:9px;font-weight:800;padding:1px 4px;line-height:1.4;">${count}</span>` : ''}
          </div>`,
          iconSize:   [34, 34],
          iconAnchor: [17, 17],
        })

        const commentsHtml = stComments.map((c) => {
          const date = new Date(c.submittedAt).toLocaleString('bg-BG', { dateStyle: 'short', timeStyle: 'short' })
          return `<div style="padding:8px 0;border-bottom:1px solid #f0f0f0;">
            <div style="font-size:13px;margin-bottom:3px;">${c.text.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</div>
            <div style="font-size:10px;color:#999;">${date}</div>
          </div>`
        }).join('')

        const popupHtml = `
          <div style="font-family:system-ui,sans-serif;min-width:210px;max-width:260px;">
            <div style="font-weight:700;font-size:14px;margin-bottom:2px;color:#0f766e;">💬 ${first.stationName}</div>
            <div style="font-size:10px;color:#999;margin-bottom:8px;">${first.lat.toFixed(5)}, ${first.lng.toFixed(5)}</div>
            <div style="max-height:240px;overflow-y:auto;">${commentsHtml}</div>
          </div>`

        const marker = L.marker([first.lat, first.lng], { icon }).addTo(map)
        marker.bindPopup(popupHtml, { maxWidth: 280 })
        commentMarkersRef.current.set(sid, marker)
      }
    })
  }, [comments])

  return <div ref={containerRef} style={{ width: '100%', height: '100%' }} />
}

// ── User-submitted stations panel ────────────────────────────────────────

function MeetupsPanel({ meetups, onDelete }: { meetups: AdminMeetup[]; onDelete: (id: string) => void }) {
  const [open, setOpen] = useState(false)
  return (
    <div style={{ borderTop: '1px solid rgba(255,255,255,0.07)' }}>
      <button
        onClick={() => setOpen((v) => !v)}
        style={{
          width: '100%', padding: '12px 18px', background: 'none', border: 'none',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          color: '#e2e8f0', cursor: 'pointer', fontSize: 13, fontWeight: 600,
        }}
      >
        <span>📅 Събития ({meetups.length})</span>
        <span style={{ color: '#666', fontSize: 12 }}>{open ? '▲' : '▼'}</span>
      </button>
      {open && (
        <div style={{ padding: '0 14px 14px' }}>
          {meetups.length === 0 && (
            <div style={{ fontSize: 12, color: '#555', padding: '8px 4px' }}>Няма събития</div>
          )}
          {meetups.map((m) => (
            <div key={m.id} style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 8, padding: '10px 12px', marginBottom: 8 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                <span style={{ fontWeight: 700, color: '#e2e8f0', fontSize: 13 }}>{m.title}</span>
                <button onClick={() => onDelete(m.id)} style={{ background: 'rgba(239,68,68,0.15)', color: '#f87171', border: '1px solid rgba(239,68,68,0.4)', borderRadius: 6, padding: '2px 8px', fontSize: 11, cursor: 'pointer' }}>Изтрий</button>
              </div>
              <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 4 }}>
                🕒 {new Date(m.date).toLocaleString('bg-BG', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                {m.organizer ? ` · 👤 ${m.organizer}` : ''}
                {` · 🔔 ${m.followers?.length ?? 0}`}
              </div>
              {(m.organizerPhone || m.organizerEmail || m.facebook) && (
                <div style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>
                  {m.organizerPhone ? `📞 ${m.organizerPhone}  ` : ''}
                  {m.organizerEmail ? `✉️ ${m.organizerEmail}  ` : ''}
                  {m.facebook ? `f ${m.facebook}` : ''}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function UserStationsPanel({
  stations, onApprove, onReject,
}: {
  stations:  UserStation[]
  onApprove: (id: string) => void
  onReject:  (id: string) => void
}) {
  const [open, setOpen] = useState(false)
  const pending  = stations.filter((s) => s.approvalStatus === 'pending')
  const approved = stations.filter((s) => s.approvalStatus === 'approved')

  return (
    <div style={{ borderTop: '1px solid rgba(255,255,255,0.07)' }}>
      <button
        onClick={() => setOpen((v) => !v)}
        style={{
          width: '100%', padding: '12px 18px', background: 'none', border: 'none',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          color: '#e2e8f0', cursor: 'pointer', fontSize: 13, fontWeight: 600,
        }}
      >
        <span>⚡ Потребителски станции</span>
        <span style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          {pending.length > 0 && (
            <span style={{
              background: 'rgba(168,85,247,0.22)', color: '#d8b4fe',
              borderRadius: 99, padding: '1px 8px', fontSize: 11, fontWeight: 700,
            }}>
              {pending.length} нови
            </span>
          )}
          <span style={{ color: '#666', fontSize: 12 }}>{open ? '▲' : '▼'}</span>
        </span>
      </button>

      {open && (
        <div style={{ padding: '0 14px 14px' }}>
          {stations.length === 0 && (
            <div style={{ fontSize: 12, color: '#555', padding: '8px 4px' }}>Няма подадени станции</div>
          )}
          {stations.map((s) => (
            <div key={s.id} style={{
              padding: '10px 0',
              borderTop: '1px solid rgba(255,255,255,0.06)',
            }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: '#e2e8f0', marginBottom: 2 }}>
                    {s.name}
                  </div>
                  <div style={{ fontSize: 11, color: '#64748b', marginBottom: 3 }}>
                    {[s.address, s.city].filter(Boolean).join(', ') || `${s.lat.toFixed(5)}, ${s.lng.toFixed(5)}`}
                  </div>
                  {s.connectors.length > 0 && (
                    <div style={{ fontSize: 11, color: '#94a3b8' }}>
                      {s.connectors.map((c) => `${c.type}${c.powerKw ? ` ${c.powerKw}kW` : ''} ×${c.count}`).join(', ')}
                    </div>
                  )}
                  {s.submitterNotes && (
                    <div style={{ fontSize: 11, color: '#7c6f3a', marginTop: 3, fontStyle: 'italic' }}>
                      "{s.submitterNotes}"
                    </div>
                  )}
                  <div style={{ fontSize: 10, color: '#475569', marginTop: 4 }}>
                    {new Date(s.submittedAt).toLocaleString('bg-BG')}
                  </div>
                </div>
                <span style={{
                  fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 8, flexShrink: 0,
                  background: s.approvalStatus === 'pending' ? 'rgba(168,85,247,0.18)' : 'rgba(34,197,94,0.18)',
                  color:      s.approvalStatus === 'pending' ? '#d8b4fe' : '#4ade80',
                }}>
                  {s.approvalStatus === 'pending' ? 'НЕОДОБРЕНА' : 'ОДОБРЕНА'}
                </span>
              </div>

              {s.approvalStatus === 'pending' && (
                <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
                  <button
                    onClick={() => onApprove(s.id)}
                    style={{
                      flex: 1, padding: '7px 0', borderRadius: 7, cursor: 'pointer', fontSize: 12, fontWeight: 700,
                      background: 'rgba(34,197,94,0.18)', border: '1px solid rgba(34,197,94,0.45)', color: '#4ade80',
                    }}
                  >
                    ✅ Одобри
                  </button>
                  <button
                    onClick={() => onReject(s.id)}
                    style={{
                      flex: 1, padding: '7px 0', borderRadius: 7, cursor: 'pointer', fontSize: 12, fontWeight: 700,
                      background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.35)', color: '#f87171',
                    }}
                  >
                    ❌ Откажи
                  </button>
                </div>
              )}
              {s.approvalStatus === 'approved' && (
                <button
                  onClick={() => onReject(s.id)}
                  style={{
                    marginTop: 6, width: '100%', padding: '5px 0', borderRadius: 7, cursor: 'pointer',
                    fontSize: 11, fontWeight: 600,
                    background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', color: '#f87171',
                  }}
                >
                  Изтрий
                </button>
              )}
            </div>
          ))}
          {approved.length > 0 && (
            <div style={{ fontSize: 11, color: '#475569', paddingTop: 6 }}>
              {approved.length} одобрени · {pending.length} чакат
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ── EventEditPanel ─────────────────────────────────────────────────────────
// Floating overlay on the map for editing a road event.

function EventEditPanel({
  event,
  onSave,
  onCancel,
}: {
  event:    RoadEvent
  onSave:   (patch: Partial<Pick<RoadEvent, 'type' | 'lat' | 'lng' | 'description' | 'permanent'>>) => void
  onCancel: () => void
}) {
  const [type,        setType]        = useState<EventType>(event.type)
  const [lat,         setLat]         = useState(String(event.lat))
  const [lng,         setLng]         = useState(String(event.lng))
  const [description, setDescription] = useState(event.description ?? '')
  const [permanent,   setPermanent]   = useState(event.permanent ?? false)
  const [saving,      setSaving]      = useState(false)

  // Reset form when switching to a different event
  useEffect(() => {
    setType(event.type)
    setLat(String(event.lat))
    setLng(String(event.lng))
    setDescription(event.description ?? '')
    setPermanent(event.permanent ?? false)
    setSaving(false)
  }, [event.id]) // eslint-disable-line react-hooks/exhaustive-deps

  function handleSave() {
    const parsedLat = parseFloat(lat)
    const parsedLng = parseFloat(lng)
    if (!isFinite(parsedLat) || !isFinite(parsedLng)) { alert('Невалидни координати'); return }
    setSaving(true)
    onSave({
      type,
      lat: parsedLat,
      lng: parsedLng,
      description: description.trim() || null,
      permanent,
    })
  }

  const inputStyle: React.CSSProperties = {
    background: 'rgba(255,255,255,0.07)',
    border: '1px solid rgba(255,255,255,0.15)',
    borderRadius: 7,
    color: '#f2f2f2',
    padding: '8px 10px',
    fontSize: 13,
    outline: 'none',
    fontFamily: 'system-ui, sans-serif',
    width: '100%',
    boxSizing: 'border-box',
  }

  return (
    <div style={{
      position:   'absolute',
      top:        12,
      right:      12,
      zIndex:     1000,
      width:      290,
      background: 'rgba(14,14,22,0.97)',
      border:     '1px solid rgba(250,204,21,0.5)',
      borderRadius: 12,
      padding:    16,
      boxShadow:  '0 8px 32px rgba(0,0,0,0.7)',
      display:    'flex',
      flexDirection: 'column',
      gap:        10,
    }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: '#facc15' }}>✏️ Редактирай събитие</div>
        <button onClick={onCancel} style={{
          background: 'none', border: 'none', color: '#888', fontSize: 18, cursor: 'pointer', lineHeight: 1, padding: 2,
        }}>✕</button>
      </div>

      <div style={{ fontSize: 10, color: '#555', fontFamily: 'monospace', marginTop: -8 }}>
        ID: {event.id.slice(0, 16)}…
      </div>

      {/* Type */}
      <div>
        <div style={{ fontSize: 11, color: '#888', marginBottom: 5 }}>Тип</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
          {EVENT_TYPES.map((t) => (
            <button key={t} onClick={() => setType(t)}
              style={{
                padding: '5px 9px', borderRadius: 7, cursor: 'pointer', fontSize: 11,
                border: `1px solid ${type === t ? 'rgba(250,204,21,0.7)' : 'rgba(255,255,255,0.1)'}`,
                background: type === t ? 'rgba(250,204,21,0.18)' : 'rgba(255,255,255,0.04)',
                color: type === t ? '#facc15' : '#aaa', fontWeight: type === t ? 700 : 400,
              }}>
              {EVENT_LABELS[t]}
            </button>
          ))}
        </div>
      </div>

      {/* Coordinates */}
      <div style={{ display: 'flex', gap: 8 }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 11, color: '#888', marginBottom: 4 }}>Lat</div>
          <input value={lat} onChange={(e) => setLat(e.target.value)} style={inputStyle} />
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 11, color: '#888', marginBottom: 4 }}>Lng</div>
          <input value={lng} onChange={(e) => setLng(e.target.value)} style={inputStyle} />
        </div>
      </div>

      {/* Description */}
      <div>
        <div style={{ fontSize: 11, color: '#888', marginBottom: 4 }}>Описание (не задължително)</div>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={2}
          style={{ ...inputStyle, resize: 'vertical', minHeight: 54 }}
          placeholder="Допълнително описание…"
        />
      </div>

      {/* Permanent toggle */}
      <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
        <div
          onClick={() => setPermanent((v) => !v)}
          style={{
            width: 36, height: 20, borderRadius: 10, position: 'relative', flexShrink: 0,
            background: permanent ? '#e31937' : 'rgba(255,255,255,0.18)',
            cursor: 'pointer', transition: 'background 0.15s',
          }}
        >
          <span style={{
            position: 'absolute', top: 3, left: permanent ? 19 : 3,
            width: 14, height: 14, borderRadius: '50%', background: '#fff',
            transition: 'left 0.15s',
          }} />
        </div>
        <span style={{ fontSize: 12, color: '#ccc' }}>Служебен (admin) маркер</span>
      </label>

      {/* Actions */}
      <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
        <button
          onClick={onCancel}
          style={{
            flex: 1, padding: '9px 0', borderRadius: 8, cursor: 'pointer',
            background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.15)',
            color: '#aaa', fontSize: 13, fontWeight: 600,
          }}
        >
          Отказ
        </button>
        <button
          onClick={handleSave}
          disabled={saving}
          style={{
            flex: 2, padding: '9px 0', borderRadius: 8, cursor: saving ? 'default' : 'pointer',
            background: saving ? 'rgba(250,204,21,0.3)' : 'rgba(250,204,21,0.2)',
            border: '1px solid rgba(250,204,21,0.6)',
            color: '#facc15', fontSize: 13, fontWeight: 700,
            opacity: saving ? 0.7 : 1,
          }}
        >
          {saving ? 'Запазва…' : '💾 Запази'}
        </button>
      </div>
    </div>
  )
}

// ── EventsListPanel ────────────────────────────────────────────────────────
// Collapsible sidebar panel listing all road events with edit/delete actions.

function EventsListPanel({
  events,
  editingId,
  onEdit,
  onDelete,
}: {
  events:    RoadEvent[]
  editingId: string | null
  onEdit:    (event: RoadEvent) => void
  onDelete:  (id: string) => void
}) {
  const [open, setOpen] = useState(false)

  const sorted = [...events].sort((a, b) =>
    new Date(b.reportedAt).getTime() - new Date(a.reportedAt).getTime()
  )
  const permanent = sorted.filter((e) => e.permanent)
  const user      = sorted.filter((e) => !e.permanent)

  function fmt(iso: string) {
    return new Date(iso).toLocaleString('bg-BG', { dateStyle: 'short', timeStyle: 'short' })
  }

  return (
    <div style={{ borderTop: '1px solid rgba(255,255,255,0.07)' }}>
      <button
        onClick={() => setOpen((v) => !v)}
        style={{
          width: '100%', padding: '12px 18px', background: 'none', border: 'none',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          color: '#e2e8f0', cursor: 'pointer', fontSize: 13, fontWeight: 600,
        }}
      >
        <span>🗺 Пътни събития ({events.length})</span>
        <span style={{ color: '#666', fontSize: 12 }}>{open ? '▲' : '▼'}</span>
      </button>

      {open && (
        <div style={{ padding: '0 14px 14px', maxHeight: 420, overflowY: 'auto' }}>
          {events.length === 0 && (
            <div style={{ fontSize: 12, color: '#555', padding: '8px 4px' }}>Няма активни събития</div>
          )}

          {permanent.length > 0 && (
            <div style={{ fontSize: 10, color: '#e31937', fontWeight: 700, marginBottom: 6, marginTop: 4, letterSpacing: '0.08em' }}>
              СЛУЖЕБНИ ({permanent.length})
            </div>
          )}
          {permanent.map((ev) => (
            <EventRow key={ev.id} ev={ev} isEditing={editingId === ev.id} fmt={fmt} onEdit={onEdit} onDelete={onDelete} />
          ))}

          {user.length > 0 && (
            <div style={{ fontSize: 10, color: '#888', fontWeight: 700, marginBottom: 6, marginTop: 10, letterSpacing: '0.08em' }}>
              ПОТРЕБИТЕЛСКИ ({user.length})
            </div>
          )}
          {user.map((ev) => (
            <EventRow key={ev.id} ev={ev} isEditing={editingId === ev.id} fmt={fmt} onEdit={onEdit} onDelete={onDelete} />
          ))}
        </div>
      )}
    </div>
  )
}

function EventRow({
  ev, isEditing, fmt, onEdit, onDelete,
}: {
  ev:        RoadEvent
  isEditing: boolean
  fmt:       (iso: string) => string
  onEdit:    (event: RoadEvent) => void
  onDelete:  (id: string) => void
}) {
  return (
    <div style={{
      padding:      '8px 10px',
      marginBottom: 5,
      borderRadius: 8,
      background:   isEditing ? 'rgba(250,204,21,0.08)' : 'rgba(255,255,255,0.03)',
      border:       `1px solid ${isEditing ? 'rgba(250,204,21,0.4)' : 'rgba(255,255,255,0.07)'}`,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
        <span style={{ fontSize: 15 }}>{eventEmoji(ev.type)}</span>
        <span style={{ flex: 1, fontSize: 12, fontWeight: 600, color: '#e2e8f0' }}>
          {EVENT_LABELS[ev.type] ?? ev.type}
        </span>
        {ev.permanent && (
          <span style={{
            fontSize: 9, fontWeight: 700, padding: '1px 5px', borderRadius: 4,
            background: 'rgba(227,25,55,0.2)', color: '#f87171', border: '1px solid rgba(227,25,55,0.4)',
          }}>СЛУЖ.</span>
        )}
      </div>
      <div style={{ fontSize: 10, color: '#555', marginBottom: 6 }}>
        {fmt(ev.reportedAt)} · {ev.lat.toFixed(4)}, {ev.lng.toFixed(4)}
      </div>
      {ev.description && (
        <div style={{ fontSize: 10, color: '#64748b', fontStyle: 'italic', marginBottom: 5 }}>
          "{ev.description}"
        </div>
      )}
      <div style={{ display: 'flex', gap: 5 }}>
        <button
          onClick={() => onEdit(ev)}
          style={{
            flex: 1, padding: '5px 0', borderRadius: 6, cursor: 'pointer', fontSize: 11, fontWeight: 600,
            background: isEditing ? 'rgba(250,204,21,0.2)' : 'rgba(59,130,246,0.15)',
            border: `1px solid ${isEditing ? 'rgba(250,204,21,0.5)' : 'rgba(96,165,250,0.4)'}`,
            color: isEditing ? '#facc15' : '#93c5fd',
          }}
        >
          {isEditing ? '✏️ Редактира се' : '✏️ Редактирай'}
        </button>
        <button
          onClick={() => onDelete(ev.id)}
          style={{
            flex: 1, padding: '5px 0', borderRadius: 6, cursor: 'pointer', fontSize: 11, fontWeight: 600,
            background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.35)', color: '#f87171',
          }}
        >
          🗑 Изтрий
        </button>
      </div>
    </div>
  )
}

function eventEmoji(type: string): string {
  const map: Record<string, string> = {
    police: '🚔', accident: '💥', hazard: '⚠️',
    traffic: '🚗', camera: '📷', construction: '🏗️',
  }
  return map[type] ?? '📍'
}

function buildPopup(ev: RoadEvent): string {
  const label = EVENT_LABELS[ev.type] ?? ev.type
  const date  = new Date(ev.reportedAt).toLocaleString('bg-BG', { dateStyle: 'short', timeStyle: 'short' })
  const exp   = new Date(ev.expiresAt).toLocaleString('bg-BG', { dateStyle: 'short', timeStyle: 'short' })
  return `
    <div style="font-family:system-ui,sans-serif;font-size:13px;min-width:180px;">
      <div style="font-weight:700;font-size:15px;margin-bottom:4px;">${label}</div>
      <div style="color:#888;margin-bottom:2px;font-size:11px;">${ev.lat.toFixed(5)}, ${ev.lng.toFixed(5)}</div>
      <div style="color:#888;margin-bottom:1px;font-size:11px;">📅 ${date}</div>
      <div style="color:#aaa;margin-bottom:8px;font-size:11px;">⏱ ${exp}</div>
      ${ev.description ? `<div style="color:#666;font-size:11px;margin-bottom:8px;font-style:italic;">"${ev.description}"</div>` : ''}
      ${ev.permanent ? '<div style="font-size:10px;color:#e31937;font-weight:700;margin-bottom:8px;">🔴 СЛУЖЕБЕН</div>' : ''}
      <div style="display:flex;gap:6px;">
        <button id="edit-${ev.id}" style="
          flex:1;padding:7px 0;border-radius:7px;
          background:#3b82f622;border:1px solid #60a5fa55;
          color:#93c5fd;font-size:12px;font-weight:600;cursor:pointer;
        ">✏️ Редактирай</button>
        <button id="del-${ev.id}" style="
          flex:1;padding:7px 0;border-radius:7px;
          background:#ef444422;border:1px solid #f8717155;
          color:#f87171;font-size:12px;font-weight:600;cursor:pointer;
        ">🗑️ Изтрий</button>
      </div>
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
