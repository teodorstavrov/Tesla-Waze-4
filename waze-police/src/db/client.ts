import pg from 'pg';
import { config } from '../config/index.js';
import { logger } from '../monitoring/metrics.js';

const { Pool } = pg;

let _pool: pg.Pool | null = null;

export function getPool(): pg.Pool {
  if (!_pool) {
    _pool = new Pool({
      connectionString: config.DATABASE_URL,
      max: 10,
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 5_000,
    });

    _pool.on('error', (err) => {
      logger.error({ err }, 'PostgreSQL pool error');
    });

    _pool.on('connect', () => {
      logger.debug('PostgreSQL: new client connected');
    });
  }
  return _pool;
}

export async function closePool(): Promise<void> {
  if (_pool) {
    await _pool.end();
    _pool = null;
    logger.info('PostgreSQL pool closed');
  }
}

export async function healthCheck(): Promise<boolean> {
  try {
    const pool = getPool();
    const res = await pool.query('SELECT 1 AS ok');
    return res.rows[0]?.ok === 1;
  } catch (err) {
    logger.error({ err }, 'PostgreSQL health check failed');
    return false;
  }
}

// Convenience wrapper
export async function query<T extends pg.QueryResultRow = pg.QueryResultRow>(
  sql: string,
  params?: unknown[],
): Promise<pg.QueryResult<T>> {
  const pool = getPool();
  return pool.query<T>(sql, params);
}
