import type { PoliceMarker, PoliceMarkerInsert, UpsertResult, IngestionRun, IngestionStats } from '../../types/marker.js';
import { getPool } from '../client.js';
import { logger } from '../../monitoring/metrics.js';

// ── Upsert logic ─────────────────────────────────────────────────────────────
// Strategy:
//   1. Try to find an existing active marker within 50m (PostGIS ST_DWithin)
//   2. If found and < 90 min old → UPDATE (bump score/thumbs_up/updated_at)
//   3. Otherwise INSERT

export async function upsertMarker(marker: PoliceMarkerInsert): Promise<UpsertResult> {
  const pool = getPool();
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // Look for a nearby active marker with the same waze_uuid first (fastest path)
    const exactMatch = await client.query<{ id: string; thumbs_up: number }>(
      `SELECT id, thumbs_up FROM police_markers
       WHERE waze_uuid = $1 AND expires_at > NOW()
       LIMIT 1`,
      [marker.waze_uuid],
    );

    if (exactMatch.rows.length > 0) {
      const existing = exactMatch.rows[0]!;
      const newThumbs = Math.max(existing.thumbs_up, marker.thumbs_up);

      await client.query(
        `UPDATE police_markers
         SET thumbs_up        = $1,
             score            = $2,
             reliability      = $3,
             confidence       = $4,
             report_age_seconds = $5,
             updated_at       = NOW(),
             ingested_at      = NOW()
         WHERE id = $6`,
        [
          newThumbs,
          marker.score,
          marker.reliability,
          marker.confidence,
          marker.report_age_seconds,
          existing.id,
        ],
      );

      await client.query('COMMIT');
      return { action: 'updated', id: existing.id };
    }

    // Spatial dedup: find any active marker within 50 m
    const spatialMatch = await client.query<{ id: string; thumbs_up: number }>(
      `SELECT id, thumbs_up FROM police_markers
       WHERE expires_at > NOW()
         AND ST_DWithin(
               geom,
               ST_SetSRID(ST_Point($1, $2), 4326)::geography,
               50
             )
       ORDER BY score DESC
       LIMIT 1`,
      [marker.longitude, marker.latitude],
    );

    if (spatialMatch.rows.length > 0) {
      const existing = spatialMatch.rows[0]!;
      const newThumbs = Math.max(existing.thumbs_up, marker.thumbs_up);

      await client.query(
        `UPDATE police_markers
         SET waze_uuid        = $1,
             thumbs_up        = $2,
             score            = $3,
             reliability      = $4,
             confidence       = $5,
             report_age_seconds = $6,
             updated_at       = NOW(),
             ingested_at      = NOW()
         WHERE id = $7`,
        [
          marker.waze_uuid,
          newThumbs,
          marker.score,
          marker.reliability,
          marker.confidence,
          marker.report_age_seconds,
          existing.id,
        ],
      );

      await client.query('COMMIT');
      return { action: 'updated', id: existing.id };
    }

    // Fresh INSERT
    const insertResult = await client.query<{ id: string }>(
      `INSERT INTO police_markers (
         waze_uuid, source, type, subtype,
         geom, latitude, longitude,
         road_name, city, country,
         confidence, reliability, thumbs_up,
         heading, road_type, report_age_seconds,
         score, raw_payload,
         created_at, expires_at, ingested_at, updated_at
       ) VALUES (
         $1, $2, $3, $4,
         ST_SetSRID(ST_Point($5, $6), 4326),
         $6, $5,
         $7, $8, $9,
         $10, $11, $12,
         $13, $14, $15,
         $16, $17,
         $18, $19, $18, $18
       )
       RETURNING id`,
      [
        marker.waze_uuid,               // $1
        marker.source,                   // $2
        marker.type,                     // $3
        marker.subtype,                  // $4
        marker.longitude,                // $5 (ST_Point x)
        marker.latitude,                 // $6 (ST_Point y)
        marker.road_name,               // $7
        marker.city,                    // $8
        marker.country,                 // $9
        marker.confidence,              // $10
        marker.reliability,             // $11
        marker.thumbs_up,              // $12
        marker.heading,                 // $13
        marker.road_type,              // $14
        marker.report_age_seconds,     // $15
        marker.score,                   // $16
        JSON.stringify(marker.raw_payload), // $17
        marker.created_at.toISOString(), // $18
        marker.expires_at.toISOString(), // $19
      ],
    );

    await client.query('COMMIT');

    const newId = insertResult.rows[0]?.id;
    if (!newId) throw new Error('INSERT returned no id');
    return { action: 'inserted', id: newId };
  } catch (err) {
    await client.query('ROLLBACK');
    logger.error({ err, waze_uuid: marker.waze_uuid }, 'upsertMarker failed');
    throw err;
  } finally {
    client.release();
  }
}

// ── Bulk upsert ──────────────────────────────────────────────────────────────

export interface BulkUpsertStats {
  inserted: number;
  updated: number;
  skipped: number;
  errors: number;
}

export async function bulkUpsertMarkers(
  markers: PoliceMarkerInsert[],
): Promise<BulkUpsertStats> {
  const stats: BulkUpsertStats = { inserted: 0, updated: 0, skipped: 0, errors: 0 };

  for (const marker of markers) {
    try {
      const result = await upsertMarker(marker);
      if (result.action === 'inserted') {
        stats.inserted++;
      } else if (result.action === 'updated') {
        stats.updated++;
      } else {
        stats.skipped++;
      }
    } catch (err) {
      stats.errors++;
      logger.warn({ err, waze_uuid: marker.waze_uuid }, 'Marker upsert error — skipping');
    }
  }

  return stats;
}

