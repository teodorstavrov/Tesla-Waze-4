/**
 * One-shot ingestion entry point for GitHub Actions.
 * Runs the full pipeline once, logs results, then exits cleanly.
 *
 * Usage: npm run ingest
 */

import 'dotenv/config';
import { runIngestionPipeline } from '../processing/pipeline.js';
import { deleteExpiredMarkers } from '../db/repositories/marker.repository.js';
import { closePool } from '../db/client.js';
import { closeRedis } from '../cache/redis.client.js';
import { logger } from '../monitoring/metrics.js';

async function main(): Promise<void> {
  logger.info('run-once: starting');

  try {
    const expired = await deleteExpiredMarkers();
    logger.info({ expired }, 'run-once: expired markers deleted');

    const metrics = await runIngestionPipeline();

    logger.info(
      {
        inserted: metrics.inserted,
        updated: metrics.updated,
        police: metrics.policeCount,
        elapsed_ms: metrics.elapsedMs,
        strategy: metrics.strategy,
      },
      'run-once: done',
    );

    process.exitCode = metrics.errors > 0 ? 1 : 0;
  } catch (err) {
    logger.error({ err }, 'run-once: fatal error');
    process.exitCode = 1;
  } finally {
    await closePool();
    await closeRedis();
  }
}

main();
