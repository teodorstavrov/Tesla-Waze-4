// ─── Cookie parsing helper ────────────────────────────────────────────────
// Used by Tesla auth endpoints to read the session cookie from request headers.

/** Parse a named cookie from the raw Cookie header string. Returns null if absent. */
export function parseCookie(header: string, name: string): string | null {
  for (const part of header.split(';')) {
    const trimmed = part.trim()
    if (trimmed.startsWith(`${name}=`)) return trimmed.slice(name.length + 1)
  }
  return null
}

/** Build a Set-Cookie string for the session cookie. */
export function buildSessionCookie(name: string, value: string, maxAgeSeconds: number): string {
  return [
    `${name}=${value}`,
    `Max-Age=${maxAgeSeconds}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    'Secure',
  ].join('; ')
}

/** Build a Set-Cookie string that clears the session cookie. */
export function clearSessionCookie(name: string): string {
  return `${name}=; Max-Age=0; Path=/; HttpOnly; SameSite=Lax; Secure`
}
