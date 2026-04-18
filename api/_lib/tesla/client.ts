// ─── Tesla Fleet API HTTP client ─────────────────────────────────────────
// All calls are made server-side. Handles automatic token refresh when
// the stored access token is within 60 seconds of expiry.
//
// Regional base URL:
//   EU (BG, NO, SE, FI): fleet-api.prd.eu.vn.cloud.tesla.com
//   NA:                   fleet-api.prd.na.vn.cloud.tesla.com
// Override via TESLA_API_BASE_URL env var.

import { refreshTokens } from './auth.js'
import { getSession, updateSessionTokens } from './session.js'

export const TESLA_API_BASE =
  process.env['TESLA_API_BASE_URL'] ?? 'https://fleet-api.prd.eu.vn.cloud.tesla.com'

// ── Types ─────────────────────────────────────────────────────────────────

export interface TeslaVehicle {
  id:            number
  vehicle_id:    number
  vin:           string
  display_name?: string
  state:         string   // 'online' | 'asleep' | 'offline' | 'waking' | 'unknown'
}

// ── Token management ──────────────────────────────────────────────────────

/**
 * Returns a valid access token for the session, refreshing automatically
 * if the stored token is expired or within 60 s of expiry.
 * Returns null if the session is missing or refresh fails.
 */
export async function getValidAccessToken(sessionId: string): Promise<string | null> {
  const sess = await getSession(sessionId)
  if (!sess) return null

  // Token still valid with 60 s buffer
  if (Date.now() < sess.tokenExpiresAt - 60_000) {
    return sess.accessToken
  }

  // Refresh
  const clientId     = process.env['TESLA_CLIENT_ID']!
  const clientSecret = process.env['TESLA_CLIENT_SECRET']!
  try {
    const newTokens = await refreshTokens(sess.refreshToken, clientId, clientSecret)
    await updateSessionTokens(sessionId, newTokens)
    return newTokens.accessToken
  } catch {
    return null   // refresh failed — session is effectively invalid
  }
}

// ── Authenticated fetch ────────────────────────────────────────────────────

async function _teslaFetch(
  sessionId: string,
  path:      string,
  options?:  RequestInit,
): Promise<Response> {
  const token = await getValidAccessToken(sessionId)
  if (!token) throw new Error('No valid Tesla access token — please reconnect')

  return fetch(`${TESLA_API_BASE}${path}`, {
    ...options,
    headers: {
      Authorization:  `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...((options?.headers as Record<string, string>) ?? {}),
    },
  })
}

// ── Vehicle list ──────────────────────────────────────────────────────────

export async function getVehicles(sessionId: string): Promise<TeslaVehicle[]> {
  const res = await _teslaFetch(sessionId, '/api/1/vehicles')
  if (!res.ok) throw new Error(`Tesla GET /vehicles failed: ${res.status}`)
  const data = (await res.json()) as { response: TeslaVehicle[]; count: number }
  return data.response ?? []
}

// ── Vehicle data ───────────────────────────────────────────────────────────

/**
 * Fetch live vehicle data from the specified endpoints.
 * Endpoint examples: 'charge_state', 'drive_state', 'vehicle_state'
 * Combined: 'charge_state;drive_state;vehicle_state'
 */
export async function getVehicleData(
  sessionId:  string,
  vehicleId:  string,
  endpoints = 'charge_state;drive_state;vehicle_state',
): Promise<unknown> {
  const path = `/api/1/vehicles/${vehicleId}/vehicle_data?endpoints=${encodeURIComponent(endpoints)}`
  const res  = await _teslaFetch(sessionId, path)
  if (!res.ok) throw new Error(`Tesla GET vehicle_data failed: ${res.status}`)
  const data = (await res.json()) as { response: unknown }
  return data.response
}

// ── Wake up ───────────────────────────────────────────────────────────────

/**
 * Wake a sleeping vehicle. Tesla vehicles go to sleep after ~15 min idle.
 * Waking can take 30–90 seconds — the caller should poll vehicle state
 * and wait for state === 'online' before calling getVehicleData.
 */
export async function wakeVehicle(sessionId: string, vehicleId: string): Promise<void> {
  const res = await _teslaFetch(sessionId, `/api/1/vehicles/${vehicleId}/wake_up`, { method: 'POST' })
  if (!res.ok) throw new Error(`Tesla wake_up failed: ${res.status}`)
}
