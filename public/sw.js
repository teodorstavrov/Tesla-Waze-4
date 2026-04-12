// ─── TesRadar Service Worker ─────────────────────────────────────────
// Cache strategies:
//   • Vite assets (/assets/*)            → Cache-first (content-hashed = immutable)
//   • Map tiles (CARTO, ArcGIS)          → Cache-first, 30-day TTL, max 1500 tiles
//   • /api/ev/stations                   → Stale-while-revalidate, 1h TTL; offline fallback
//   • Other API calls (/api/*)           → Network-only (always fresh)
//   • Navigation (HTML pages)            → Network-first, cache fallback

const CACHE_VERSION  = 'v3'
const SHELL_CACHE    = `teslaradar-shell-${CACHE_VERSION}`
const TILE_CACHE     = `teslaradar-tiles-${CACHE_VERSION}`
const API_CACHE      = `teslaradar-api-${CACHE_VERSION}`
const TILE_MAX       = 1500
const TILE_TTL_MS    = 30 * 24 * 60 * 60 * 1000  // 30 days
const API_TTL_MS     = 60 * 60 * 1000             // 1 hour

const TILE_HOSTS = [
  'basemaps.cartocdn.com',
  'server.arcgisonline.com',
]

// ── Install: precache the app shell ────────────────────────────────────
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(SHELL_CACHE).then((cache) =>
      cache.addAll(['/', '/index.html'])
    ).then(() => self.skipWaiting())
  )
})

// ── Activate: remove old caches ─────────────────────────────────────────
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((k) => k !== SHELL_CACHE && k !== TILE_CACHE && k !== API_CACHE)
          .map((k) => caches.delete(k))
      )
    ).then(() => self.clients.claim())
  )
})

// ── Fetch ────────────────────────────────────────────────────────────────
self.addEventListener('fetch', (event) => {
  const { request } = event
  const url = new URL(request.url)

  // Skip non-GET
  if (request.method !== 'GET') return

  // /api/ev/stations → stale-while-revalidate with offline fallback
  if (url.pathname.startsWith('/api/ev/stations')) {
    event.respondWith(stationsFirst(request))
    return
  }

  // Other API → network-only (always fresh)
  if (url.pathname.startsWith('/api/')) return

  // Map tiles → cache-first with TTL
  if (TILE_HOSTS.some((h) => url.hostname.endsWith(h))) {
    event.respondWith(tileFirst(request))
    return
  }

  // Vite immutable assets → cache-first
  if (url.pathname.startsWith('/assets/')) {
    event.respondWith(assetFirst(request))
    return
  }

  // Navigation → network-first, fall back to cached shell
  if (request.mode === 'navigate') {
    event.respondWith(navigateFirst(request))
    return
  }
})

// ── Strategy: stations stale-while-revalidate ────────────────────────────
// Serve cached response immediately if fresh (<1h); always revalidate in bg.
// If network fails and cache is stale, serve stale (offline fallback).
async function stationsFirst(request) {
  const cache  = await caches.open(API_CACHE)
  const cached = await cache.match(request)
  const age    = cached ? Date.now() - Number(cached.headers.get('x-cached-at') ?? 0) : Infinity

  // Fresh cache: serve immediately, revalidate in background
  if (cached && age < API_TTL_MS) {
    fetchAndCacheApi(cache, request)  // background revalidate
    return cached
  }

  // Stale or no cache: try network first
  try {
    return await fetchAndCacheApi(cache, request)
  } catch {
    // Network failed — serve stale if available
    if (cached) return cached
    return new Response(JSON.stringify({ stations: [], meta: { offline: true } }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  }
}

async function fetchAndCacheApi(cache, request) {
  const res = await fetch(request)
  if (res.ok) {
    const headers = new Headers(res.headers)
    headers.set('x-cached-at', String(Date.now()))
    const stamped = new Response(await res.clone().arrayBuffer(), {
      status: res.status, statusText: res.statusText, headers,
    })
    cache.put(request, stamped)
  }
  return res
}

// ── Strategy: tile cache-first with TTL ─────────────────────────────────
async function tileFirst(request) {
  const cache = await caches.open(TILE_CACHE)
  const cached = await cache.match(request)

  if (cached) {
    const age = Date.now() - Number(cached.headers.get('x-cached-at') ?? 0)
    if (age < TILE_TTL_MS) return cached
    // Stale — fetch fresh in background, serve stale now
    fetchAndCacheTile(cache, request)
    return cached
  }

  return fetchAndCacheTile(cache, request)
}

async function fetchAndCacheTile(cache, request) {
  try {
    const res = await fetch(request)
    if (res.ok) {
      // Clone response and inject timestamp header
      const headers = new Headers(res.headers)
      headers.set('x-cached-at', String(Date.now()))
      const stamped = new Response(await res.clone().arrayBuffer(), {
        status: res.status,
        statusText: res.statusText,
        headers,
      })
      cache.put(request, stamped)
      // Prune oldest tiles when over limit (fire-and-forget)
      pruneTileCache(cache)
    }
    return res
  } catch {
    // Offline and no cache — return empty transparent tile
    return new Response(EMPTY_TILE, { headers: { 'Content-Type': 'image/png' } })
  }
}

async function pruneTileCache(cache) {
  const keys = await cache.keys()
  if (keys.length <= TILE_MAX) return
  // Delete oldest entries (by insertion order in Cache API)
  const toDelete = keys.slice(0, keys.length - TILE_MAX)
  await Promise.all(toDelete.map((k) => cache.delete(k)))
}

// ── Strategy: immutable asset cache-first ───────────────────────────────
async function assetFirst(request) {
  const cached = await caches.match(request)
  if (cached) return cached
  try {
    const res = await fetch(request)
    if (res.ok) {
      const cache = await caches.open(SHELL_CACHE)
      cache.put(request, res.clone())
    }
    return res
  } catch {
    return new Response('Asset unavailable', { status: 503 })
  }
}

// ── Strategy: navigate network-first ────────────────────────────────────
async function navigateFirst(request) {
  try {
    const res = await fetch(request)
    if (res.ok) {
      const cache = await caches.open(SHELL_CACHE)
      cache.put(request, res.clone())
    }
    return res
  } catch {
    const cached = await caches.match('/') ?? await caches.match('/index.html')
    return cached ?? new Response('Offline', { status: 503 })
  }
}

// ── 1×1 transparent PNG for offline tile placeholder ────────────────────
const EMPTY_TILE = Uint8Array.from(atob(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='
), (c) => c.charCodeAt(0)).buffer
