// ─── User-submitted station database layer ─────────────────────────────
//
// Stores user-submitted EV stations in Redis, separate from the weekly
// provider snapshot. Supports pending/approved approval flow.
//
// Redis key: teslaradar:user-stations:v1 (JSON array, no TTL)

import { createHmac, timingSafeEqual } from 'crypto'
import { redis } from './redis.js'
import type { NormalizedStation } from '../normalize/types.js'

const USER_STATIONS_KEY = 'teslaradar:user-stations:v1'

export const userStationDb = {
  async getAll(): Promise<NormalizedStation[]> {
    if (!redis.isConfigured()) return []
    const data = await redis.get<NormalizedStation[]>(USER_STATIONS_KEY)
    return Array.isArray(data) ? data : []
  },

  async add(station: NormalizedStation): Promise<void> {
    if (!redis.isConfigured()) return
    const all = await this.getAll()
    all.push(station)
    await redis.set(USER_STATIONS_KEY, all)
  },

  async approve(id: string): Promise<boolean> {
    if (!redis.isConfigured()) return false
    const all = await this.getAll()
    const idx = all.findIndex((s) => s.id === id)
    if (idx === -1) return false
    all[idx]!.approvalStatus = 'approved'
    await redis.set(USER_STATIONS_KEY, all)
    return true
  },

  async remove(id: string): Promise<boolean> {
    if (!redis.isConfigured()) return false
    const all = await this.getAll()
    const filtered = all.filter((s) => s.id !== id)
    if (filtered.length === all.length) return false
    await redis.set(USER_STATIONS_KEY, filtered)
    return true
  },

  /** Update editable fields, only if ownerToken matches. Returns 'ok', 'not_found', or 'forbidden'. */
  async update(
    id: string,
    ownerToken: string,
    changes: Partial<Pick<NormalizedStation, 'name' | 'address' | 'city' | 'network' | 'connectors' | 'isFree' | 'pricePerKwh' | 'priceCurrency' | 'submitterNotes' | 'totalPorts' | 'maxPowerKw'>>,
  ): Promise<'ok' | 'not_found' | 'forbidden'> {
    if (!redis.isConfigured()) return 'not_found'
    const all = await this.getAll()
    const idx = all.findIndex((s) => s.id === id)
    if (idx === -1) return 'not_found'
    const station = all[idx]!
    if (!_verifyOwner(station.ownerToken, ownerToken)) return 'forbidden'
    all[idx] = { ...station, ...changes }
    await redis.set(USER_STATIONS_KEY, all)
    return 'ok'
  },

  /** Delete by owner token. Returns 'ok', 'not_found', or 'forbidden'. */
  async deleteByOwner(id: string, ownerToken: string): Promise<'ok' | 'not_found' | 'forbidden'> {
    if (!redis.isConfigured()) return 'not_found'
    const all = await this.getAll()
    const idx = all.findIndex((s) => s.id === id)
    if (idx === -1) return 'not_found'
    if (!_verifyOwner(all[idx]!.ownerToken, ownerToken)) return 'forbidden'
    const filtered = all.filter((_, i) => i !== idx)
    await redis.set(USER_STATIONS_KEY, filtered)
    return 'ok'
  },
}

function _verifyOwner(stored: string | undefined, provided: string): boolean {
  if (!stored || !provided) return false
  // Constant-time comparison to avoid timing oracles
  const a = Buffer.from(stored.padEnd(64, '\0'), 'utf8')
  const b = Buffer.from(provided.padEnd(64, '\0'), 'utf8')
  try { return timingSafeEqual(a, b) } catch { return false }
}

// ── HMAC-based one-click approval token ──────────────────────────────

export function makeApproveToken(stationId: string): string {
  const secret = process.env['ADMIN_SECRET'] ?? 'fallback'
  return createHmac('sha256', secret).update(stationId).digest('hex')
}

export function verifyApproveToken(stationId: string, token: string): boolean {
  try {
    const expected = makeApproveToken(stationId)
    const a = Buffer.from(expected, 'utf8')
    const b = Buffer.from(token.padEnd(expected.length, ' '), 'utf8')
    if (a.length !== b.length) return false
    return timingSafeEqual(a, b)
  } catch {
    return false
  }
}
