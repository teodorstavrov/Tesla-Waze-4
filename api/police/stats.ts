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

    const [totalRes, lastRunRes, subtypesRes, runsRes] = await Promise.all([
      client.query<{ count: string }>(
        `SELECT COUNT(*) AS count FROM police_markers WHERE expires_at > NOW()`,
      ),
      client.query(
        `SELECT started_at, finished_at, strategy, inserted, updated, skipped, elapsed_ms, success
         FROM ingestion_runs ORDER BY started_at DESC LIMIT 1`,
      ),
      client.query<{ subtype: string; count: string }>(
        `SELECT COALESCE(subtype, 'GENERIC') AS subtype, COUNT(*) AS count
         FROM police_markers WHERE expires_at > NOW() GROUP BY subtype`,
      ),
      client.query<{ count: string }>(
        `SELECT COUNT(*) AS count FROM ingestion_runs
         WHERE started_at > NOW() - INTERVAL '24 hours'`,
      ),
    ])

    const subtypes: Record<string, number> = {}
    for (const row of subtypesRes.rows) {
      subtypes[row.subtype] = parseInt(row.count, 10)
    }

    return res.status(200).json({
      total_active: parseInt(totalRes.rows[0]?.count ?? '0', 10),
      runs_last_24h: parseInt(runsRes.rows[0]?.count ?? '0', 10),
      subtypes,
      last_run: lastRunRes.rows[0] ?? null,
    })
  } catch (err) {
    console.error('[police/stats] db error:', err)
    return res.status(500).json({ error: 'Failed to fetch stats' })
  } finally {
    await client.end().catch(() => undefined)
  }
}