// ── Queries ──────────────────────────────────────────────────────────────────

export interface LiveQueryParams {
  minLat?: number;
  minLng?: number;
  maxLat?: number;
  maxLng?: number;
  minScore?: number;
  limit?: number;
}

export async function getLiveMarkers(params: LiveQueryParams): Promise<PoliceMarker[]> {
  const {
    minLat,
    minLng,
    maxLat,
    maxLng,
    minScore = 0,
    limit = 500,
  } = params;

  const conditions: string[] = ['expires_at > NOW()'];
  const values: unknown[] = [];
  let idx = 1;

  if (
    minLat !== undefined &&
    minLng !== undefined &&
    maxLat !== undefined &&
    maxLng !== undefined
  ) {
    conditions.push(
      `ST_Intersects(
         geom,
         ST_MakeEnvelope($${idx}, $${idx + 1}, $${idx + 2}, $${idx + 3}, 4326)
       )`,
    );
    values.push(minLng, minLat, maxLng, maxLat);
    idx += 4;
  }

  if (minScore > 0) {
    conditions.push(`score >= $${idx}`);
    values.push(minScore);
    idx++;
  }

  values.push(Math.min(limit, 1000));
  const limitIdx = idx;

  const sql = `
    SELECT
      id, waze_uuid, source, type, subtype,
      latitude, longitude, road_name, city, country,
      confidence, reliability, thumbs_up,
      heading, road_type, report_age_seconds,
      score, raw_payload,
      created_at, expires_at, ingested_at, updated_at
    FROM police_markers
    WHERE ${conditions.join(' AND ')}
    ORDER BY score DESC, created_at DESC
    LIMIT $${limitIdx}
  `;

  const result = await getPool().query<PoliceMarker>(sql, values);
  return result.rows;
}

// ── Expiration sweep ─────────────────────────────────────────────────────────

export async function deleteExpiredMarkers(): Promise<number> {
  const result = await getPool().query(
    `DELETE FROM police_markers WHERE expires_at < NOW() RETURNING id`,
  );
  return result.rowCount ?? 0;
}

// ── Ingestion run logging ────────────────────────────────────────────────────

export async function startIngestionRun(): Promise<number> {
  const result = await getPool().query<{ id: number }>(
    `INSERT INTO ingestion_runs (started_at) VALUES (NOW()) RETURNING id`,
  );
  return result.rows[0]!.id;
}

export async function finishIngestionRun(
  runId: number,
  data: Omit<IngestionRun, 'id' | 'started_at'>,
): Promise<void> {
  await getPool().query(
    `UPDATE ingestion_runs
     SET finished_at   = NOW(),
         strategy      = $1,
         tiles_fetched = $2,
         raw_count     = $3,
         police_count  = $4,
         inserted      = $5,
         updated       = $6,
         skipped       = $7,
         errors        = $8,
         elapsed_ms    = $9,
         success       = $10
     WHERE id = $11`,
    [
      data.strategy ?? null,
      data.tiles_fetched,
      data.raw_count,
      data.police_count,
      data.inserted,
      data.updated,
      data.skipped,
      data.errors,
      data.elapsed_ms ?? null,
      data.success,
      runId,
    ],
  );
}

// ── Stats ────────────────────────────────────────────────────────────────────

export async function getStats(): Promise<IngestionStats> {
  const pool = getPool();

  const [totalRes, lastRunRes, subtypesRes, avgScoreRes, runsRes] = await Promise.all([
    pool.query<{ count: string }>(`SELECT COUNT(*) AS count FROM police_markers WHERE expires_at > NOW()`),
    pool.query<{
      started_at: Date;
      finished_at: Date | null;
      strategy: string | null;
      inserted: number;
      updated: number;
      skipped: number;
      elapsed_ms: number | null;
      success: boolean;
    }>(`SELECT started_at, finished_at, strategy, inserted, updated, skipped, elapsed_ms, success
        FROM ingestion_runs
        ORDER BY started_at DESC
        LIMIT 1`),
    pool.query<{ subtype: string; count: string }>(
      `SELECT COALESCE(subtype, '') AS subtype, COUNT(*) AS count
       FROM police_markers
       WHERE expires_at > NOW()
       GROUP BY subtype`,
    ),
    pool.query<{ avg: string }>(`SELECT AVG(score)::numeric(5,2) AS avg FROM police_markers WHERE expires_at > NOW()`),
    pool.query<{ count: string }>(
      `SELECT COUNT(*) AS count FROM ingestion_runs WHERE started_at > NOW() - INTERVAL '24 hours'`,
    ),
  ]);

  const subtypes: Record<string, number> = {};
  for (const row of subtypesRes.rows) {
    subtypes[row.subtype || 'GENERIC'] = parseInt(row.count, 10);
  }

  const lastRun = lastRunRes.rows[0] ?? null;

  return {
    total_active: parseInt(totalRes.rows[0]?.count ?? '0', 10),
    last_run: lastRun
      ? {
          started_at: lastRun.started_at.toISOString(),
          finished_at: lastRun.finished_at?.toISOString() ?? null,
          strategy: lastRun.strategy,
          inserted: lastRun.inserted,
          updated: lastRun.updated,
          skipped: lastRun.skipped,
          elapsed_ms: lastRun.elapsed_ms,
          success: lastRun.success,
        }
      : null,
    subtypes,
    avg_score: parseFloat(avgScoreRes.rows[0]?.avg ?? '0'),
    runs_last_24h: parseInt(runsRes.rows[0]?.count ?? '0', 10),
  };
}
