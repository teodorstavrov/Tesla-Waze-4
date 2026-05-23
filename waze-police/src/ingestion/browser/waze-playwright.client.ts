/**
 * Playwright-based session capture for Waze Live Map.
 *
 * Strategy:
 *   1. Launch Chromium (headless)
 *   2. Navigate to https://www.waze.com/live-map
 *   3. Set map view to Bulgaria centre
 *   4. Intercept the first georss XHR request
 *   5. Extract cookies + User-Agent + Referer from the intercepted request
 *   6. Return a WazeSession object
 *
 * Also doubles as a standalone discovery script:
 *   npx tsx src/ingestion/browser/waze-playwright.client.ts
 */

import { chromium, type Browser } from 'playwright';
import { config } from '../../config/index.js';
import { logger } from '../../monitoring/metrics.js';
import type { WazeSession } from '../../types/waze.js';
import { storeCapturedSession } from '../http/session-manager.js';
import { getBulgariaTiles } from '../../geo/tiles.js';

// Bulgaria centre coordinates
const BG_CENTER_LAT = 42.7;
const BG_CENTER_LNG = 25.5;
const BG_ZOOM = 9; // roughly full-country zoom

const WAZE_LIVE_MAP_URL = 'https://www.waze.com/live-map';
const GEORSS_PATTERN = /georss/i;

export class WazePlaywrightClient {
  private browser: Browser | null = null;
  // Georss response bodies collected during the last captureSession() call.
  // captureSession navigates to Bulgaria at zoom=9 (full-country viewport) so
  // these responses cover all 4 ingestion tiles.  WazeClient reads them in
  // path-3 instead of opening a second browser instance per tile.
  private _capturedResponses: unknown[] = [];

  getCapturedResponses(): unknown[] {
    return this._capturedResponses;
  }

  async captureSession(): Promise<WazeSession> {
    logger.info('Playwright: starting session capture');
    const startTime = Date.now();

    this.browser = await chromium.launch({
      headless: config.PLAYWRIGHT_HEADLESS,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
        '--lang=en-US',
      ],
    });

    const context = await this.browser.newContext({
      locale: 'en-US',
      timezoneId: 'Europe/Sofia',
      geolocation: { latitude: BG_CENTER_LAT, longitude: BG_CENTER_LNG },
      permissions: ['geolocation'],
      userAgent: undefined, // use Playwright's default realistic UA
    });

    const page = await context.newPage();

    // Block images/fonts/media to speed up page load
    await page.route('**/*.{png,jpg,jpeg,gif,svg,woff,woff2,ttf,mp4,webm}', (route) =>
      route.abort(),
    );

    // Inject a browser-side XHR/fetch interceptor BEFORE any navigation.
    // page.route() and page.on('response') both fail when georss requests go
    // through a service worker (Playwright's interception layer doesn't reach
    // inside service workers).  addInitScript() runs inside the browser itself,
    // so it captures XHR response bodies regardless of how they are routed.
    const responseBodies: unknown[] = [];
    await page.addInitScript(() => {
      /* eslint-disable */
      const w = window as any;
      w.__georssData = w.__georssData || [];

      // Patch XMLHttpRequest
      const origOpen = XMLHttpRequest.prototype.open;
      XMLHttpRequest.prototype.open = function (this: XMLHttpRequest) {
        this.addEventListener('load', function (this: XMLHttpRequest) {
          try {
            if (!/georss/i.test(this.responseURL)) return;
            const text = this.responseText;
            if (text && text.trimStart().startsWith('{')) {
              w.__georssData.push(text);
            }
          } catch (_) {}
        });
        return (origOpen as any).apply(this, arguments);
      };

      // Patch fetch()
      const origFetch = window.fetch.bind(window);
      window.fetch = async function (...args: Parameters<typeof fetch>) {
        const res = await origFetch(...args);
        try {
          const url = typeof args[0] === 'string' ? args[0] : (args[0] as Request).url;
          if (/georss/i.test(url)) {
            res.clone().text().then((text: string) => {
              if (text && text.trimStart().startsWith('{')) {
                w.__georssData.push(text);
              }
            }).catch(() => {});
          }
        } catch (_) {}
        return res;
      };
      /* eslint-enable */
    });

