import { getSession, saveSession, invalidateSession } from '../../cache/redis.client.js';
import { logger } from '../../monitoring/metrics.js';
import type { WazeSession } from '../../types/waze.js';

// Default session used when Redis cache is empty (will trigger Playwright)
const FALLBACK_USER_AGENTS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
];

function randomUA(): string {
  return FALLBACK_USER_AGENTS[Math.floor(Math.random() * FALLBACK_USER_AGENTS.length)]!;
}

/**
 * Returns the current cached session, or a minimal placeholder.
 * A placeholder session will fail Waze's auth check (403) and trigger
 * Playwright capture.
 */
export async function getCurrentSession(): Promise<WazeSession | null> {
  return getSession();
}

/**
 * Marks the session as invalid so the next request triggers Playwright.
 */
export async function invalidateCachedSession(): Promise<void> {
  await invalidateSession();
}

/**
 * Stores a session captured by Playwright (or manually supplied).
 */
export async function storeCapturedSession(session: WazeSession): Promise<void> {
  await saveSession(session);
}

/**
 * Build minimal request headers from a session object.
 * If session is null, returns headers that will likely trigger a 403 but
 * allow Axios to at least make the request.
 */
export function buildHeaders(session: WazeSession | null): Record<string, string> {
  const ua = session?.userAgent ?? randomUA();
  const referer = session?.referer ?? 'https://www.waze.com/live-map';
  const cookie = session?.cookies ?? '';

  const headers: Record<string, string> = {
    'User-Agent': ua,
    'Accept': 'application/json, text/plain, */*',
    'Accept-Language': 'en-US,en;q=0.9',
    'Accept-Encoding': 'gzip, deflate, br',
    'Cache-Control': 'no-cache',
    'Pragma': 'no-cache',
    'Referer': referer,
    'Origin': 'https://www.waze.com',
    'Sec-Fetch-Dest': 'empty',
    'Sec-Fetch-Mode': 'cors',
    'Sec-Fetch-Site': 'same-origin',
    'X-Requested-With': 'XMLHttpRequest',
  };

  if (cookie) {
    headers['Cookie'] = cookie;
  }

  return headers;
}

/**
 * Check if a session is recent enough to trust (< 3.5h old).
 */
export function isSessionFresh(session: WazeSession): boolean {
  const ageMs = Date.now() - session.capturedAt;
  return ageMs < 3.5 * 60 * 60 * 1000; // 3.5 hours
}
