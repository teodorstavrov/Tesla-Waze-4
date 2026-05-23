import { setupRepeatableJobs, getIngestQueue, closeQueues } from './queues.js';
import { createIngestionWorker } from '../workers/ingestion.worker.js';
import { createExpirationWorker } from '../workers/expiration.worker.js';
import { logger } from '../monitoring/metrics.js';
import type { Worker } from 'bullmq';

let _ingestionWorker: Worker | null = null;
let _expirationWorker: Worker | null = null;

export async function startScheduler(): Promise<void> {
  logger.info('Scheduler: initializing');

  // Register repeatable jobs
  await setupRepeatableJobs();

  // Start workers
  _ingestionWorker = createIngestionWorker();
  _expirationWorker = createExpirationWorker();

  logger.info('Scheduler: workers running');

  // Trigger an immediate first run on startup
  await triggerImmediateIngestion();
}

export async function triggerImmediateIngestion(): Promise<void> {
  const queue = getIngestQueue();
  const job = await queue.add('ingest-police-immediate', {}, {
    attempts: 3,
    backoff: { type: 'exponential', delay: 10_000 },
  });
  logger.info({ job_id: job.id }, 'Scheduler: triggered immediate ingestion on startup');
}

export async function stopScheduler(): Promise<void> {
  logger.info('Scheduler: shutting down');

  if (_ingestionWorker) {
    await _ingestionWorker.close();
    _ingestionWorker = null;
  }

  if (_expirationWorker) {
    await _expirationWorker.close();
    _expirationWorker = null;
  }

  await closeQueues();
  logger.info('Scheduler: shut down complete');
}
