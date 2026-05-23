import 'dotenv/config';
import { z } from 'zod';

const ConfigSchema = z.object({
  // Server
  PORT: z.coerce.number().default(3001),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('production'),

  // Database
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),

  // Redis
  REDIS_URL: z.string().min(1, 'REDIS_URL is required'),

  // Waze API
  WAZE_PRIMARY_URL: z.string().url().default('https://www.waze.com/live-map/api/georss'),
  WAZE_FALLBACK_URL: z.string().url().default('https://www.waze.com/row-georss.ashx'),
  WAZE_REQUEST_TIMEOUT_MS: z.coerce.number().default(15000),
  WAZE_MAX_RETRIES: z.coerce.number().default(3),

  // Bulgaria bounding box
  BG_BBOX_MIN_LAT: z.coerce.number().default(41.235),
  BG_BBOX_MAX_LAT: z.coerce.number().default(44.215),
  BG_BBOX_MIN_LNG: z.coerce.number().default(22.360),
  BG_BBOX_MAX_LNG: z.coerce.number().default(28.609),
  BG_TILE_GRID: z.coerce.number().int().min(1).max(10).default(2),

  // Marker lifecycle
  MARKER_TTL_MINUTES: z.coerce.number().default(90),

  // BullMQ intervals
  INGEST_INTERVAL_MS: z.coerce.number().default(7_200_000),
  EXPIRE_INTERVAL_MS: z.coerce.number().default(900_000),

  // Session
  SESSION_TTL_SECONDS: z.coerce.number().default(14400),

  // Playwright
  PLAYWRIGHT_HEADLESS: z.string().transform((v) => v !== 'false').default('true'),

  // Logging
  LOG_LEVEL: z.enum(['trace', 'debug', 'info', 'warn', 'error', 'fatal']).default('info'),
  LOG_PRETTY: z.string().transform((v) => v === 'true').default('false'),

  // API security
  API_SECRET: z.string().default('change_me_in_production'),
});

export type AppConfig = z.infer<typeof ConfigSchema>;

function loadConfig(): AppConfig {
  const result = ConfigSchema.safeParse(process.env);
  if (!result.success) {
    const issues = result.error.issues
      .map((i) => `  ${i.path.join('.')}: ${i.message}`)
      .join('\n');
    throw new Error(`Invalid configuration:\n${issues}`);
  }
  return result.data;
}

export const config = loadConfig();
