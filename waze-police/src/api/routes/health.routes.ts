import { Router, type Request, type Response } from 'express';
import { healthCheck as dbHealthCheck } from '../../db/client.js';
import { redisHealthCheck } from '../../cache/redis.client.js';
import { logger } from '../../monitoring/metrics.js';

export const healthRouter = Router();

// ── GET /health ──────────────────────────────────────────────────────────────

healthRouter.get('/', async (_req: Request, res: Response) => {
  const start = Date.now();

  const [dbOk, redisOk] = await Promise.all([dbHealthCheck(), redisHealthCheck()]);

  const elapsed = Date.now() - start;
  const allOk = dbOk && redisOk;

  const body = {
    status: allOk ? 'ok' : 'degraded',
    checks: {
      database: dbOk ? 'ok' : 'error',
      redis: redisOk ? 'ok' : 'error',
    },
    elapsed_ms: elapsed,
    timestamp: new Date().toISOString(),
  };

  if (!allOk) {
    logger.warn({ checks: body.checks }, 'Health check: degraded');
  }

  res.status(allOk ? 200 : 503).json(body);
});

// ── GET /health/live (Kubernetes liveness probe — always 200) ────────────────

healthRouter.get('/live', (_req: Request, res: Response) => {
  res.status(200).json({ status: 'alive', timestamp: new Date().toISOString() });
});

// ── GET /health/ready (Kubernetes readiness probe) ───────────────────────────

healthRouter.get('/ready', async (_req: Request, res: Response) => {
  const [dbOk, redisOk] = await Promise.all([dbHealthCheck(), redisHealthCheck()]);
  const ready = dbOk && redisOk;

  res.status(ready ? 200 : 503).json({
    status: ready ? 'ready' : 'not_ready',
    database: dbOk,
    redis: redisOk,
    timestamp: new Date().toISOString(),
  });
});
