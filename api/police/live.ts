import type { VercelRequest, VercelResponse } from '@vercel/node'
import pg from 'pg'

const { Client } = pg

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const dbUrl = process.env.WAZE_DATABASE_URL
  if (!dbUrl) {
    return res.status(503).json({ error: 'Police markers database not configured' })
  }

  const client = new Client({ connectionString: dbUrl, ssl: { rejectUnauthorized: false } })

  try {
    await client.connect()

    const { rows } = await client.query(`
      SELECT
        id, waze_uuid,
        latitude, longitude,
        road_name, city, subtype,
        confidence, reliability, thumbs_up,
        heading, score,
        created_at, expires_at
      FROM police_markers
      WHERE expires_at > NOW()
      ORDER BY score DESC, created_at DESC
      LIMIT 500
    `)

    res.setHeader('Cache-Control', 'public, s-maxage=120, stale-while-revalidate=60')
    return res.status(200).json({ markers: rows, count: rows.length })
  } catch (err) {
    console.error('[police/live] db error:', err)
    return res.status(500).json({ error: 'Failed to fetch markers' })
  } finally {
    await client.end().catch(() => undefined)
  }
}
