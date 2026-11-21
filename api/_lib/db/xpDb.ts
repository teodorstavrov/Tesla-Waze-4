// ─── XP / Driver Points database ──────────────────────────────────────────
//
// Storage layout in Redis:
//   leaderboard              → Sorted Set: member=email, score=XP (integers)
//   users                    → Hash (already exists): field=email, value=JSON{name,...}
//   xp:cap:{action}:{email}:{YYYY-MM-DD}  → plain INCR counter, 25h TTL
//   xp:daily:{email}:{YYYY-MM-DD}         → "true" (compressed), 25h TTL — daily bonus gate

import { redis } from './redis.js'

// ── Level formula ──────────────────────────────────────────────────────────
// Lv 1-10:  300 XP per level  (0, 300 … 2 700)
// Lv 11-20: 600 XP per level  (3 000, 3 600 … 8 400)
// Lv 21-30: 1 000 XP per level
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

export function xpToNextLevel(xp: number): number {
  const lv = xpToLevel(xp)
  if (lv >= 30) return 0
  return levelToMinXp(lv + 1) - xp
}

// ── XP per action ─────────────────────────────────────────────────────────
export const XP_VALUES = {
  report:  50,
  confirm: 10,
  deny:    10,
  daily:   20,
} as const

export type XPAction = keyof typeof XP_VALUES

// Daily caps per action — prevents farming
const DAILY_CAPS: Record<XPAction, number> = {
  report:  10,
  confirm: 30,
  deny:    20,
  daily:   1,
}

// ── Display name ───────────────────────────────────────────────────────────
export function toDisplayName(fullName: string): string {
  const parts = fullName.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return 'Driver'
  if (parts.length === 1) return parts[0]!.slice(0, 15)
  return `${parts[0]} ${parts[1]!.charAt(0)}.`
}

// ── Database operations ───────────────────────────────────────────────────

export const xpDb = {

  /** Award XP for one action. Checks daily cap. Returns new total or null if capped/error. */
  async award(
    email: string,
    action: XPAction,
    delta = XP_VALUES[action],
  ): Promise<{ xp: number; level: number; delta: number } | null> {
    const today = new Date().toISOString().slice(0, 10)
    const capKey = `xp:cap:${action}:${email}:${today}`

    // Read current cap count (INCR stores plain integers, JSON.parse handles that fine)
    const capCount = (await redis.get<number>(capKey).catch(() => null)) ?? 0
    if (capCount >= DAILY_CAPS[action]) return null

    // Increment cap counter; set TTL on first creation
    const newCount = await redis.incr(capKey)
    if (newCount === 1) await redis.expire(capKey, 90_000).catch(() => { /* noop */ })

    // Add XP to leaderboard sorted set
    const newXp = await redis.zincrby('leaderboard', delta, email)
    return { xp: newXp, level: xpToLevel(newXp), delta }
  },

  /** Award daily login bonus. Returns true if bonus was given, false if already given today. */
  async awardDailyBonus(email: string): Promise<boolean> {
    const today = new Date().toISOString().slice(0, 10)
    const key = `xp:daily:${email}:${today}`
    const exists = await redis.get<boolean>(key).catch(() => null)
    if (exists) return false
    await redis.setWithExpiry(key, true, 90_000)
    await xpDb.award(email, 'daily')
    return true
  },

  /** Current XP, level, and rank for one user. XP=0 if not yet on leaderboard. */
  async getMyXP(email: string): Promise<{ xp: number; level: number; rank: number | null }> {
    const [score, rank] = await Promise.all([
      redis.zscore('leaderboard', email).catch(() => null),
      redis.zrevrank('leaderboard', email).catch(() => null),
    ])
    const xp = score ?? 0
    return { xp, level: xpToLevel(xp), rank: rank !== null ? rank + 1 : null }
  },

  /** Top N leaderboard entries. Names come from the existing 'users' hash. */
  async getLeaderboard(limit = 50): Promise<Array<{ name: string; xp: number; level: number; rank: number }>> {
    const entries = await redis.zrevrangeWithScores('leaderboard', 0, limit - 1).catch(() => [])
    if (entries.length === 0) return []

    // Fetch user records from the existing 'users' hash in one pipeline call.
    // Values are raw JSON strings (not gz-compressed) — stored via hset in register.ts.
    const nameCommands: (string | number)[][] = entries.map((e) => ['HGET', 'users', e.member])
    let rawNames: unknown[]
    try {
      rawNames = await redis.pipeline(nameCommands)
    } catch {
      rawNames = entries.map(() => null)
    }

    return entries.map((e, i) => {
      let name = 'Driver'
      const raw = rawNames[i]
      if (typeof raw === 'string' && raw) {
        try {
          const user = JSON.parse(raw) as { name?: string }
          name = toDisplayName(user.name ?? '')
        } catch {
          name = 'Driver'
        }
      }
      return { name, xp: e.score, level: xpToLevel(e.score), rank: i + 1 }
    })
  },
}
