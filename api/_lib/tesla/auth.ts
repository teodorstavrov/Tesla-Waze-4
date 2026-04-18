// ─── Tesla OAuth 2.0 + PKCE helpers ──────────────────────────────────────
// Pure stateless functions — no database, no side effects.
// Handles the cryptographic and HTTP parts of the Tesla OAuth flow.
//
// Tesla Fleet API uses standard OAuth 2.0 + PKCE (RFC 7636).
// Docs: https://developer.tesla.com/docs/fleet-api/authentication/third-party-tokens

import { createHash, randomBytes } from 'crypto'

const TESLA_AUTH_BASE = 'https://auth.tesla.com/oauth2/v3'

// Scopes required for battery + location data.
// vehicle_location is included but may require separate user consent depending on vehicle.
export const TESLA_SCOPES = [
  'openid',
  'offline_access',
  'vehicle_device_data',
  'vehicle_location',
].join(' ')

// ── PKCE ──────────────────────────────────────────────────────────────────

/** Generate a cryptographically random PKCE code_verifier (43 bytes → 58 base64url chars). */
export function generateCodeVerifier(): string {
  return randomBytes(32).toString('base64url')
}

/** Derive code_challenge = BASE64URL(SHA256(code_verifier)). */
export function generateCodeChallenge(codeVerifier: string): string {
  return createHash('sha256').update(codeVerifier).digest('base64url')
}

/** Generate a random state value for CSRF protection (32 hex chars). */
export function generateState(): string {
  return randomBytes(16).toString('hex')
}

// ── Authorization URL ──────────────────────────────────────────────────────

/**
 * Build the Tesla authorization URL the browser must be redirected to.
 * audience must match the regional Fleet API base URL so Tesla issues a
 * token scoped to that region.
 */
export function buildAuthorizationUrl(
  clientId:      string,
  redirectUri:   string,
  state:         string,
  codeChallenge: string,
  apiBaseUrl:    string,
): string {
  const params = new URLSearchParams({
    response_type:         'code',
    client_id:             clientId,
    redirect_uri:          redirectUri,
    scope:                 TESLA_SCOPES,
    state,
    code_challenge:        codeChallenge,
    code_challenge_method: 'S256',
    audience:              apiBaseUrl,   // region token scoping
  })
  return `${TESLA_AUTH_BASE}/authorize?${params.toString()}`
}

// ── Token shapes ───────────────────────────────────────────────────────────

export interface TeslaTokens {
  accessToken:  string
  refreshToken: string
  expiresAt:    number   // Unix ms
}

interface TokenResponse {
  access_token:  string
  refresh_token: string
  expires_in:    number
}

// ── Code → Tokens ──────────────────────────────────────────────────────────

/** Exchange an authorization code for access + refresh tokens. */
export async function exchangeCodeForTokens(
  code:         string,
  codeVerifier: string,
  clientId:     string,
  clientSecret: string,
  redirectUri:  string,
): Promise<TeslaTokens> {
  const res = await fetch(`${TESLA_AUTH_BASE}/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type:    'authorization_code',
      client_id:     clientId,
      client_secret: clientSecret,
      code,
      redirect_uri:  redirectUri,
      code_verifier: codeVerifier,
    }),
  })

  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`Tesla token exchange failed (${res.status}): ${text}`)
  }

  const data = (await res.json()) as TokenResponse
  return {
    accessToken:  data.access_token,
    refreshToken: data.refresh_token,
    expiresAt:    Date.now() + data.expires_in * 1000,
  }
}

// ── Token Refresh ──────────────────────────────────────────────────────────

/** Use a refresh token to obtain a new access token. */
export async function refreshTokens(
  refreshToken: string,
  clientId:     string,
  clientSecret: string,
): Promise<TeslaTokens> {
  const res = await fetch(`${TESLA_AUTH_BASE}/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type:    'refresh_token',
      client_id:     clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
    }),
  })

  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`Tesla token refresh failed (${res.status}): ${text}`)
  }

  const data = (await res.json()) as TokenResponse
  return {
    accessToken:  data.access_token,
    refreshToken: data.refresh_token,
    expiresAt:    Date.now() + data.expires_in * 1000,
  }
}

// ── Token Revocation ───────────────────────────────────────────────────────

/** Best-effort token revocation. Never throws — revocation failure is non-fatal. */
export async function revokeToken(
  token:        string,
  clientId:     string,
  clientSecret: string,
): Promise<void> {
  try {
    await fetch(`${TESLA_AUTH_BASE}/revoke`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        token,
        client_id:     clientId,
        client_secret: clientSecret,
      }),
    })
  } catch {
    // Best-effort — ignore revocation failures
  }
}
