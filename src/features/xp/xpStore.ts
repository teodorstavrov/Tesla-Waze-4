// ─── Driver XP Store ──────────────────────────────────────────────────────
//
// Fetches XP from /api/xp/me on init (after auth).
// awardXP(): fire-and-forget POST to /api/xp/award + optimistic local update.
// fetchLeaderboard(): cached 5 min client-side.

import { authStore } from '@/features/auth/authStore'

export interface XPState {
  xp:    number
  level: number
  rank:  number | null   // position in leaderboard (1-indexed), null = not ranked yet
  loading: boolean
  initialized: boolean
}

export interface LeaderboardEntry {
  rank:  number
  name:  string
  xp:    number
  level: number
}

// ── Level formula (mirrors server) ────────────────────────────────────────
export function xpToLevel(xp: number): number {
  if (xp < 3000) return 1 + Math.floor(xp / 300)
  if (xp < 9000) return 11 + Math.floor((xp - 3000) / 600)
  return Math.min(30, 21 + Math.floor((xp - 9000) / 1000))
}

export function levelToMinXp(level: number): number {
  if (level <= 10) return (level - 1) * 300
  if (level <= 20) return 3000 + (level - 11) * 600
  return 9000 + (level - 21) * 1000
}

export function xpProgress(xp: number): number {
  const lv = xpToLevel(xp)
  if (lv >= 30) return 1
  const min  = levelToMinXp(lv)
  const next = levelToMinXp(lv + 1)
  return (xp - min) / (next - min)
}

// ── State ─────────────────────────────────────────────────────────────────

let _state: XPState = { xp: 0, level: 1, rank: null, loading: false, initialized: false }
const _listeners = new Set<() => void>()

function _notify(): void { _listeners.forEach((fn) => fn()) }

function _setState(patch: Partial<XPState>): void {
  _state = { ..._state, ...patch }
  _notify()
}

// ── Leaderboard cache ─────────────────────────────────────────────────────

let _leaderboardCache: LeaderboardEntry[] | null = null
let _leaderboardFetchedAt = 0
const LEADERBOARD_TTL_MS = 5 * 60 * 1000

// ── Auth helpers ──────────────────────────────────────────────────────────

function _creds(): { email: string; pin: string } | null {
  try {
    const raw = localStorage.getItem('tesradar_auth')
    if (!raw) return null
    const c = JSON.parse(raw) as { email?: string; pin?: string }
    if (c.email && c.pin) return { email: c.email, pin: c.pin }
    return null
  } catch {
    return null
  }
}

// ── API calls ─────────────────────────────────────────────────────────────

async function _fetchMyXP(): Promise<void> {
  const creds = _creds()
  if (!creds) return

  _setState({ loading: true })
  try {
    const r = await fetch(`/api/xp/me?email=${encodeURIComponent(creds.email)}&pin=${encodeURIComponent(creds.pin)}`)
    if (!r.ok) return
    const data = await r.json() as { xp: number; level: number; rank: number | null }
    _setState({ xp: data.xp, level: data.level, rank: data.rank, initialized: true })
  } catch {
    // Network error — keep existing state
  } finally {
    _setState({ loading: false })
  }
}

// ── Public API ────────────────────────────────────────────────────────────

export const xpStore = {
  getState: (): Readonly<XPState> => _state,

  subscribe(fn: () => void): () => void {
    _listeners.add(fn)
    return () => _listeners.delete(fn)
  },

  /** Call once after auth is confirmed. */
  async init(): Promise<void> {
    if (_state.initialized) return
    await _fetchMyXP()
  },

  /** Fire-and-forget XP award. Updates state optimistically. */
  awardXP(action: 'report' | 'confirm' | 'deny'): void {
    const creds = _creds()
    if (!creds) return

    // Optimistic update (server may cap — that's fine, state refreshes on next init)
    const delta = action === 'report' ? 50 : 10
    const newXp = _state.xp + delta
    _setState({ xp: newXp, level: xpToLevel(newXp) })

    fetch('/api/xp/award', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ email: creds.email, pin: creds.pin, action }),
    }).then(async (r) => {
      if (!r.ok) return
      const data = await r.json() as { xp?: number; level?: number; capped?: boolean }
      if (data.capped) {
        // Server capped — revert optimistic delta
        const reverted = _state.xp - delta
        _setState({ xp: Math.max(0, reverted), level: xpToLevel(Math.max(0, reverted)) })
      } else if (data.xp !== undefined) {
        _setState({ xp: data.xp, level: data.level ?? xpToLevel(data.xp) })
      }
    }).catch(() => { /* network error — keep optimistic value */ })
  },

  /** Fetch top 50 leaderboard; cached 5 min client-side. */
  async fetchLeaderboard(): Promise<LeaderboardEntry[]> {
    const now = Date.now()
    if (_leaderboardCache && now - _leaderboardFetchedAt < LEADERBOARD_TTL_MS) {
      return _leaderboardCache
    }
    try {
      const r = await fetch('/api/xp/leaderboard')
      if (!r.ok) return _leaderboardCache ?? []
      const data = await r.json() as { entries: LeaderboardEntry[] }
      _leaderboardCache = data.entries
      _leaderboardFetchedAt = now
      return _leaderboardCache
    } catch {
      return _leaderboardCache ?? []
    }
  },
}

// Auto-init when auth becomes authenticated
authStore.subscribe(() => {
  if (authStore.getState().status === 'authenticated' && !_state.initialized) {
    void xpStore.init()
  }
})
