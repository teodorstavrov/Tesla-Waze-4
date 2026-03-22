// ─── Tesla Radar Admin Panel ────────────────────────────────────────────
import { useState, useEffect, useCallback } from 'react'

const EVENT_LABELS: Record<string, string> = {
  police: '🚔 Police', accident: '💥 Accident', hazard: '⚠️ Hazard',
  traffic: '🚗 Traffic', closure: '🚧 Closure', construction: '🏗️ Construction',
}

interface Stats {
  redis: boolean
  stationCount: number | null
  lastSync: string | null
  eventCount: number
  providers: Record<string, { status: string; count: number }> | null
}

interface RoadEvent {
  id: string
  type: string
  lat: number
  lng: number
  reportedAt: string
  expiresAt: string
  confirms: number
  description: string | null
}

// ── Styles ──────────────────────────────────────────────────────────────

const S = {
  page:    { minHeight: '100vh', padding: '32px 24px', maxWidth: 900, margin: '0 auto' } as const,
  card:    { background: '#161622', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 12, padding: '20px 24px', marginBottom: 20 } as const,
  row:     { display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' as const },
  label:   { fontSize: 11, color: '#888', textTransform: 'uppercase' as const, letterSpacing: '0.08em', marginBottom: 2 },
  value:   { fontSize: 22, fontWeight: 700, color: '#fff' },
  badge:   (ok: boolean) => ({ display: 'inline-block', padding: '2px 10px', borderRadius: 99, fontSize: 11, fontWeight: 600, background: ok ? '#22c55e22' : '#ef444422', color: ok ? '#4ade80' : '#f87171' }),
  btn:     { padding: '8px 18px', borderRadius: 8, border: 'none', cursor: 'pointer', fontWeight: 600, fontSize: 13 } as const,
  btnPrimary: { background: '#e31937', color: '#fff' } as const,
  btnDanger:  { background: 'transparent', color: '#f87171', border: '1px solid #f8717155', padding: '4px 10px', borderRadius: 6, cursor: 'pointer', fontSize: 12, fontWeight: 600 } as const,
  input:   { background: '#0d0d14', border: '1px solid rgba(255,255,255,0.15)', borderRadius: 8, color: '#fff', padding: '10px 14px', fontSize: 15, width: '100%', outline: 'none' } as const,
  th:      { textAlign: 'left' as const, fontSize: 11, color: '#888', textTransform: 'uppercase' as const, letterSpacing: '0.06em', padding: '8px 12px', borderBottom: '1px solid rgba(255,255,255,0.06)' },
  td:      { padding: '10px 12px', borderBottom: '1px solid rgba(255,255,255,0.04)', fontSize: 13, verticalAlign: 'middle' as const },
}

// ── Auth screen ─────────────────────────────────────────────────────────

function LoginScreen({ onLogin }: { onLogin: (secret: string) => void }) {
  const [secret, setSecret] = useState('')
  const [error, setError]   = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')
    try {
      const r = await fetch('/api/admin/stats', { headers: { Authorization: `Bearer ${secret}` } })
      if (r.ok) {
        sessionStorage.setItem('admin_secret', secret)
        onLogin(secret)
      } else {
        setError('Wrong secret')
      }
    } catch {
      setError('Network error')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ ...S.card, width: 340, textAlign: 'center' }}>
        <div style={{ fontSize: 22, fontWeight: 700, marginBottom: 24 }}>🔐 Tesla Radar Admin</div>
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <input
            type="password"
            placeholder="Admin secret"
            value={secret}
            onChange={(e) => setSecret(e.target.value)}
            style={S.input}
            autoFocus
          />
          {error && <div style={{ color: '#f87171', fontSize: 13 }}>{error}</div>}
          <button type="submit" disabled={!secret || loading} style={{ ...S.btn, ...S.btnPrimary }}>
            {loading ? 'Checking…' : 'Login'}
          </button>
        </form>
      </div>
    </div>
  )
}

// ── Dashboard ────────────────────────────────────────────────────────────

