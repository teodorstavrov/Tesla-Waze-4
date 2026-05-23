import { Worker, type Job } from 'bullmq';
import { getRedis } from '../cache/redis.client.js';
import { runIngestionPipeline } from '../processing/pipeline.js';
import { logger } from '../monitoring/metrics.js';
import { INGEST_QUEUE_NAME } from '../scheduler/queues.js';

export function createIngestionWorker(): Worker {
  const worker = new Worker(
    INGEST_QUEUE_NAME,
    async (job: Job) => {
      logger.info({ job_id: job.id, job_name: job.name }, 'Ingestion worker: job started');

      const startTime = Date.now();

      try {
        const metrics = await runIngestionPipeline();

        const result = {
          tiles_fetched: metrics.tilesFetched,
          police_count: metrics.policeCount,
          inserted: metrics.inserted,
          updated: metrics.updated,
          skipped: metrics.skipped,
          errors: metrics.errors,
          elapsed_ms: metrics.elapsedMs,
          strategy: metrics.strategy,
        };

        logger.info({ job_id: job.id, ...result }, 'Ingestion worker: job completed');
        return result;
      } catch (err) {
        logger.error({ err, job_id: job.id }, 'Ingestion worker: job failed');
        throw err;
      }
    },
    {
      connection: getRedis(),
      concurrency: 1, // only one ingestion at a time
      limiter: {
        max: 1,
        duration: 60_000, // at most 1 job per minute
      },
    },
  );

  worker.on('completed', (job, result) => {
    logger.info({ job_id: job.id, result }, 'Ingestion worker: job completed event');
  });

  worker.on('failed', (job, err) => {
    logger.error({ job_id: job?.id, err }, 'Ingestion worker: job failed event');
  });

  worker.on('error', (err) => {
    logger.error({ err }, 'Ingestion worker: worker error');
  });

  worker.on('stalled', (jobId) => {
    logger.warn({ job_id: jobId }, 'Ingestion worker: job stalled');
  });

  logger.info('Ingestion worker created');
  return worker;
}
