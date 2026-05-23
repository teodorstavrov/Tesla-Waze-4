import pino from 'pino';

// Bootstrap logger before config to avoid circular deps
// Config is not imported here intentionally — use env directly
const isPretty = process.env['LOG_PRETTY'] === 'true';
const level = (process.env['LOG_LEVEL'] as pino.Level | undefined) ?? 'info';

export const logger = pino({
  level,
  transport: isPretty
    ? {
        target: 'pino-pretty',
        options: {
          colorize: true,
          translateTime: 'SYS:standard',
          ignore: 'pid,hostname',
        },
      }
    : undefined,
  base: { service: 'waze-police' },
  timestamp: pino.stdTimeFunctions.isoTime,
});

// ── In-memory metrics (lightweight, no Prometheus dep) ─────────────────────

export interface CycleMetrics {
  tilesAttempted: number;
  tilesFetched: number;
  rawCount: number;
  policeCount: number;
  inserted: number;
  updated: number;
  skipped: number;
  errors: number;
  elapsedMs: number;
  strategy: 'http' | 'playwright' | 'unknown';
}

export function zeroCycleMetrics(): CycleMetrics {
  return {
    tilesAttempted: 0,
    tilesFetched: 0,
    rawCount: 0,
    policeCount: 0,
    inserted: 0,
    updated: 0,
    skipped: 0,
    errors: 0,
    elapsedMs: 0,
    strategy: 'unknown',
  };
}

export function logCycleComplete(metrics: CycleMetrics): void {
  logger.info(
    {
      tiles_fetched: metrics.tilesFetched,
      raw_count: metrics.rawCount,
      police_count: metrics.policeCount,
      inserted: metrics.inserted,
      updated: metrics.updated,
      skipped: metrics.skipped,
      errors: metrics.errors,
      elapsed_ms: metrics.elapsedMs,
      strategy: metrics.strategy,
    },
    'Ingestion cycle complete',
  );
}
