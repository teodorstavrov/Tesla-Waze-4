import Redis from 'ioredis';
import { config } from '../config/index.js';
import { logger } from '../monitoring/metrics.js';
import type { WazeSession } from '../types/waze.js';

let _redis: Redis | null = null;

export function getRedis(): Redis {
  if (!_redis) {
    const isTLS = config.REDIS_URL.startsWith('rediss://');
    _redis = new Redis(config.REDIS_URL, {
      maxRetriesPerRequest: 3,
      enableReadyCheck: true,
      lazyConnect: false,
      // Upstash and other managed Redis use rediss:// (TLS) — trust their cert
      tls: isTLS ? { rejectUnauthorized: false } : undefined,
      retryStrategy(times) {
        if (times > 5) return null; // stop retrying
        return Math.min(times * 200, 2000);
      },
    });

    _redis.on('error', (err) => {
      logger.error({ err }, 'Redis client error');
    });

    _redis.on('connect', () => {
      logger.info('Redis connected');
    });

    _redis.on('ready', () => {
      logger.debug('Redis ready');
    });
  }
  return _redis;
}

export async function closeRedis(): Promise<void> {
  if (_redis) {
    await _redis.quit();
    _redis = null;
    logger.info('Redis connection closed');
  }
}

export async function redisHealthCheck(): Promise<boolean> {
  try {
    const redis = getRedis();
    const pong = await redis.ping();
    return pong === 'PONG';
  } catch (err) {
    logger.error({ err }, 'Redis health check failed');
    return false;
  }
}

// ── Session storage ──────────────────────────────────────────────────────────

const SESSION_KEY = 'waze:session';

export async function getSession(): Promise<WazeSession | null> {
  try {
    const redis = getRedis();
    const raw = await redis.get(SESSION_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as WazeSession;
  } catch (err) {
    logger.warn({ err }, 'Failed to read Waze session from Redis');
    return null;
  }
}

export async function saveSession(session: WazeSession): Promise<void> {
  try {
    const redis = getRedis();
    await redis.setex(SESSION_KEY, config.SESSION_TTL_SECONDS, JSON.stringify(session));
    logger.info(
      { strategy: session.strategy, capturedAt: session.capturedAt },
      'Waze session saved to Redis',
    );
  } catch (err) {
    // Redis is a cache — failure is non-fatal, continue without it
    logger.warn({ err }, 'Failed to save Waze session to Redis — continuing without cache');
  }
}

export async function invalidateSession(): Promise<void> {
  try {
    const redis = getRedis();
    await redis.del(SESSION_KEY);
    logger.info('Waze session invalidated');
  } catch (err) {
    logger.warn({ err }, 'Failed to invalidate session');
  }
}

// ── Generic cache helpers ────────────────────────────────────────────────────

export async function cacheGet<T>(key: string): Promise<T | null> {
  const raw = await getRedis().get(key);
  if (!raw) return null;
  return JSON.parse(raw) as T;
}

export async function cacheSet<T>(key: string, value: T, ttlSeconds: number): Promise<void> {
  await getRedis().setex(key, ttlSeconds, JSON.stringify(value));
}

export async function cacheDel(key: string): Promise<void> {
  await getRedis().del(key);
}
