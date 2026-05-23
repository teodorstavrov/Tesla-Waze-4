import express, { type Application, type Request, type Response } from 'express';
import { config } from '../config/index.js';
import { logger } from '../monitoring/metrics.js';
import { policeRouter } from './routes/police.routes.js';
import { statsRouter } from './routes/stats.routes.js';
import { healthRouter } from './routes/health.routes.js';
import { notFoundHandler, globalErrorHandler } from './middleware/error.js';

export function createApp(): Application {
  const app = express();

  // ── Middleware ─────────────────────────────────────────────────────────────
  app.use(express.json({ limit: '1mb' }));
  app.use(express.urlencoded({ extended: false }));

  // Request logging (lightweight — no morgan dep)
  app.use((req, res, next) => {
    const start = Date.now();
    res.on('finish', () => {
      const duration = Date.now() - start;
      if (req.path !== '/health' && req.path !== '/health/live') {
        logger.info(
          {
            method: req.method,
            path: req.path,
            status: res.statusCode,
            duration_ms: duration,
            ip: req.ip,
          },
          'HTTP request',
        );
      }
    });
    next();
  });

  // Security headers
  app.use((_req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('X-XSS-Protection', '1; mode=block');
    next();
  });

  // CORS — allow all origins (consumed by Tesradar's backend, not a browser)
  app.use((_req, res, next) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    next();
  });

  // ── Routes ─────────────────────────────────────────────────────────────────
  app.use('/health', healthRouter);
  app.use('/police', policeRouter);
  app.use('/stats', statsRouter);

  // Root info
  app.get('/', (_req: Request, res: Response) => {
    res.json({
      service: 'waze-police',
      version: '1.0.0',
      endpoints: [
        'GET /health',
        'GET /health/live',
        'GET /health/ready',
        'GET /police/live?bbox=lat1,lng1,lat2,lng2&min_score=0&limit=500',
        'GET /police/bounds?country=BG',
        'GET /stats',
      ],
    });
  });

  // ── Error handling ─────────────────────────────────────────────────────────
  app.use(notFoundHandler);
  app.use(globalErrorHandler);

  return app;
}

export function startServer(app: Application): Promise<void> {
  return new Promise((resolve) => {
    const server = app.listen(config.PORT, () => {
      logger.info({ port: config.PORT, env: config.NODE_ENV }, 'HTTP server listening');
      resolve();
    });

    // Graceful shutdown
    const shutdown = async (signal: string) => {
      logger.info({ signal }, 'Shutdown signal received');
      server.close(() => {
        logger.info('HTTP server closed');
      });
    };

    process.once('SIGTERM', () => shutdown('SIGTERM'));
    process.once('SIGINT', () => shutdown('SIGINT'));
  });
}
