// ─── Server-side in-memory cache ──────────────────────────────────────
//
// Vercel serverless functions share state within a warm instance.
// This cache significantly reduces external API calls when multiple
// users are on the same Vercel instance (common for warm instances
// serving ~100 concurrent users).
//
// On cold start, cache is empty. On warm instance, subsequent requests
// benefit from cached responses.
//
// For higher-scale deployments, replace with Upstash Redis (Phase 12).
// The interface is intentionally simple so the swap is trivial.

interface CacheEntry<T> {
  data: T
  expiresAt: number
}

const store = new Map<string, CacheEntry<unknown>>()

/** Maximum entries to prevent unbounded growth on long-lived instances */
const MAX_ENTRIES = 500

export function cacheGet<T>(key: string): T | null {
  const entry = store.get(key) as CacheEntry<T> | undefined
  if (!entry) return null
  if (Date.now() > entry.expiresAt) {
    store.delete(key)
    return null
  }
  return entry.data
}

export function cacheSet<T>(key: string, data: T, ttlMs: number): void {
  // Evict oldest entry if at capacity
  if (store.size >= MAX_ENTRIES) {
    const oldest = store.keys().next().value
    if (oldest !== undefined) store.delete(oldest)
  }
  store.set(key, { data, expiresAt: Date.now() + ttlMs })
}

export function cacheDel(key: string): void {
  store.delete(key)
}

export function cacheStats(): { size: number; maxEntries: number } {
  return { size: store.size, maxEntries: MAX_ENTRIES }
}
