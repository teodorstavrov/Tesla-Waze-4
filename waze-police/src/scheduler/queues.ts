import { Queue } from 'bullmq';
import { getRedis } from '../cache/redis.client.js';
import { config } from '../config/index.js';
import { logger } from '../monitoring/metrics.js';

export const INGEST_QUEUE_NAME = 'waze-ingest-police';
export const EXPIRE_QUEUE_NAME = 'waze-expire-markers';

// Singleton queues
let _ingestQueue: Queue | null = null;
let _expireQueue: Queue | null = null;

export function getIngestQueue(): Queue {
  if (!_ingestQueue) {
    _ingestQueue = new Queue(INGEST_QUEUE_NAME, {
      connection: getRedis(),
      defaultJobOptions: {
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 10_000, // 10s, 20s, 40s
        },
        removeOnComplete: { count: 50 },
        removeOnFail: { count: 100 },
      },
    });
  }
  return _ingestQueue;
}

export function getExpireQueue(): Queue {
  if (!_expireQueue) {
    _expireQueue = new Queue(EXPIRE_QUEUE_NAME, {
      connection: getRedis(),
      defaultJobOptions: {
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 5_000,
        },
        removeOnComplete: { count: 20 },
        removeOnFail: { count: 50 },
      },
    });
  }
  return _expireQueue;
}

/**
 * Register repeatable jobs if not already present.
 */
export async function setupRepeatableJobs(): Promise<void> {
  const ingestQueue = getIngestQueue();
  const expireQueue = getExpireQueue();

  // Remove old repeatable jobs to avoid duplicates on restart
  const ingestRepeatables = await ingestQueue.getRepeatableJobs();
  for (const job of ingestRepeatables) {
    await ingestQueue.removeRepeatableByKey(job.key);
    logger.debug({ key: job.key }, 'Removed old ingest repeatable');
  }

  const expireRepeatables = await expireQueue.getRepeatableJobs();
  for (const job of expireRepeatables) {
    await expireQueue.removeRepeatableByKey(job.key);
    logger.debug({ key: job.key }, 'Removed old expire repeatable');
  }

  // Register fresh repeatable jobs
  await ingestQueue.add(
    'ingest-police',
    {},
    {
      repeat: { every: config.INGEST_INTERVAL_MS },
      jobId: 'ingest-police-repeatable',
    },
  );
  logger.info({ interval_ms: config.INGEST_INTERVAL_MS }, 'Registered ingest-police repeatable job');

  await expireQueue.add(
    'expire-markers',
    {},
    {
      repeat: { every: config.EXPIRE_INTERVAL_MS },
      jobId: 'expire-markers-repeatable',
    },
  );
  logger.info({ interval_ms: config.EXPIRE_INTERVAL_MS }, 'Registered expire-markers repeatable job');
}

export async function closeQueues(): Promise<void> {
  if (_ingestQueue) {
    await _ingestQueue.close();
    _ingestQueue = null;
  }
  if (_expireQueue) {
    await _expireQueue.close();
    _expireQueue = null;
  }
  logger.info('Queues closed');
}
