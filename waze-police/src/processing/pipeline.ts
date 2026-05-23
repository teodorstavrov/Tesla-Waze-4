/**
 * Ingestion pipeline: fetch → filter → normalize → persist.
 *
 * Orchestrates the full cycle for all Bulgaria tiles.
 */

import { WazeClient, type FetchStrategy } from '../ingestion/waze.client.js';
import { filterAndDedup } from './filter.js';
import { normalizeAlerts } from './normalize.js';
import { bulkUpsertMarkers, startIngestionRun, finishIngestionRun } from '../db/repositories/marker.repository.js';
import { getBulgariaTiles, formatTile } from '../geo/tiles.js';
import { logger, zeroCycleMetrics, logCycleComplete, type CycleMetrics } from '../monitoring/metrics.js';
import type { WazeAlert } from '../types/waze.js';

export async function runIngestionPipeline(): Promise<CycleMetrics> {
  const cycleStart = Date.now();
  const metrics = zeroCycleMetrics();
  const tiles = getBulgariaTiles();
  metrics.tilesAttempted = tiles.length;

  const runId = await startIngestionRun();
  const client = new WazeClient();

  logger.info({ tile_count: tiles.length }, 'Ingestion pipeline: starting');

  // ── Fetch all tiles ────────────────────────────────────────────────────────
  const allAlerts: WazeAlert[] = [];
  let dominantStrategy: FetchStrategy = 'http';

  try {
    // concurrency=1: tile 1 runs captureSession and fills _capturedResponses;
    // tiles 2-4 hit path-0 (reuse) and complete instantly without a new browser.
    const results = await client.fetchTiles(tiles, 1);

    for (let i = 0; i < results.length; i++) {
      const result = results[i]!;
      const tile = tiles[i]!;
      const alerts = result.response.alerts ?? [];

      logger.debug(
        { tile: formatTile(tile, i), alert_count: alerts.length, strategy: result.strategy },
        'Tile fetched',
      );

      metrics.tilesFetched++;
      metrics.rawCount += alerts.length;
      allAlerts.push(...alerts);

      if (result.strategy === 'playwright') {
        dominantStrategy = 'playwright';
      }
    }
  } catch (err) {
    logger.error({ err }, 'Ingestion pipeline: tile fetch error');
    metrics.errors++;
  }

  metrics.strategy = dominantStrategy;

  // ── Filter + deduplicate ───────────────────────────────────────────────────
  const policeAlerts = filterAndDedup(allAlerts);
  metrics.policeCount = policeAlerts.length;

  logger.info(
    { raw_count: metrics.rawCount, police_count: metrics.policeCount },
    'Ingestion pipeline: filtering complete',
  );

  // ── Normalize ──────────────────────────────────────────────────────────────
  const normalized = normalizeAlerts(policeAlerts);

  // ── Persist ────────────────────────────────────────────────────────────────
  if (normalized.length > 0) {
    try {
      const upsertStats = await bulkUpsertMarkers(normalized);
      metrics.inserted = upsertStats.inserted;
      metrics.updated = upsertStats.updated;
      metrics.skipped = upsertStats.skipped;
      metrics.errors += upsertStats.errors;
    } catch (err) {
      logger.error({ err }, 'Ingestion pipeline: bulk upsert failed');
      metrics.errors++;
    }
  }

  // ── Finalize ───────────────────────────────────────────────────────────────
  metrics.elapsedMs = Date.now() - cycleStart;
  logCycleComplete(metrics);

  await finishIngestionRun(runId, {
    started_at: new Date(cycleStart),
    strategy: metrics.strategy,
    tiles_fetched: metrics.tilesFetched,
    raw_count: metrics.rawCount,
    police_count: metrics.policeCount,
    inserted: metrics.inserted,
    updated: metrics.updated,
    skipped: metrics.skipped,
    errors: metrics.errors,
    elapsed_ms: metrics.elapsedMs,
    success: metrics.errors === 0,
  }).catch((err) => logger.warn({ err }, 'Failed to save ingestion run'));

  return metrics;
}