    let capturedSession: WazeSession | null = null;
    const sessionPromise = new Promise<WazeSession>((resolve, reject) => {
      const timeout = setTimeout(
        () => reject(new Error('Playwright: timeout waiting for georss XHR')),
        60_000,
      );

      page.on('request', async (request) => {
        const url = request.url();
        if (!GEORSS_PATTERN.test(url)) return;

        logger.debug({ url }, 'Playwright: intercepted georss request');

        const headers = request.headers();
        const cookieHeader = headers['cookie'] ?? '';
        const ua = headers['user-agent'] ?? '';
        const referer = headers['referer'] ?? WAZE_LIVE_MAP_URL;

        // Also extract cookies from context
        let contextCookies = '';
        try {
          const cookies = await context.cookies();
          contextCookies = cookies
            .map((c) => `${c.name}=${c.value}`)
            .join('; ');
        } catch (_e) {
          // ignore
        }

        const session: WazeSession = {
          cookies: contextCookies || cookieHeader,
          userAgent: ua,
          referer,
          capturedAt: Date.now(),
          strategy: 'playwright',
        };

        clearTimeout(timeout);
        resolve(session);
      });
    });

    try {
      // Navigate to live map
      logger.info('Playwright: navigating to Waze live map');
      await page.goto(WAZE_LIVE_MAP_URL, {
        waitUntil: 'domcontentloaded',
        timeout: 30_000,
      });

      // Wait for initial JS to settle
      await page.waitForTimeout(3000);

      // Manipulate the map URL hash to move to Bulgaria
      // Waze uses ?zoom=N&lat=X&lon=Y format
      const bgUrl = `${WAZE_LIVE_MAP_URL}?zoom=${BG_ZOOM}&lat=${BG_CENTER_LAT}&lon=${BG_CENTER_LNG}`;
      logger.info({ bgUrl }, 'Playwright: navigating to Bulgaria view');
      await page.goto(bgUrl, {
        waitUntil: 'domcontentloaded',
        timeout: 30_000,
      });

      // Wait for the map to trigger a georss fetch
      await page.waitForTimeout(5000);

      // If not triggered yet, scroll/move map slightly to force a tile request
      try {
        const mapEl = await page.$('.waze-map-canvas, #map-canvas, canvas');
        if (mapEl) {
          const box = await mapEl.boundingBox();
          if (box) {
            const cx = box.x + box.width / 2;
            const cy = box.y + box.height / 2;
            await page.mouse.move(cx, cy);
            await page.mouse.wheel(0, -100); // slight zoom to trigger refresh
            await page.waitForTimeout(3000);
          }
        }
      } catch (_e) {
        // Map element not found — that's fine, we may have already captured
      }

      capturedSession = await sessionPromise;

      // Let any in-flight XHRs finish, then pull captured data from the browser
      await page.waitForTimeout(2000);
      try {
        const georssStrings = await page.evaluate(
          () => ((window as Record<string, unknown>).__georssData ?? []) as string[],
        );
        for (const str of georssStrings) {
          if (str && str.trimStart().startsWith('{')) {
            const parsed = JSON.parse(str) as unknown;
            responseBodies.push(parsed);
            const count = (parsed as { alerts?: unknown[] })?.alerts?.length ?? 0;
            logger.info({ alertCount: count }, 'Playwright: retrieved georss response from browser');
          }
        }
      } catch (err) {
        logger.warn({ err: String(err) }, 'Playwright: failed to retrieve georss data from page context');
      }
    } finally {
      await page.close().catch(() => undefined);
      await context.close().catch(() => undefined);
      await this.browser.close().catch(() => undefined);
      this.browser = null;
    }

    this._capturedResponses = responseBodies;

    const elapsed = Date.now() - startTime;
    logger.info(
      { elapsed_ms: elapsed, ua: capturedSession.userAgent.slice(0, 60), capturedResponses: responseBodies.length },
      'Playwright: session captured successfully',
    );

