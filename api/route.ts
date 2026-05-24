import type { VercelRequest, VercelResponse } from '@vercel/node'

const VALHALLA_BASE = 'https://valhalla1.openstreetmap.de'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).end()

  try {
    const upstream = await fetch(`${VALHALLA_BASE}/route`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(req.body),
      signal:  AbortSignal.timeout(15_000),
    })

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
