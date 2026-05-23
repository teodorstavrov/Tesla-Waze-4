import { Worker, type Job } from 'bullmq';
import { getRedis } from '../cache/redis.client.js';
import { deleteExpiredMarkers } from '../db/repositories/marker.repository.js';
import { logger } from '../monitoring/metrics.js';
import { EXPIRE_QUEUE_NAME } from '../scheduler/queues.js';

export function createExpirationWorker(): Worker {
  const worker = new Worker(
    EXPIRE_QUEUE_NAME,
    async (job: Job) => {
      logger.debug({ job_id: job.id }, 'Expiration worker: job started');

      const startTime = Date.now();

      try {
        const deleted = await deleteExpiredMarkers();
        const elapsed = Date.now() - startTime;

        logger.info({ deleted, elapsed_ms: elapsed }, 'Expiration worker: sweep complete');
        return { deleted, elapsed_ms: elapsed };
      } catch (err) {
        logger.error({ err, job_id: job.id }, 'Expiration worker: job failed');
        throw err;
      }
    },
    {
      connection: getRedis(),
      concurrency: 1,
    },
  );

  worker.on('completed', (job, result) => {
    logger.debug({ job_id: job.id, result }, 'Expiration worker: job completed');
  });

  worker.on('failed', (job, err) => {
    logger.error({ job_id: job?.id, err }, 'Expiration worker: job failed event');
  });

  worker.on('error', (err) => {
    logger.error({ err }, 'Expiration worker: worker error');
  });

  logger.info('Expiration worker created');
  return worker;
}
