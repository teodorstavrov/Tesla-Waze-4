// ─── HTTP cache header helpers ─────────────────────────────────────────
import type { VercelResponse } from '@vercel/node'

/**
 * Set Cache-Control headers for EV station responses.
 * staleWhileRevalidateSec lets the CDN serve stale data immediately while
 * fetching a fresh response in the background — critical for UX under load.
 */
export function setCacheHeaders(
  res: VercelResponse,
  ttlSec: number,
  staleWhileRevalidateSec = ttlSec * 2,
): void {
  const cc = `public, s-maxage=${ttlSec}, stale-while-revalidate=${staleWhileRevalidateSec}`
  res.setHeader('Cache-Control', cc)
  res.setHeader('CDN-Cache-Control', cc)
  res.setHeader('Vercel-CDN-Cache-Control', cc)
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS')
}
