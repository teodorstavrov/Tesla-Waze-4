import type { VercelRequest, VercelResponse } from '@vercel/node'

const OVERPASS_PRIMARY  = 'https://overpass-api.de/api/interpreter'
const OVERPASS_FALLBACK = 'https://overpass.kumi.systems/api/interpreter'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).end()

  // Read raw body (Vercel provides it as Buffer when Content-Type is form-encoded)
  const raw = req.body as string | Buffer | undefined
  const body = raw instanceof Buffer ? raw.toString() : (raw ?? '')

  for (const url of [OVERPASS_PRIMARY, OVERPASS_FALLBACK]) {
    try {
      const upstream = await fetch(url, {
        method:  'POST',
        body,
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        signal:  AbortSignal.timeout(10_000),
      })
      if (!upstream.ok) continue
      const data = await upstream.json()
      res.setHeader('Cache-Control', 'public, s-maxage=60, stale-while-revalidate=30')
      return res.status(200).json(data)
    } catch {
      // try next endpoint
    }
  }

  return res.status(503).json({ error: 'Overpass unavailable' })
}
