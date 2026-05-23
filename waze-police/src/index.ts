/**
 * Waze Police Ingestion Microservice — Entry Point
 *
 * Startup order:
 *   1. Validate config
 *   2. Wait for DB + Redis
 *   3. Run DB migrations (inline, no subprocess)
 *   4. Start HTTP server
 *   5. Start BullMQ scheduler + workers
 */

import 'dotenv/config';
import { readFileSync, readdirSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';
import { config } from './config/index.js';
import { logger } from './monitoring/metrics.js';
import { getPool, closePool, healthCheck as dbHealthCheck } from './db/client.js';
import { closeRedis, redisHealthCheck } from './cache/redis.client.js';
import { createApp, startServer } from './api/server.js';
import { startScheduler, stopScheduler } from './scheduler/index.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function waitForDeps(attempts = 15, delayMs = 3000): Promise<void> {
  for (let i = 1; i <= attempts; i++) {
    const [dbOk, redisOk] = await Promise.all([dbHealthCheck(), redisHealthCheck()]);

    if (dbOk && redisOk) {
      logger.info('Dependencies ready (DB + Redis)');
      return;
    }

    logger.warn(
      { attempt: i, max: attempts, db: dbOk, redis: redisOk },
      'Waiting for dependencies',
    );

    if (i < attempts) {
      await new Promise<void>((r) => setTimeout(r, delayMs));
    }
  }
  throw new Error('Dependencies not ready after all attempts — aborting startup');
}

async function applyMigrations(): Promise<void> {
  const pool = getPool();

  // Ensure tracking table exists
  await pool.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version    VARCHAR(50) PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  const migDir = path.resolve(__dirname, '../migrations');
  const files = readdirSync(migDir)
    .filter((f) => f.endsWith('.sql'))
    .sort();

  for (const file of files) {
    const version = file.replace('.sql', '');

    const existing = await pool.query<{ version: string }>(
      'SELECT version FROM schema_migrations WHERE version = $1',
      [version],
    );

    if (existing.rows.length > 0) {
      logger.debug({ version }, 'Migration already applied — skipping');
      continue;
    }

    logger.info({ version }, 'Applying migration');
    const sql = readFileSync(path.join(migDir, file), 'utf-8');

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(sql);
      await client.query(
        'INSERT INTO schema_migrations (version) VALUES ($1) ON CONFLICT DO NOTHING',
        [version],
      );
      await client.query('COMMIT');
      logger.info({ version }, 'Migration applied successfully');
    } catch (err) {
      await client.query('ROLLBACK');
      logger.error({ err, version }, 'Migration failed — rolled back');
      throw err;
    } finally {
      client.release();
    }
  }

  logger.info('All migrations verified');
}

async function main(): Promise<void> {
  logger.info({ version: '1.0.0', env: config.NODE_ENV }, 'Waze Police service starting');

  // 1. Wait for PostgreSQL + Redis
  await waitForDeps();

  // 2. Migrations
  logger.info('Running database migrations');
  await applyMigrations();

  // 3. HTTP server
  const app = createApp();
  await startServer(app);

  // 4. BullMQ scheduler + workers
  await startScheduler();

  logger.info('Waze Police service fully started');

  // ── Graceful shutdown ──────────────────────────────────────────────────────
  const shutdown = async (signal: string) => {
    logger.info({ signal }, 'Graceful shutdown initiated');
    try {
      await stopScheduler();
      await closePool();
      await closeRedis();
      logger.info('Shutdown complete');
      process.exit(0);
    } catch (err) {
      logger.error({ err }, 'Shutdown error');
      process.exit(1);
    }
  };

  process.once('SIGTERM', () => void shutdown('SIGTERM'));
  process.once('SIGINT', () => void shutdown('SIGINT'));

  process.on('uncaughtException', (err) => {
    logger.fatal({ err }, 'Uncaught exception');
    process.exit(1);
  });

  process.on('unhandledRejection', (reason) => {
    logger.fatal({ reason }, 'Unhandled promise rejection');
    process.exit(1);
  });
}

main().catch((err) => {
  console.error('Fatal startup error:', err);
  process.exit(1);
});