    // Persist to Redis
    await storeCapturedSession(capturedSession);
    return capturedSession;
  }

  /**
   * Use Playwright to fetch a tile directly (interception mode).
   * Navigates to Waze, waits for the georss request matching our tile,
   * intercepts and returns the response body.
   */
  async fetchTileWithPlaywright(
    bbox: { top: number; bottom: number; left: number; right: number },
    session?: WazeSession,
  ): Promise<unknown | null> {
    logger.info({ bbox, hasSession: !!session }, 'Playwright: fetching tile via browser interception');

    this.browser = await chromium.launch({
      headless: config.PLAYWRIGHT_HEADLESS,
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu'],
    });

    const context = await this.browser.newContext({
      locale: 'en-US',
      timezoneId: 'Europe/Sofia',
      userAgent: session?.userAgent,
    });

    // Inject captured session cookies so Waze serves real data (not 403)
    if (session?.cookies) {
      const cookies = session.cookies
        .split('; ')
        .map((pair) => pair.trim())
        .filter((pair) => pair.includes('='))
        .map((pair) => {
          const eqIdx = pair.indexOf('=');
          return {
            name: pair.substring(0, eqIdx).trim(),
            value: pair.substring(eqIdx + 1).trim(),
            domain: '.waze.com',
            path: '/',
            secure: true,
            httpOnly: false,
            sameSite: 'None' as const,
          };
        });
      if (cookies.length > 0) {
        await context.addCookies(cookies);
      }
    }

    const page = await context.newPage();
    await page.route('**/*.{png,jpg,jpeg,gif,svg,woff,woff2,ttf}', (r) => r.abort());

    let responseBody: unknown = null;

    try {
      const centerLat = (bbox.top + bbox.bottom) / 2;
      const centerLng = (bbox.left + bbox.right) / 2;
      const tileUrl = `${WAZE_LIVE_MAP_URL}?zoom=12&lat=${centerLat}&lon=${centerLng}`;

      // Listen for ALL responses matching the georss pattern; skip HTML responses
      // and resolve on the first valid JSON one.  waitForResponse() with a single
      // predicate resolves on the very first match — which can be an HTML page
      // navigation that happens to redirect through a georss-like URL.
      // Using page.on('response') lets us inspect the body and skip bad ones.
      const jsonResponsePromise = new Promise<unknown>((resolve, reject) => {
        const tid = setTimeout(
          () => reject(new Error('Playwright: timeout waiting for georss JSON response')),
          85_000,
        );

        page.on('response', async (r) => {
          if (!GEORSS_PATTERN.test(r.url())) return;
          try {
            const text = await r.text();
            if (!text.trimStart().startsWith('{')) {
              logger.debug(
                { url: r.url(), status: r.status(), preview: text.slice(0, 80) },
                'Playwright: georss response is not JSON — skipping',
              );
              return;
            }
            clearTimeout(tid);
            resolve(JSON.parse(text));
          } catch {
            // response body read error — skip
          }
        });
      });

      // Two-step navigation: cold-start at base URL, then navigate to tile coordinates.
      await page.goto(WAZE_LIVE_MAP_URL, { waitUntil: 'domcontentloaded', timeout: 30_000 });
      await page.waitForTimeout(3000);
      await page.goto(tileUrl, { waitUntil: 'domcontentloaded', timeout: 30_000 });

      responseBody = await jsonResponsePromise;
    } catch (err) {
      logger.warn({ err }, 'Playwright tile fetch failed');
      responseBody = null;
    } finally {
      await page.close().catch(() => undefined);
      await context.close().catch(() => undefined);
      await this.browser.close().catch(() => undefined);
      this.browser = null;
    }

    return responseBody;
  }
}

// ── Standalone discovery mode ────────────────────────────────────────────────
// Run: npx tsx src/ingestion/browser/waze-playwright.client.ts

const isMainModule =
  process.argv[1] !== undefined &&
  (process.argv[1].endsWith('waze-playwright.client.ts') ||
    process.argv[1].endsWith('waze-playwright.client.js'));

if (isMainModule) {
  import('dotenv/config').then(async () => {
    const client = new WazePlaywrightClient();
    try {
      const session = await client.captureSession();
      console.log('Captured session:');
      console.log(JSON.stringify({ ...session, cookies: session.cookies.slice(0, 80) + '…' }, null, 2));

      // Test-fetch first tile
      const tiles = getBulgariaTiles();
      console.log(`Testing first tile: ${JSON.stringify(tiles[0])}`);
      const body = await client.fetchTileWithPlaywright(tiles[0]!);
      const alertCount = (body as { alerts?: unknown[] })?.alerts?.length ?? 0;
      console.log(`First tile alert count: ${alertCount}`);
    } catch (err) {
      console.error('Discovery failed:', err);
      process.exit(1);
    }
  });
}
