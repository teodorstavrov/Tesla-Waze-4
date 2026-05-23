/**
 * Standalone migration runner.
 * Run via: npm run migrate
 */

import { readFileSync, readdirSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';
import 'dotenv/config';
import { getPool, closePool } from './client.js';
import { logger } from '../monitoring/metrics.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function runMigrations(): Promise<void> {
  const pool = getPool();
  logger.info('Starting database migrations');

  // Ensure schema_migrations table exists first
  await pool.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version     VARCHAR(50)  PRIMARY KEY,
      applied_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
    )
  `);

  const migrationsDir = path.resolve(__dirname, '../../migrations');
  const files = readdirSync(migrationsDir)
    .filter((f) => f.endsWith('.sql'))
    .sort();

  for (const file of files) {
    const version = file.replace('.sql', '');

    const existing = await pool.query<{ version: string }>(
      'SELECT version FROM schema_migrations WHERE version = $1',
      [version],
    );

    if (existing.rows.length > 0) {
      logger.info({ version }, 'Migration already applied — skipping');
      continue;
    }

    logger.info({ version, file }, 'Applying migration');

    const sql = readFileSync(path.join(migrationsDir, file), 'utf-8');
    const client = await pool.connect();

    try {
      await client.query('BEGIN');
      await client.query(sql);
      await client.query(
        'INSERT INTO schema_migrations (version) VALUES ($1) ON CONFLICT (version) DO NOTHING',
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

  logger.info('All migrations complete');
}

runMigrations()
  .then(() => closePool())
  .catch((err) => {
    logger.error({ err }, 'Migration fatal error');
    process.exit(1);
  });
