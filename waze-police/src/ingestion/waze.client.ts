/**
 * Unified Waze client.
 *
 * Orchestrates:
 *   1. HTTP fetch with cached session (fast path)
 *   2. On 403 / null response: Playwright session capture + retry
 *   3. On Playwright failure: Playwright direct tile fetch (slowest path)
 */

import { WazeHttpClient } from './http/waze-http.client.js';
import { WazePlaywrightClient } from './browser/waze-playwright.client.js';
import {
  getCurrentSession,
  invalidateCachedSession,
  isSessionFresh,
} from './http/session-manager.js';
import { WazeResponseSchema, type WazeResponse, type WazeSession } from '../types/waze.js';
import type { BoundingBox } from '../types/waze.js';
import { logger } from '../monitoring/metrics.js';

export type FetchStrategy = 'http' | 'playwright';

export interface TileFetchResult {
  response: WazeResponse;
  strategy: FetchStrategy;
}

export class WazeClient {
  private readonly http: WazeHttpClient;
  private readonly playwright: WazePlaywrightClient;
  private playwrightBusy = false;
  private capturedSession: WazeSession | null = null;

  constructor() {
    this.http = new WazeHttpClient();
    this.playwright = new WazePlaywrightClient();
  }

  async fetchTile(bbox: BoundingBox): Promise<TileFetchResult> {
    // ── Path 1: HTTP with cached session ─────────────────────────────────────
    const session = await getCurrentSession();

    if (session && isSessionFresh(session)) {
      try {
        const primary = await this.http.fetchTile(bbox, session, false);
        if (primary) {
          return { response: primary, strategy: 'http' };
        }
      } catch (_err) {
        logger.debug('HTTP primary failed, trying fallback URL');
      }

      // Try fallback URL with same session
      try {
        const fallback = await this.http.fetchTile(bbox, session, true);
        if (fallback) {
          return { response: fallback, strategy: 'http' };
        }
      } catch (_err) {
        logger.debug('HTTP fallback failed, will use Playwright');
      }

      // Session gave 403 / empty → invalidate
      await invalidateCachedSession();
    }

    // ── Path 2: Playwright session capture + HTTP retry ───────────────────────
    if (!this.playwrightBusy) {
      this.playwrightBusy = true;
      try {
        logger.info('WazeClient: capturing fresh session via Playwright');
        const freshSession = await this.playwright.captureSession();
        this.capturedSession = freshSession;

        const result = await this.http.fetchTile(bbox, freshSession, false);
        if (result) {
          return { response: result, strategy: 'playwright' };
        }

        // Still failing after fresh session
        logger.warn('HTTP still failing after Playwright session capture');
      } catch (err) {
        logger.error({ err }, 'Playwright session capture failed');
      } finally {
        this.playwrightBusy = false;
      }
    }

    // ── Path 3: Playwright direct tile fetch (no HTTP) ────────────────────────
    logger.info('WazeClient: falling back to Playwright direct tile fetch');
    try {
      const raw = await this.playwright.fetchTileWithPlaywright(bbox, this.capturedSession ?? undefined);
      const parsed = WazeResponseSchema.safeParse(raw);
      if (parsed.success) {
        return { response: parsed.data, strategy: 'playwright' };
      }
      logger.warn({ issues: parsed.error.issues.slice(0, 3) }, 'Playwright response parse failed');
    } catch (err) {
      logger.error({ err }, 'Playwright direct tile fetch failed');
    }

    // Give up — return empty response
    logger.error({ bbox }, 'All fetch strategies exhausted for tile — returning empty');
    return { response: { alerts: [] }, strategy: 'playwright' };
  }

  /**
   * Fetch multiple tiles in parallel (controlled concurrency).
   */
  async fetchTiles(
    tiles: BoundingBox[],
    concurrency = 2,
  ): Promise<TileFetchResult[]> {
    const results: TileFetchResult[] = [];
    const queue = [...tiles];

    while (queue.length > 0) {
      const batch = queue.splice(0, concurrency);
      const batchResults = await Promise.allSettled(
        batch.map((tile) => this.fetchTile(tile)),
      );

      for (const settled of batchResults) {
        if (settled.status === 'fulfilled') {
          results.push(settled.value);
        } else {
          logger.error({ reason: settled.reason }, 'Tile fetch rejected');
          results.push({ response: { alerts: [] }, strategy: 'http' });
        }
      }

      // Brief pause between batches to be polite to Waze's servers
      if (queue.length > 0) {
        await new Promise((r) => setTimeout(r, 500));
      }
    }

    return results;
  }
}
