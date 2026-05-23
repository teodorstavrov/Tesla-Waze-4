import { Router, type Request, type Response, type NextFunction } from 'express';
import { getStats } from '../../db/repositories/marker.repository.js';
import { logger } from '../../monitoring/metrics.js';

export const statsRouter = Router();

// ── GET /stats ───────────────────────────────────────────────────────────────

statsRouter.get('/', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const stats = await getStats();
    res.json(stats);
  } catch (err) {
    logger.error({ err }, 'Stats route error');
    next(err);
  }
});
