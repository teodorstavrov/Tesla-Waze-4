// ─── Tesla session management ─────────────────────────────────────────────
// Associates a browser session cookie (random UUID) with Tesla OAuth tokens
// stored in Redis. The browser only ever holds the session ID — never tokens.
//
// Two key types in Redis:
//   tesla:sess:{id}   — the OAuth session (tokens + vehicle info)
//   tesla:pkce:{state} — ephemeral PKCE verifier during OAuth flow (10 min TTL)

import { redis } from '../db/redis.js'
import type { TeslaTokens } from './auth.js'

const SESSION_TTL_S = 90 * 24 * 60 * 60  // 90 days
const PKCE_TTL_S    = 10 * 60            // 10 minutes — enough to complete OAuth

// ── Key builders ──────────────────────────────────────────────────────────

function _sessKey(id: string)    { return `tesla:sess:${id}` }
function _pkceKey(state: string) { return `tesla:pkce:${state}` }

// ── Types ─────────────────────────────────────────────────────────────────

export interface TeslaSession {
  accessToken:    string
  refreshToken:   string
  tokenExpiresAt: number        // Unix ms
  vehicleId:      string | null
  vehicleName:    string | null
  createdAt:      number        // Unix ms
}

// ── PKCE state ────────────────────────────────────────────────────────────

/** Store code_verifier keyed by OAuth state parameter (10 min). */
export async function savePkceState(state: string, codeVerifier: string): Promise<void> {
  await redis.setWithExpiry(_pkceKey(state), { codeVerifier }, PKCE_TTL_S)
}

/**
 * Retrieve and atomically delete the code_verifier for a state.
 * Returns null if the state has expired or was already consumed.
 */
export async function consumePkceState(state: string): Promise<string | null> {
  const key  = _pkceKey(state)
  const data = await redis.get<{ codeVerifier: string }>(key)
  if (!data) return null
  await redis.del(key)          // consume — prevents replay
  return data.codeVerifier
}

// ── Session CRUD ──────────────────────────────────────────────────────────

/** Persist a new session (or overwrite an existing one). */
export async function saveSession(
  sessionId:   string,
  tokens:      TeslaTokens,
  vehicleId:   string | null,
  vehicleName: string | null,
): Promise<void> {
  const sess: TeslaSession = {
    accessToken:    tokens.accessToken,
    refreshToken:   tokens.refreshToken,
    tokenExpiresAt: tokens.expiresAt,
    vehicleId,
    vehicleName,
    createdAt: Date.now(),
  }
  await redis.setWithExpiry(_sessKey(sessionId), sess, SESSION_TTL_S)
}

/** Read a session. Returns null if absent or expired. */
export async function getSession(sessionId: string): Promise<TeslaSession | null> {
  return redis.get<TeslaSession>(_sessKey(sessionId))
}

/** Replace stored tokens in-place (called after a token refresh). */
export async function updateSessionTokens(
  sessionId: string,
  tokens:    TeslaTokens,
): Promise<void> {
  const existing = await getSession(sessionId)
  if (!existing) return
  const updated: TeslaSession = {
    ...existing,
    accessToken:    tokens.accessToken,
    refreshToken:   tokens.refreshToken,
    tokenExpiresAt: tokens.expiresAt,
  }
  await redis.setWithExpiry(_sessKey(sessionId), updated, SESSION_TTL_S)
}

/** Delete session — called on disconnect. */
export async function deleteSession(sessionId: string): Promise<void> {
  await redis.del(_sessKey(sessionId))
}
