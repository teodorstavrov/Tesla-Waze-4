import type { VercelRequest, VercelResponse } from '@vercel/node'

const VALHALLA_BASE = 'https://valhalla1.openstreetmap.de'

async function tryFetch(body: unknown, timeoutMs: number): Promise<Response> {
  return fetch(`${VALHALLA_BASE}/route`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify(body),
    signal:  AbortSignal.timeout(timeoutMs),
  })
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).end()

  try {
    // First attempt — 12 s timeout
    let upstream = await tryFetch(req.body, 12_000).catch(() => null)

    // Single retry on transient 5xx (e.g. 502 Bad Gateway from valhalla1)
    if (!upstream || (upstream.status >= 500 && upstream.status < 600)) {
      await new Promise<void>((r) => setTimeout(r, 2_000))
      upstream = await tryFetch(req.body, 12_000).catch(() => null)
    }

    if (!upstream) {
      return res.status(503).json({ error: 'Routing service unavailable' })
    }

    if (!upstream.ok) {
      const txt = await upstream.text().catch(() => '')
      return res.status(upstream.status).json({ error: txt.slice(0, 200) })
    }

    const data = await upstream.json()
    // Cache routes 30 min — same O/D pair is stable
    res.setHeader('Cache-Control', 'public, s-maxage=1800, stale-while-revalidate=300')
    return res.status(200).json(data)
  } catch {
    return res.status(503).json({ error: 'Routing service unavailable' })
  }
}
