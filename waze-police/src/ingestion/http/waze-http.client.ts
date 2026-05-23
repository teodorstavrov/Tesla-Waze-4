import axios, { type AxiosInstance, type AxiosError } from 'axios';
import { config } from '../../config/index.js';
import { logger } from '../../monitoring/metrics.js';
import { WazeResponseSchema, type WazeResponse } from '../../types/waze.js';
import type { BoundingBox, WazeSession } from '../../types/waze.js';
import { buildHeaders } from './session-manager.js';

export class WazeHttpClient {
  private readonly axios: AxiosInstance;

  constructor() {
    this.axios = axios.create({
      timeout: config.WAZE_REQUEST_TIMEOUT_MS,
      validateStatus: (status) => status < 500, // don't throw on 4xx
      decompress: true,
    });
  }

  /**
   * Fetch alerts for a tile bounding box.
   * Returns null if the response signals we need a fresh session (403, empty).
   * Throws on hard errors (network, 5xx).
   */
  async fetchTile(
    bbox: BoundingBox,
    session: WazeSession | null,
    useFallback = false,
  ): Promise<WazeResponse | null> {
    const url = useFallback ? config.WAZE_FALLBACK_URL : config.WAZE_PRIMARY_URL;
    const headers = buildHeaders(session);

    const params = {
      top: bbox.top,
      bottom: bbox.bottom,
      left: bbox.left,
      right: bbox.right,
      env: 'row',
      types: 'alerts',
    };

    let attempt = 0;
    let lastErr: Error | null = null;

    while (attempt < config.WAZE_MAX_RETRIES) {
      attempt++;
      try {
        const res = await this.axios.get<unknown>(url, { headers, params });

        if (res.status === 403 || res.status === 401) {
          logger.warn(
            { status: res.status, attempt, url },
            'Waze HTTP: auth failure — session needs refresh',
          );
          return null; // signal: need Playwright
        }

        if (res.status !== 200) {
          logger.warn({ status: res.status, attempt, url }, 'Waze HTTP: non-200 response');
          lastErr = new Error(`HTTP ${res.status}`);
          await sleep(attempt * 500);
          continue;
        }

        const parsed = WazeResponseSchema.safeParse(res.data);
        if (!parsed.success) {
          logger.warn(
            { issues: parsed.error.issues.slice(0, 5), attempt },
            'Waze HTTP: response parse error',
          );
          return { alerts: [] };
        }

        const alertCount = parsed.data.alerts?.length ?? 0;
        logger.debug(
          { url, alertCount, bbox: formatBbox(bbox) },
          'Waze HTTP: tile fetched',
        );

        return parsed.data;
      } catch (err) {
        const axErr = err as AxiosError;
        const code = axErr.code ?? 'UNKNOWN';
        logger.warn({ code, attempt, url }, `Waze HTTP: request error (${code})`);
        lastErr = axErr;
        await sleep(attempt * 800);
      }
    }

    logger.error({ url, attempts: attempt, err: lastErr }, 'Waze HTTP: all retries exhausted');
    throw lastErr ?? new Error('Waze HTTP request failed');
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function formatBbox(b: BoundingBox): string {
  return `(${b.bottom.toFixed(2)},${b.left.toFixed(2)})→(${b.top.toFixed(2)},${b.right.toFixed(2)})`;
}