function Dashboard({ secret }: { secret: string }) {
  const [stats, setStats]     = useState<Stats | null>(null)
  const [events, setEvents]   = useState<RoadEvent[]>([])
  const [syncing, setSyncing] = useState(false)
  const [syncMsg, setSyncMsg] = useState('')

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
    setSyncing(true)
    setSyncMsg('')
    try {
      const cronSecret = prompt('Enter CRON_SECRET to trigger sync:')
      if (!cronSecret) { setSyncing(false); return }
      const r = await fetch(`/api/cron/sync-stations?secret=${encodeURIComponent(cronSecret)}`)
      const data = await r.json() as Record<string, unknown>
      setSyncMsg(r.ok ? `✅ Synced ${String(data.synced)} stations` : `❌ ${String(data.error)}`)
      if (r.ok) await loadAll()
    } catch {
      setSyncMsg('❌ Network error')
    } finally {
      setSyncing(false)
    }
  }

  async function deleteEvent(id: string) {
    await fetch(`/api/admin/events?id=${id}`, { method: 'DELETE', headers })
    setEvents((prev) => prev.filter((e) => e.id !== id))
  }

  function fmt(iso: string) {
    return new Date(iso).toLocaleString('bg-BG', { dateStyle: 'short', timeStyle: 'short' })
  }

  return (
    <div style={S.page}>
      {/* Header */}
      <div style={{ ...S.row, justifyContent: 'space-between', marginBottom: 28 }}>
        <div style={{ fontSize: 20, fontWeight: 700 }}>⚡ Tesla Radar Admin</div>
        <button style={{ ...S.btn, background: 'rgba(255,255,255,0.07)', color: '#ccc' }}
          onClick={() => { sessionStorage.removeItem('admin_secret'); location.reload() }}>
          Logout
        </button>
      </div>

      {/* Stats */}
      {stats && (
        <div style={S.card}>
          <div style={{ ...S.row, gap: 32 }}>
            <StatBox label="Redis" value={<span style={S.badge(stats.redis)}>{stats.redis ? 'Connected' : 'Offline'}</span>} />
            <StatBox label="Stations" value={stats.stationCount ?? '—'} />
            <StatBox label="Last Sync" value={stats.lastSync ? fmt(stats.lastSync) : '—'} />
            <StatBox label="Active Events" value={stats.eventCount} />
            {stats.providers && Object.entries(stats.providers).map(([p, v]) => (
              <StatBox key={p} label={p.toUpperCase()} value={
                <span style={S.badge(v.status === 'ok')}>{v.status === 'ok' ? `${v.count}` : v.status}</span>
              } />
            ))}
          </div>
          <div style={{ marginTop: 16, display: 'flex', gap: 10, alignItems: 'center' }}>
            <button style={{ ...S.btn, ...S.btnPrimary }} onClick={() => { void triggerSync() }} disabled={syncing}>
              {syncing ? 'Syncing…' : '↻ Sync Stations Now'}
            </button>
            <button style={{ ...S.btn, background: 'rgba(255,255,255,0.07)', color: '#ccc' }} onClick={() => { void loadAll() }}>
              Refresh
            </button>
            {syncMsg && <span style={{ fontSize: 13, color: '#888' }}>{syncMsg}</span>}
          </div>
        </div>
      )}

      {/* Events table */}
      <div style={S.card}>
        <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 16 }}>
          Road Events ({events.length})
        </div>
        {events.length === 0 ? (
          <div style={{ color: '#555', fontSize: 13 }}>No active events.</div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  {['Type', 'Location', 'Reported', 'Expires', 'Confirms', ''].map((h) => (
                    <th key={h} style={S.th}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {events.map((ev) => (
                  <tr key={ev.id}>
                    <td style={S.td}>{EVENT_LABELS[ev.type] ?? ev.type}</td>
                    <td style={{ ...S.td, fontFamily: 'monospace', fontSize: 12, color: '#888' }}>
                      {ev.lat.toFixed(4)}, {ev.lng.toFixed(4)}
                    </td>
                    <td style={{ ...S.td, color: '#888' }}>{fmt(ev.reportedAt)}</td>
                    <td style={{ ...S.td, color: '#888' }}>{fmt(ev.expiresAt)}</td>
                    <td style={{ ...S.td, textAlign: 'center' }}>{ev.confirms}</td>
                    <td style={S.td}>
                      <button style={S.btnDanger} onClick={() => { void deleteEvent(ev.id) }}>
                        Delete
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}

function StatBox({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <div style={S.label}>{label}</div>
      <div style={S.value}>{value}</div>
    </div>
  )
}

// ── Root ─────────────────────────────────────────────────────────────────

export function AdminApp() {
  const [secret, setSecret] = useState(() => sessionStorage.getItem('admin_secret') ?? '')

  if (!secret) return <LoginScreen onLogin={setSecret} />
  return <Dashboard secret={secret} />
}
