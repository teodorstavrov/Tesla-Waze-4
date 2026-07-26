/**
 * Waze → TesRadar police-marker sync
 * --------------------------------------------------------------
 * Reads POLICE alerts from the Waze live-map (via a real browser
 * context, because Waze blocks raw API calls with 403) and mirrors
 * them onto the TesRadar admin map with exact coordinates.
 *
 * Verified TesRadar API contract:
 *   GET    /api/admin/events            -> list events  (Authorization: Bearer <secret>)
 *   POST   /api/admin/events            -> { type, lat, lng, description }
 *   DELETE /api/admin/events?id=<id>    -> remove event
 *
 * Verified Waze source:
 *   GET https://www.waze.com/live-map/api/georss
 *       ?top&bottom&left&right&env=row&types=alerts
 *   Returns 200 only inside the real Waze app context; alerts[] items
 *   of type "POLICE" carry { location:{x:lon,y:lat}, uuid, ... }.
 *
 * Requires: Node 18+, `npm i playwright` and `npx playwright install chromium`.
 */

import { chromium }                       from 'playwright';
import { readFileSync, writeFileSync }     from 'fs';
import { dirname, join }                   from 'path';
import { fileURLToPath }                   from 'url';

// ----------------------------- CONFIG -----------------------------
const CONFIG = {
  // TesRadar admin secret (the value you type at /admin login).
  // Prefer setting it via env var: TESRADAR_SECRET=xxxxxxxx node sync.mjs
  tesradarSecret: process.env.TESRADAR_SECRET || 'PUT_YOUR_8_CHAR_SECRET_HERE',
  tesradarBase: 'https://tesradar.tech',

  // Location groups. Run one with:  node sync.mjs <group>   (cities | route | all)
  // Each group is a separate, staggered scheduled task so Waze gets smaller
  // bursts instead of one big one. A location may set drags:'wide' for richer
  // sweeps. Sofia is split into 5 sub-points for full metro coverage.
  groups: {
    cities: [
      // PRIORITY cities first — scanned before Sofia's heavy block, so they
      // get fresh (un-throttled) requests and don't end up empty.
      // Varna is coastal: 3 sub-points + 'wide' sweeps (sea drags auto-skip),
      // centred on LAND (west of the port) so police aren't missed.
      { name: 'Varna-C', lat: 43.2080, lon: 27.8850, drags: 'priority' },
      { name: 'Varna-W', lat: 43.2200, lon: 27.8200, drags: 'priority' }, // west districts / Hemus entry
      { name: 'Varna-S', lat: 43.1820, lon: 27.9050, drags: 'priority' }, // Asparuhovo / Burgas exit
      { name: 'Burgas',    lat: 42.5048, lon: 27.4626, drags: 'priority' },
      { name: 'Plovdiv',   lat: 42.1354, lon: 24.7453, drags: 'priority' },

      // Sofia: 5 sub-points (center + 4 corners) tile the whole metro + ring road.
      { name: 'Sofia-C',  lat: 42.6977, lon: 23.3219, drags: 'priority' },
      { name: 'Sofia-NE', lat: 42.7400, lon: 23.4150, drags: 'wide' },
      { name: 'Sofia-NW', lat: 42.7400, lon: 23.2300, drags: 'wide' },
      { name: 'Sofia-SE', lat: 42.6550, lon: 23.4150, drags: 'wide' },
      { name: 'Sofia-SW', lat: 42.6550, lon: 23.2300, drags: 'wide' },

      { name: 'Ruse',      lat: 43.8356, lon: 25.9657 },
      { name: 'Dobrich',   lat: 43.5726, lon: 27.8273 },
      { name: 'Shumen',    lat: 43.2712, lon: 26.9361 },
      // V.Tarnovo removed — it's covered by the route group (A2-VelikoTarnovo).
    ],

    // A2 "Hemus" corridor (Varna -> Sofia) — out-of-city highway police.
    route: [
      { name: 'A2-Devnya',     lat: 43.2260, lon: 27.5680 },
      { name: 'A2-Targovishte',lat: 43.2510, lon: 26.5720 },
      { name: 'A2-VelikoTarnovo',lat: 43.0757, lon: 25.6172 },
      { name: 'A2-Sevlievo',   lat: 43.0260, lon: 25.1030 },
      { name: 'A2-Yablanitsa', lat: 43.0240, lon: 24.1120 },
      { name: 'A2-Vitinya',    lat: 42.8300, lon: 23.5700 },
    ],

    // Netherlands — 3 largest cities (start). Lots of water -> the water/forest
    // skip keeps drags off the IJ / harbour / North Sea automatically.
    nl: [
      { name: 'Amsterdam', lat: 52.3676, lon: 4.9041, drags: 'wide' },
      { name: 'Rotterdam', lat: 51.9244, lon: 4.4777 },
      { name: 'DenHaag',   lat: 52.0705, lon: 4.3007 },

      // A2 corridor Amsterdam -> Utrecht -> Eindhoven (Amsterdam already above).
      { name: 'A2NL-Utrecht',     lat: 52.0907, lon: 5.1214 },
      { name: 'A2NL-Vianen',      lat: 51.9900, lon: 5.0950 },
      { name: 'A2NL-Geldermalsen',lat: 51.8800, lon: 5.2600 },
      { name: 'A2NL-Zaltbommel',  lat: 51.8120, lon: 5.2460 },
      { name: 'A2NL-DenBosch',    lat: 51.6978, lon: 5.3037 },
      { name: 'A2NL-Boxtel',      lat: 51.5600, lon: 5.3300 },
      { name: 'A2NL-Eindhoven',   lat: 51.4416, lon: 5.4697 },

      // Neighbouring German metro on the NL border (Antwerp moved to the 'be' group).
      { name: 'Dusseldorf', lat: 51.2277, lon: 6.7735, drags: 'wide' },
    ],

    // Belgium — major cities + the busy Antwerp–Brussels–Ghent triangle (E19/E40).
    // Ordered big-first so priority metros get fresh (un-throttled) requests.
    // Kept to ~11 points so Waze gets a modest burst (lower rate-limit risk).
    be: [
      { name: 'Brussels',  lat: 50.8503, lon: 4.3517, drags: 'wide' },
      { name: 'Antwerp',   lat: 51.2194, lon: 4.4025, drags: 'wide' },  // big port/river -> water drags auto-skip
      { name: 'Ghent',     lat: 51.0543, lon: 3.7174 },
      { name: 'Liege',     lat: 50.6326, lon: 5.5797 },
      { name: 'Charleroi', lat: 50.4114, lon: 4.4447 },
      { name: 'Bruges',    lat: 51.2093, lon: 3.2247 },
      { name: 'Leuven',    lat: 50.8798, lon: 4.7005 },
      { name: 'Namur',     lat: 50.4674, lon: 4.8720 },
      { name: 'Mechelen',  lat: 51.0259, lon: 4.4776 },
      // E19 (Antwerp–Brussels) + E40 (Brussels–Ghent) highway points.
      { name: 'E19-Mechelen', lat: 51.1200, lon: 4.4600 },
      { name: 'E40-Aalst',    lat: 50.9400, lon: 4.0400 },
    ],
  },

  // Spoke patterns — [nx, ny] are viewport-relative direction multipliers.
  // Actual geo-offsets are: lat += ny * stepLat, lon += nx * stepLon
  // where stepLat/stepLon = viewport_dimension × coverage.
  // coverage: 0.7 → each spoke moves 70% of viewport → ~30% overlap with centre.
  dragPatterns: {
    standard: {
      spokes: [[0,-1],[0,1],[-1,0],[1,0]],
      coverage: 0.7,
      emptyLimit: 2,
    },
    wide: {
      spokes: [[0,-1],[0,1],[-1,0],[1,0],
               [-0.7,-0.7],[0.7,-0.7],[-0.7,0.7],[0.7,0.7]],
      coverage: 0.7,
      emptyLimit: 3,
    },
    priority: {
      spokes: [[0,-1],[0,1],[-1,0],[1,0],
               [-0.7,-0.7],[0.7,-0.7],[-0.7,0.7],[0.7,0.7],
               [0,-2],[0,2],[-2,0],[2,0]],
      coverage: 0.7,
      emptyLimit: 5,
    },
  },
  defaultDrags: 'standard',

  // Waze URL zoom ≠ Leaflet zoom (offset ≈ 4). URL zoom 9 → Leaflet zoom 13
  // → georss bbox ≈ 17km × 8.5km. With coverage=0.7 that gives ≈12km × 6km steps —
  // enough to leave a 5km police cluster behind on each spoke.
  startZoom: 13,
  zoomOutClicks: 4,     // targetZoom = 9 → URL ?zoom=9 → viewport ≈ 17km × 8.5km

  // Random 0..N minute delay at the start of each run, so staggered tasks don't
  // hit Waze at the exact same clock minute every time.
  jitterMaxMin: process.env.WAZE_JITTER_MIN != null ? Math.max(0, Number(process.env.WAZE_JITTER_MIN)) : 10,

  // Pacing (ms) — slower = fewer rate-limit 403s from Waze.
  tileWaitMs: 5000,
  betweenActionMs: 2500,

  // Adaptive back-off when Waze returns 403/429 (rate-limited).
  backoffBaseMs: 8000,             // wait grows with the number of blocked responses
  maxBackoffMs: 60000,
  giveUpAfterBlockedTiles: 4,      // stop main pass if this many locations in a row are fully blocked
  retryCooldownMs: 60000,          // wait before retrying locations that were blocked/failed
  hardTimeoutMs: 25 * 60 * 1000,   // watchdog: force-exit if the whole run exceeds this

  // Two police markers within this distance (meters) are treated as the same.
  dedupMeters: 120,

  // Snap every marker to the nearest road. If the nearest road is farther
  // than this (meters), the point is discarded as off-road noise.
  // (Live test over Varna: all real police alerts snapped < 8 m.)
  maxSnapMeters: 60,

  // Skip a drag sweep whose new map centre has NO road within this distance
  // (likely sea / lake / forest / empty) — saves a wasted georss request.
  skipRoadlessMeters: 3000,

  // Remove TesRadar police markers (previously created by this script)
  // that are no longer present in Waze. Off by default for safety.
  removeStale: false,

  // CDP endpoint of a real Chrome you launched with --remote-debugging-port=9222.
  // Use 127.0.0.1 (IPv4) NOT localhost — Chrome's debug port binds to IPv4 only,
  // and "localhost" can resolve to ::1 (IPv6) -> ECONNREFUSED.
  cdpUrl: 'http://127.0.0.1:9222',

  // --- Email alert on failure (via Resend HTTP API) ---
  // Uses your existing Resend API key (set env var RESEND_API_KEY). No mailbox
  // access, no SMTP password. `from` must be a verified Resend sender/domain.
  email: {
    enabled: true,
    resendApiKey: process.env.RESEND_API_KEY || '',
    from: 'TesRadar Alerts <noreply@tesradar.tech>',  // must be a verified domain in your Resend account
    to: 'teodorstavrov@gmail.com',                    // where alerts go
    alertOnZero: true,   // also alert if a run finds 0 police anywhere (possible block/outage)
  },
};
// ------------------------------------------------------------------

const POLICE_TYPE = 'police';
const TAG = 'wazesync'; // marker in description to recognise our own markers

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// fetch with a hard timeout (bare fetch can hang forever when the network flaps)
async function fetchT(url, opts = {}, ms = 12000) {
  const ctrl = new AbortController();
  const to = setTimeout(() => ctrl.abort(), ms);
  try { return await fetch(url, { ...opts, signal: ctrl.signal }); }
  finally { clearTimeout(to); }
}

// ── Throttle-alert suppression ────────────────────────────────────────────
// When Waze blocks all georss on the warm-up (IP throttle), the scheduler
// may re-run every 12-15 minutes for the duration of the block, flooding
// the inbox with identical alerts. We write a tiny state file and suppress
// repeat emails within a 90-minute quiet window.
const _stateFile = join(dirname(fileURLToPath(import.meta.url)), '.wazesync-throttle');
const _QUIET_MS  = 90 * 60 * 1000; // 90 minutes

function _throttleAge()    { try { const ts = Number(readFileSync(_stateFile,'utf8').trim()); return ts > 0 ? Date.now() - ts : Infinity; } catch { return Infinity; } }
function _markThrottle()   { try { writeFileSync(_stateFile, String(Date.now())); } catch { /* best-effort */ } }
function _clearThrottle()  { try { writeFileSync(_stateFile, '0'); }              catch { /* best-effort */ } }

// Set when collectWazePolice() bailed on a warm-up block (NOT a real sync failure).
let warmupThrottled = false;

// Set when something goes wrong during collection (network down, hard block).
let collectProblem = null;
// Names of locations that did NOT pass cleanly this run (failed to load, or
// rate-limited with no data, or never reached). Used to signal an "incomplete"
// run (exit code 4) so the chain can re-run the priority group until it passes.
let unresolvedTiles = [];

// Per-run marker lifetime (ms). NL/BE sync every 4h, so their markers must live
// longer than BG's (which sync every 2h). null => let the server use its default
// (police = 2h15m). Set in main() from the group argument.
let markerTtlMs = null;

// Mid-batch breather: pause after the Nth location in the main pass (0 = off).
// Used for cities (20 locations) to let Waze's per-IP rate budget recover at the
// halfway point. Set in main() from the group argument.
let midPauseAfter = 0;
let midPauseMs = 0;

// Send a failure alert by email via the Resend HTTP API (best-effort; needs network).
async function sendAlert(subject, body) {
  const e = CONFIG.email;
  if (!e.enabled) return;
  if (!e.resendApiKey) { console.warn('  [alert] no RESEND_API_KEY set - cannot send email.'); return; }
  try {
    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${e.resendApiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: e.from,
        to: [e.to],
        subject,
        text: `${body}\n\nTime: ${new Date().toISOString()}\nHost: ${process.env.COMPUTERNAME || ''}`,
      }),
    });
    if (r.ok) console.log('  [alert] email sent via Resend to', e.to);
    else console.warn('  [alert] Resend error', r.status, (await r.text()).slice(0, 200));
  } catch (err) {
    console.warn('  [alert] failed to send email:', err.message);
  }
}

function haversine(aLat, aLon, bLat, bLon) {
  const R = 6371000, toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(bLat - aLat), dLon = toRad(bLon - aLon);
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

function* tileCenters(b, latStep, lonStep) {
  for (let lat = b.minLat; lat <= b.maxLat; lat += latStep)
    for (let lon = b.minLon; lon <= b.maxLon; lon += lonStep)
      yield { lat: +lat.toFixed(5), lon: +lon.toFixed(5) };
}

// ---------------------- 1. COLLECT FROM WAZE ----------------------
async function collectWazePolice(tiles) {
  const found = new Map(); // uuid -> { lat, lon, uuid }

  // Attach to a REAL Chrome you launched with a debug port. Waze blocks
  // automation-launched browsers with 403; a user-launched Chrome is fine.
  // Launch it first (Chrome may already be running with this profile):
  //   & "C:\Program Files\Google\Chrome\Application\chrome.exe" --remote-debugging-port=9222 --user-data-dir="C:\Data\WWW\Tesla Waze 4\WazeSync\chrome-profile"
  let browser;
  try {
    browser = await chromium.connectOverCDP(CONFIG.cdpUrl);
  } catch (e) {
    collectProblem = `Debug Chrome not reachable on ${CONFIG.cdpUrl} -- run start-chrome-debug.bat and keep it open. (${e.message.split('\n')[0]})`;
    console.log(`  ${collectProblem}`);
    return []; // graceful: nothing collected, alert e-mail will be sent
  }
  const ctx = await browser.newContext();   // fresh incognito-like context — no cookies from prev runs
  const page = await ctx.newPage();
  // Cap every Playwright action/navigation so nothing waits forever when the
  // network flaps. bringToFront has no timeout param, so wrap it via withTimeout.
  page.setDefaultTimeout(20000);
  page.setDefaultNavigationTimeout(35000);
  const withTimeout = (p, ms, label) => {
    let id;
    const timer   = new Promise((res) => { id = setTimeout(() => { console.log(`  (timeout: ${label})`); res(); }, ms); });
    const guarded = Promise.resolve(p).catch(() => {}).then((v) => { clearTimeout(id); return v; });
    return Promise.race([guarded, timer]);
  };
  await withTimeout(page.bringToFront(), 8000, 'bringToFront');

  // 403-tracking: Waze rate-limits aggressive automated reads. We watch for
  // blocked georss responses and back off so we don't deepen the throttle.
  // responses: per-OK-georss stats for diagnostics (alerts total, police count).
  // Capped at 1000 to prevent unbounded growth on long runs.
  const rl = { recentBlocks: 0, totalBlocks: 0, ok: 0, responses: [] };

  // ── Session health state ─────────────────────────────────────────────────
  // Tracks the full lifetime of a single collectWazePolice() invocation.
  // healthCheck() reads these; the response listener writes them.
  const sh = {
    total403:         0,
    total429:         0,
    totalOk:          0,
    runStartMs:       Date.now(),
    // Per-tile block counts (most recent tile last). Used for trend detection.
    // Capped at 30 entries so it doesn't grow unboundedly on very long runs.
    tileBlockHistory: [],
    // Set to true inside scanTile when block ratio crosses 20%.
    // Signals the drag loop to stop without aborting the tile entirely.
    dragsSuspended:   false,
    // Sliding window of the last 20 georss outcomes (true = ok, false = blocked).
    // healthCheck() uses this so that a few blocks on an early tile don't poison
    // the ratio for subsequent clean tiles (avoids false "slow" triggers).
    recentWindow:     [],
  };

  // Shared map-navigation state (used by tryMapDrag / jsSetView below).
  // Must be declared before the response listener so the callback doesn't hit TDZ.
  let _mapLat  = null;   // current viewport centre lat (updated after each navigation)
  let _mapLon  = null;   // current viewport centre lon
  let _latestVB = null;  // last georss bbox { n,s,e,w } — gives px/° at current zoom

  // Intercept every georss response the real Waze app makes (these get 200).
  page.on('response', async (resp) => {
    if (!resp.url().includes('/live-map/api/georss')) return;
    const s = resp.status();
    if (s === 403 || s === 429) {
      rl.recentBlocks++; rl.totalBlocks++;
      if (s === 403) sh.total403++; else sh.total429++;
      sh.recentWindow.push(false); if (sh.recentWindow.length > 20) sh.recentWindow.shift();
      return;
    }
    try {
      const data = await resp.json();
      rl.ok++;
      sh.totalOk++;
      sh.recentWindow.push(true); if (sh.recentWindow.length > 20) sh.recentWindow.shift();
      const allAlerts = data.alerts || [];
      let policeCount = 0;
      for (const a of allAlerts) {
        if (a.type !== 'POLICE') continue;
        policeCount++;
        const loc = a.location || {};
        if (typeof loc.y !== 'number' || typeof loc.x !== 'number') continue;
        // Waze identifies the alert in field `id` (NOT `uuid`), e.g.
        // "alert-1331823844/926693ba-...". Confirmed live on the georss feed.
        const id = a.id;
        if (id && !found.has(id))
          found.set(id, { id, lat: loc.y, lon: loc.x });
      }
      // Parse bbox from the georss URL (?top=&bottom=&left=&right=).
      let bbox = null;
      try {
        const usp = new URL(resp.url()).searchParams;
        const n = parseFloat(usp.get('top') || ''), s = parseFloat(usp.get('bottom') || '');
        const e = parseFloat(usp.get('right') || ''), w = parseFloat(usp.get('left') || '');
        if (!isNaN(n) && !isNaN(s) && !isNaN(e) && !isNaN(w)) bbox = { n, s, e, w };
      } catch {}
      if (bbox) _latestVB = bbox;
      rl.responses.push({ alerts: allAlerts.length, police: policeCount, bbox });
      if (rl.responses.length > 1000) rl.responses.shift();
    } catch {
      rl.recentBlocks++; rl.totalBlocks++; sh.total403++;
      sh.recentWindow.push(false); if (sh.recentWindow.length > 20) sh.recentWindow.shift();
    }
  });

  // Warm up + accept the one-time "I understand" / cookie dialog if present.
  // Retry the first navigation: right after boot/logon the network/DNS may not
  // be up yet (ERR_NAME_NOT_RESOLVED). Don't let a transient hiccup kill the run.
  let warmedUp = false;
  for (let attempt = 1; attempt <= 5; attempt++) {
    try {
      await page.goto('https://www.waze.com/bg/live-map?lat=42.6977&lon=23.3219&zoom=13', { waitUntil: 'domcontentloaded', timeout: 30000 });
      warmedUp = true;
      break;
    } catch (e) {
      console.log(`  warm-up attempt ${attempt}/5 failed: ${e.message.split('\n')[0]}`);
      await sleep(15000); // wait for network/DNS to come up, then retry
    }
  }
  if (!warmedUp) {
    console.log('  No network / Waze unreachable after 5 attempts. Skipping this run.');
    collectProblem = 'No network / Waze unreachable after 5 attempts (DNS/connection error).';
    try { await page.close(); } catch {}
    try { await browser.close(); } catch {}
    return []; // graceful: nothing collected
  }
  await withTimeout(page.bringToFront(), 8000, 'bringToFront');
  await sleep(3000);
  await dismissBanners();
  await sleep(800);

  // ── Post-warm-up session health gate ──────────────────────────────────────
  // The warm-up page.goto() fires 1-3 georss requests as the Waze app initialises.
  // If ALL of them are blocked and none succeeded, the Chrome session has likely
  // expired (needs re-authentication) or this IP is heavily throttled.
  // Bail immediately with a clear message rather than burning 10+ minutes of scan.
  if (sh.total403 + sh.total429 > 0 && sh.totalOk === 0) {
    const reason = sh.total429 > 0 ? '429 rate-limited' : '403 forbidden';
    const msg = `Waze blocked on warm-up (${reason}, ${sh.total403 + sh.total429} hit(s)). ` +
      'Most likely cause: IP quota exhausted by a previous group run - wait 30-60min and retry. ' +
      'If this persists across many hours: open Chrome, navigate to waze.com and confirm the map ' +
      'loads with live traffic - the profile may need re-authentication.';
    console.log(`  [health] ${msg}`);
    warmupThrottled = true;
    collectProblem  = msg;
    try { await page.close(); } catch {}
    try { await browser.close(); } catch {}
    return [];
  }

  console.log(`Scanning ${tiles.length} locations.`);

  // ── Helpers for the adaptive scan ─────────────────────────────────────

  // Randomised human-like delay: base + 0..spread ms.
  const jitter = (base, spread = 0) =>
    sleep(base + (spread > 0 ? Math.floor(Math.random() * spread) : 0));

  // Capture the current rl counter values before an action that should
  // trigger a georss fetch. Pass the result to waitForGeoRss().
  const snapRl = () => ({ ok: rl.ok, tb: rl.totalBlocks });

  // Block until a NEW georss response appears (success or block) or timeout.
  // "before" is the snapshot taken BEFORE the triggering action.
  async function waitForGeoRss(before, timeoutMs = CONFIG.tileWaitMs + 2000) {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      if (rl.ok > before.ok || rl.totalBlocks > before.tb) return;
      await sleep(100 + Math.floor(Math.random() * 100));
    }
  }

  // ── Map navigation ────────────────────────────────────────────────────────
  // Waze's webpack-5 build hides the Leaflet map in a closure — setView()
  // cannot be called directly. jsSetView() uses mouse drag (fast, no reload)
  // for intra-city spoke navigation and falls back to page.goto() for the
  // first load or cross-city jumps (>3× viewport). State variables (_mapLat,
  // _mapLon, _latestVB) are declared before the response listener above.

  // Pan the Leaflet map by dragging (no page reload, ~250 ms).
  // Returns true on success, false if drag rejected (too far / element missing).
  async function tryMapDrag(targetLat, targetLon) {
    if (_mapLat === null || !_latestVB) return false;
    try {
      const info = await page.evaluate(() => {
        const el = document.querySelector('.leaflet-container');
        if (!el) return null;
        const r = el.getBoundingClientRect();
        if (r.width < 100 || r.height < 100) return null;
        return { cx: r.left + r.width / 2, cy: r.top + r.height / 2, w: r.width, h: r.height };
      });
      if (!info) return false;

      const latSpan = _latestVB.n - _latestVB.s;
      const lonSpan = _latestVB.e - _latestVB.w;
      const pxPerLat = info.h / latSpan;
      const pxPerLon = info.w / lonSpan;

      const latDelta = targetLat - _mapLat;
      const lonDelta = targetLon - _mapLon;

      // Dragging the map: to see north, drag down; to see east, drag left.
      const dragX = -lonDelta * pxPerLon;
      const dragY =  latDelta * pxPerLat;

      // More than 3× viewport → cross-city jump, use goto instead.
      if (Math.abs(dragX) > info.w * 3 || Math.abs(dragY) > info.h * 3) return false;

      const sx = info.cx, sy = info.cy;
      const ex = Math.round(sx + dragX), ey = Math.round(sy + dragY);

      await page.mouse.move(sx, sy);
      await page.mouse.down();
      await sleep(60);
      await page.mouse.move(ex, ey, { steps: 8 });
      await sleep(60);
      await page.mouse.up();
      await sleep(250);
      return true;
    } catch { return false; }
  }

  // Dismiss any cookie/GDPR/privacy banners (Waze, Didomi, OneTrust, custom).
  // Uses DOM text search so it works regardless of CSS class names or CMP vendor.
  async function dismissBanners() {
    const CONSENT_RE = /i understand|accept all|accept cookies|agree|разбрах|приемам|съгласен|съглас|получих|ok\b/i;
    // Wait up to 5 s for any overlay/dialog to appear, then try to click it.
    for (let pass = 0; pass < 3; pass++) {
      try {
        const clicked = await page.evaluate((pattern) => {
          // Find all visible buttons / links that look like consent actions.
          const candidates = Array.from(
            document.querySelectorAll('button, a[role="button"], [role="button"], input[type="button"], input[type="submit"]')
          );
          const re = new RegExp(pattern, 'i');
          for (const el of candidates) {
            const text = (el.innerText || el.value || el.getAttribute('aria-label') || '').trim();
            if (!text || !re.test(text)) continue;
            // Make sure the element is visible (not display:none etc.)
            const rect = el.getBoundingClientRect();
            if (rect.width === 0 && rect.height === 0) continue;
            el.click();
            return text; // return what we clicked so the caller can log it
          }
          return null;
        }, CONSENT_RE.source);

        if (clicked) {
          console.log(`  [banner] dismissed: "${clicked}"`);
          await sleep(600);
          return;
        }
      } catch { /* page closed / evaluate error */ }

      if (pass < 2) await sleep(1500); // give banner time to appear and retry
    }
  }

  // Click the Waze/Leaflet zoom-out button CONFIG.zoomOutClicks times so the
  // viewport covers a much larger area than Waze's default stored zoom level.
  // Called after every page.goto() (centre navigation only — drags inherit zoom).
  async function doZoomOut() {
    const n = CONFIG.zoomOutClicks;
    if (!n) return;
    // Waze wraps Leaflet's standard zoom controls; try both class names.
    const btn = page.locator('.leaflet-control-zoom-out, [data-testid="zoom-out"]').first();
    for (let i = 0; i < n; i++) {
      try {
        await btn.click({ timeout: 3000 });
        await sleep(350);
      } catch { break; }
    }
    // Wait for tiles + one georss at the new zoom before proceeding.
    try { await page.waitForSelector('.leaflet-tile-loaded', { timeout: 5000 }); } catch {}
    await sleep(300);
  }

  // Navigate the Waze map to (lat, lon, zoom).
  // Tries mouse drag first (fast, no reload); falls back to page.goto() + zoom-out.
  // Returns true on success, null on failure.
  async function jsSetView(lat, lon, zoom) {
    // Fast path: mouse drag (no page reload, ~300 ms per spoke)
    if (await tryMapDrag(lat, lon)) {
      _mapLat = lat; _mapLon = lon;
      return true;
    }

    // Slow path: full page navigation (~4 s, used for first load and cross-city jumps)
    const url = `https://www.waze.com/bg/live-map?lat=${lat.toFixed(6)}&lon=${lon.toFixed(6)}&zoom=${zoom}`;
    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 35000 });
        await withTimeout(page.bringToFront(), 8000, 'bringToFront');
        await dismissBanners();
        try { await page.waitForSelector('.leaflet-tile-loaded', { timeout: 8000 }); } catch {}
        await doZoomOut();
        _mapLat = lat; _mapLon = lon;
        return true;
      } catch (navErr) {
        if (attempt === 2) {
          console.log(`    jsSetView(${lat.toFixed(4)},${lon.toFixed(4)},${zoom}): goto failed: ${navErr.message}`);
          return null;
        }
        await sleep(1500);
      }
    }
    return null;
  }

  // Read the current Leaflet viewport bounds without navigating.
  async function getMapBounds() {
    try {
      return await page.evaluate(() => {
        function readBounds(b) {
          if (!b) return null;
          const n = typeof b.getNorth === 'function' ? b.getNorth()
                  : b._northEast != null ? b._northEast.lat : null;
          const s = typeof b.getSouth === 'function' ? b.getSouth()
                  : b._southWest != null ? b._southWest.lat : null;
          const e = typeof b.getEast  === 'function' ? b.getEast()
                  : b._northEast != null ? b._northEast.lng : null;
          const w = typeof b.getWest  === 'function' ? b.getWest()
                  : b._southWest != null ? b._southWest.lng : null;
          return (n != null && s != null && e != null && w != null) ? { n, s, e, w } : null;
        }
        function tryMap(m) {
          if (!m || typeof m.getBounds !== 'function') return null;
          try { return readBounds(m.getBounds()); } catch { return null; }
        }
        try {
          const el = document.querySelector('.leaflet-container');
          const r = tryMap(el && el._leaflet_map);
          if (r !== null) return r;
          for (const key of Object.keys(window)) {
            try { const r2 = tryMap(window[key]); if (r2 !== null) return r2; } catch {}
          }
        } catch {}
        return null;
      });
    } catch { return null; }
  }

  // ── Session health controller ────────────────────────────────────────────
  //
  // Returns the action the caller should take right now:
  //   'continue'   — block ratio ≤ 20%; proceed normally
  //   'slow'       — block ratio 20-40%; suspend remaining drags, add delay
  //   'stop_tile'  — block ratio > 40%; abort this tile immediately
  //
  // Call before each drag inside scanTile. Needs ≥5 total requests before
  // it issues anything other than 'continue' (not enough signal below that).
  function healthCheck() {
    // Use the sliding window (last 20 requests) so early-tile blocks don't
    // poison the ratio for subsequent clean tiles. Requires at least 5
    // responses before issuing anything other than 'continue'.
    const win = sh.recentWindow;
    if (win.length < 5) return 'continue';
    const recentBlocks = win.filter((ok) => !ok).length;
    const ratio        = recentBlocks / win.length;
    if (ratio > 0.40) return 'stop_tile';
    if (ratio > 0.20) return 'slow';
    return 'continue';
  }

  // Returns true when the last 5 tiles show an escalating block trend.
  // Triggers a 5-minute recovery pause in the main pass.
  // Heuristic: 3 of the last 4 transitions are increases AND the window
  // ends higher than it started (rules out a flat or oscillating sequence).
  function checkBlockTrend() {
    const h = sh.tileBlockHistory;
    if (h.length < 5) return false;
    const last5 = h.slice(-5);
    let rises = 0;
    for (let i = 1; i < last5.length; i++) {
      if (last5[i] > last5[i - 1]) rises++;
    }
    return rises >= 3 && last5[4] > last5[0];
  }

  // Scan a single location; returns { gained, blocked, failed, tileOk }.
  //
  // Coverage model: viewport-adaptive star (hub-and-spoke).
  //   After navigating to the tile centre, reads the actual Leaflet viewport
  //   bounds and computes spoke positions so each spoke moves ≥70% of the
  //   viewport dimension — guaranteeing ≤30% overlap with the centre view.
  //   At zoom 13 (viewport ≈18×10 km) this means spokes move ≈7 km N/S and
  //   ≈12 km E/W, exposing fresh territory beyond any 5-km police cluster.
  //
  //   Spokes navigate to ABSOLUTE geo-coordinates (jsSetView with hub offsets)
  //   — no cumulative drift. jsSetView now returns viewport bounds so each
  //   spoke confirms the map actually moved.
  async function scanTile(t, idx, total) {
    const label      = t.name || String(idx);
    const before     = found.size;
    const okBefore   = rl.ok;
    const startMs    = Date.now();
    const targetZoom = Math.max(1, CONFIG.startZoom - CONFIG.zoomOutClicks);
    let   failed     = false;
    rl.recentBlocks  = 0;

    const dirLabel = (nx, ny) => {
      const v = ny < 0 ? 'N' : ny > 0 ? 'S' : '';
      const h = nx < 0 ? 'W' : nx > 0 ? 'E' : '';
      return (v + h) || 'C';
    };

    const bboxStr = (b) => b ? `N:${b.n.toFixed(4)} S:${b.s.toFixed(4)} E:${b.e.toFixed(4)} W:${b.w.toFixed(4)}` : '';

    async function moveAndLog(tag, respIdxBefore, snap) {
      await waitForGeoRss(snap, CONFIG.tileWaitMs);
      for (const r of rl.responses.slice(respIdxBefore)) {
        const mark    = r.police > 0 ? '  <--' : '';
        const bbox    = r.bbox ? ` [${bboxStr(r.bbox)}]` : '';
        console.log(`    ${label} ${tag}: alerts:${r.alerts} police:${r.police}${bbox}${mark}`);
      }
    }

    try {
      // ── 1. Navigate to tile centre ──────────────────────────────────
      const alreadyOnWaze = !page.isClosed() && page.url().includes('waze.com/');
      let viewBounds = null;   // { n, s, e, w } when Leaflet exposes it; null otherwise
      let centreOk   = false;  // true when navigation actually fired

      if (alreadyOnWaze) {
        const jsResult = await jsSetView(t.lat, t.lon, targetZoom);
        if (jsResult !== null) {
          centreOk = true;
          if (typeof jsResult === 'object') viewBounds = jsResult;
        }
      }

      if (!centreOk) {
        const url = `https://www.waze.com/bg/live-map?lat=${t.lat}&lon=${t.lon}&zoom=${targetZoom}`;
        let loaded = false;
        for (let attempt = 1; attempt <= 2 && !loaded; attempt++) {
          try {
            await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 35000 });
            loaded = true;
          } catch (navErr) {
            if (attempt === 2) throw navErr;
            console.log(`  ${label}: load retry (${navErr.message.split('\n')[0]})`);
            await jitter(5000, 2000);
          }
        }
        await withTimeout(page.bringToFront(), 8000, 'bringToFront');
        try { await page.waitForSelector('.leaflet-tile-loaded', { timeout: 12000 }); } catch {}
        await doZoomOut();
        viewBounds = await getMapBounds();
        centreOk = true;
      }

      // ── 2. Wait for initial (centre) georss and log it ──────────────
      const initSnap  = snapRl();
      const initRespI = rl.responses.length;
      await waitForGeoRss(initSnap, CONFIG.tileWaitMs + 3000);
      await jitter(300, 400);
      for (const r of rl.responses.slice(initRespI)) {
        const mark = r.police > 0 ? '  <--' : '';
        const bbox  = r.bbox ? ` [${bboxStr(r.bbox)}]` : '';
        console.log(`    ${label} [centre]: alerts:${r.alerts} police:${r.police}${bbox}${mark}`);
      }

      // Use centre georss bbox as fallback viewport bounds when Leaflet didn't expose them.
      // The georss bbox tracks the actual scanned area, so it's the ground truth.
      if (!viewBounds && rl.responses.length > initRespI) {
        viewBounds = rl.responses[initRespI].bbox || null;
      }

      // ── 3. Early bail if hard-blocked ────────────────────────────────
      if (rl.recentBlocks > 0 && rl.ok === okBefore) {
        const elapsed = ((Date.now() - startMs) / 1000).toFixed(0);
        console.log(
          `  [${idx}/${total}] ${label}: +0` +
          ` | georss OK:0 BLOCKED:${rl.recentBlocks} | time:${elapsed}s [skipped - blocked]`,
        );
        return { gained: 0, blocked: rl.recentBlocks, failed: false, tileOk: 0 };
      }

      // ── 4. Compute adaptive spoke step distances ─────────────────────
      // Use actual Leaflet viewport bounds (from jsSetView / getMapBounds).
      // Fallback: derive from the Web Mercator mpp formula (same as draggedCenter).
      const patternCfg = CONFIG.dragPatterns[t.drags || CONFIG.defaultDrags]
                      || CONFIG.dragPatterns.standard;
      const coverage   = patternCfg.coverage ?? 0.7;

      let stepLat, stepLon;
      if (viewBounds) {
        stepLat = (viewBounds.n - viewBounds.s) * coverage;
        stepLon = (viewBounds.e - viewBounds.w) * coverage;
        const hKm = ((viewBounds.n - viewBounds.s) * 111.32).toFixed(1);
        const wKm = ((viewBounds.e - viewBounds.w) * 111.32 * Math.cos(t.lat * Math.PI / 180)).toFixed(1);
        const sH  = (stepLat * 111.32).toFixed(1);
        const sW  = (stepLon * 111.32 * Math.cos(t.lat * Math.PI / 180)).toFixed(1);
        console.log(`    ${label}: viewport ${wKm}×${hKm}km → step ${sW}×${sH}km (${Math.round(coverage * 100)}% coverage)`);
      } else {
        // No bounds from Leaflet AND no georss response yet (very first navigation or blocked).
        // Use a conservative fixed step: 0.05° lat (≈5.5km) and 0.08° lon (≈5km at lat 43°).
        stepLat = 0.05;
        stepLon = 0.08;
        console.log(`    ${label}: viewport unknown — using fixed step ~5.5km×5km`);
      }

      // ── 5. Star coverage ─────────────────────────────────────────────
      sh.dragsSuspended = false;
      let spokeNum = 0;

      for (const [nx, ny] of patternCfg.spokes) {
        if (healthCheck() === 'stop_tile') {
          console.log(`    ${label}: [health] block ratio >40% -- aborting tile`);
          break;
        }
        if (healthCheck() === 'slow' && !sh.dragsSuspended) {
          sh.dragsSuspended = true;
          console.log(`    ${label}: [health] block ratio >20% (window -- spokes continue)`);
        }
        if (rl.recentBlocks >= 3) {
          console.log(`    ${label}: rate-limited (${rl.recentBlocks} blocks), stopping`);
          break;
        }

        // Absolute geo-coordinates for this spoke (no cumulative drift).
        const spokeLat = t.lat + ny * stepLat;
        const spokeLon = t.lon + nx * stepLon;

        const dist = await nearestRoadDistance(spokeLat, spokeLon);
        if (dist > CONFIG.skipRoadlessMeters) {
          console.log(`    ${label}: skip [${dirLabel(nx,ny)}] no road ~${Math.round(dist)}m`);
          continue;
        }

        spokeNum++;
        const tag   = `[${spokeNum} ${dirLabel(nx, ny)}]`;
        const snap  = snapRl();
        const respI = rl.responses.length;

        const jsResult = await jsSetView(spokeLat, spokeLon, targetZoom);
        if (jsResult === null) {
          console.log(`    ${label} ${tag}: jsSetView failed, skipping spoke`);
          continue;
        }

        await moveAndLog(tag, respI, snap);
        await jitter(CONFIG.betweenActionMs, 400);
      }

      // Final settle.
      await jitter(600, 400);

      if (rl.recentBlocks > 0) {
        const extraMs = CONFIG.betweenActionMs * 2 + Math.floor(Math.random() * 3000);
        console.log(`    ${label}: [health] +${(extraMs / 1000).toFixed(0)}s recovery (${rl.recentBlocks} blocks this tile)`);
        await sleep(extraMs);
      }

    } catch (e) {
      failed = true;
      console.log(`  ${label} failed: ${e.message.split('\n')[0]}`);
    }

    const gained  = found.size - before;
    const tileOk  = rl.ok - okBefore;
    const blocked = rl.recentBlocks;
    const elapsed = ((Date.now() - startMs) / 1000).toFixed(0);

    console.log(
      `  [${idx}/${total}] ${label}: +${gained}` +
      ` | georss OK:${tileOk} BLOCKED:${blocked} | time:${elapsed}s`,
    );
    return { gained, blocked, failed, tileOk };
  }

  // ── Main pass ──
  let i = 0;
  let consecutiveBlockedTiles = 0;
  const retryQueue = [];
  // Locations that did NOT pass cleanly (failed/blocked-with-no-data/unscanned).
  const problemNames = new Set();
  for (const t of tiles) {
    i++;
    const { gained, blocked, failed, tileOk } = await scanTile(t, i, tiles.length);
    const bad = failed || (blocked > 0 && gained === 0);
    if (bad) problemNames.add(t.name);
    // Retry only if: navigation failed (worth retrying) OR had some georss OK but still
    // gained nothing (intermittent block, 60s cooldown may help).
    // Skip hard-blocked tiles (tileOk=0, not failed) -- an IP-level block won't
    // resolve in 60 seconds, and retrying just wastes quota.
    if (failed || (bad && tileOk > 0)) retryQueue.push(t);

    // Update health block history (cap at 30 tiles).
    sh.tileBlockHistory.push(blocked);
    if (sh.tileBlockHistory.length > 30) sh.tileBlockHistory.shift();

    // Escalating block trend → 5-minute recovery pause before continuing.
    if (checkBlockTrend()) {
      const trendWindow = sh.tileBlockHistory.slice(-5).join(',');
      console.log(`  [health] Escalating block trend (last 5: ${trendWindow} blocks) -- pausing 5min for rate-limit recovery...`);
      sh.tileBlockHistory = []; // reset so we don't re-trigger immediately after the pause
      await sleep(5 * 60 * 1000);
    }

    // If the debug Chrome / tab was closed mid-run, every further tile would
    // just throw. Stop gracefully: mark the rest unresolved and bail.
    if (page.isClosed()) {
      collectProblem = collectProblem || 'Debug Chrome / tab closed during the run -- keep it open the whole time. Stopped early.';
      console.log(`  ${collectProblem}`);
      for (const rest of tiles.slice(i)) problemNames.add(rest.name);
      break;
    }

    if (blocked > 0) {
      consecutiveBlockedTiles = gained === 0 ? consecutiveBlockedTiles + 1 : 0;
      const backoffMs = Math.min(CONFIG.maxBackoffMs, CONFIG.backoffBaseMs * blocked);
      console.log(`  (Waze backoff: ${(backoffMs / 1000).toFixed(0)}s)`);
      await sleep(backoffMs); // plain timer -- never throws if page closed
      if (consecutiveBlockedTiles >= CONFIG.giveUpAfterBlockedTiles) {
        console.log(`  [stop] Waze consistently blocking (${consecutiveBlockedTiles} in a row). Ending main pass.`);
        // Mark everything not yet scanned as unresolved (so the run reports
        // "incomplete"), but do NOT re-queue it for a same-session retry: Waze
        // is clearly throttling this IP right now, and hammering it again would
        // only deepen the block. The next scheduled cycle (fresh quota) fills
        // these in. This also keeps a blocked run SHORT instead of grinding
        // through 15 doomed retries with long back-offs.
        for (const rest of tiles.slice(i)) problemNames.add(rest.name);
        break;
      }
    } else {
      consecutiveBlockedTiles = 0;
    }

    // Mid-batch breather (cities: 3 min between the first 10 and the next 10),
    // so Waze's per-IP rate budget recovers before the second half of the scan.
    if (midPauseAfter > 0 && i === midPauseAfter && i < tiles.length) {
      console.log(`Mid-batch pause: waiting ${(midPauseMs / 1000).toFixed(0)}s after the first ${midPauseAfter} locations...`);
      await sleep(midPauseMs);
    }
  }

  // ── Retry pass for blocked/failed locations, after a longer cooldown ──
  // BUT: if this is a HARD block (nothing found AND we were being 403'd), the
  // whole session is blocked right now — a quick retry just re-hits the block.
  // Skip it entirely; the next SCHEDULED cycle is the real (big) cooldown.
  const hardBlocked = found.size === 0 && rl.totalBlocks > 0;
  if (hardBlocked) {
    console.log('Hard block (0 found, all requests 403) -- skipping the quick retry pass; waiting for the next scheduled cycle.');
  } else if (retryQueue.length && !page.isClosed()) {
    console.log(`Retry pass: ${retryQueue.length} location(s) -- waiting ${(CONFIG.retryCooldownMs / 1000).toFixed(0)}s cooldown...`);
    await sleep(CONFIG.retryCooldownMs);
    console.log('  (cooldown done, starting retry scans)');
    let j = 0;
    for (const t of retryQueue) {
      if (page.isClosed()) { console.log('  (debug Chrome closed -- ending retry pass)'); break; }
      const { gained, blocked, failed } = await scanTile(t, ++j, retryQueue.length);
      if (!failed && !(blocked > 0 && gained === 0)) problemNames.delete(t.name); // resolved on retry
      if (blocked > 0) {
        const retryBackoffMs = Math.min(CONFIG.maxBackoffMs, CONFIG.backoffBaseMs * blocked);
        console.log(`  (retry backoff: ${(retryBackoffMs / 1000).toFixed(0)}s)`);
        await sleep(retryBackoffMs);
      }
    }
  }
  unresolvedTiles = [...problemNames];
  if (unresolvedTiles.length) console.log(`Incomplete: ${unresolvedTiles.length} location(s) did not pass cleanly: ${unresolvedTiles.join(', ')}.`);
  if (found.size === 0) collectProblem = collectProblem || 'Collected 0 police (possible heavy rate-limiting).';
  {
    const totalReqs  = sh.totalOk + sh.total403 + sh.total429;
    const blockRatio = totalReqs > 0
      ? ((sh.total403 + sh.total429) / totalReqs * 100).toFixed(0)
      : 0;
    const elapsedMin = ((Date.now() - sh.runStartMs) / 60000).toFixed(1);
    const mpm        = elapsedMin > 0 ? (found.size / Number(elapsedMin)).toFixed(1) : '0';
    console.log(
      `[health] georss total:${totalReqs} OK:${sh.totalOk} 403:${sh.total403}` +
      ` 429:${sh.total429} (${blockRatio}% blocked)` +
      ` | ${found.size} markers in ${elapsedMin}min (${mpm}/min)`,
    );
  }

  try { await page.close(); } catch {}     // close our tab so they don't pile up each run
  try { await ctx.close();  } catch {}     // discard incognito context + all its cookies
  try { await browser.close(); } catch {}  // disconnect CDP (does NOT kill your Chrome)
  const list = [...found.values()];
  console.log(`Waze: ${list.length} unique POLICE markers.`);
  return list;
}

// ---------------------- 2. TESRADAR CLIENT ------------------------
const trHeaders = () => ({
  'Authorization': `Bearer ${CONFIG.tesradarSecret}`,
  'Content-Type': 'application/json',
});

async function trListEvents() {
  const r = await fetch(`${CONFIG.tesradarBase}/api/admin/events`, { headers: trHeaders() });
  if (!r.ok) throw new Error(`TesRadar list failed: ${r.status}`);
  const d = await r.json();
  return Array.isArray(d) ? d : (d.events || d.data || []);
}

async function trAddPolice(lat, lng, id) {
  const payload = {
    type: POLICE_TYPE,
    lat, lng,
    description: `${TAG}:${id}`, // lets us recognise & dedup our own markers
  };
  if (markerTtlMs) payload.ttlMs = markerTtlMs; // NL/BE live longer (4h15m) than BG default (2h15m)
  const r = await fetch(`${CONFIG.tesradarBase}/api/admin/events`, {
    method: 'POST', headers: trHeaders(), body: JSON.stringify(payload),
  });
  if (!r.ok) throw new Error(`TesRadar add failed: ${r.status}`);
}

// Distance (m) from a point to the nearest drivable road (OSRM). Returns 0 on
// error so a hiccup never causes us to wrongly skip a scan.
async function nearestRoadDistance(lat, lon) {
  try {
    const r = await fetchT(`https://router.project-osrm.org/nearest/v1/driving/${lon},${lat}?number=1`, {}, 10000);
    const d = await r.json();
    const w = d.waypoints && d.waypoints[0];
    return w ? w.distance : 0;
  } catch { return 0; }
}

// Approx map centre after dragging the view by (dx,dy) pixels at a given zoom.
// Used to detect drags that land on water/forest (no roads) and skip them.
function draggedCenter(lat, lon, dx, dy, zoom) {
  const latRad = (lat * Math.PI) / 180;
  const mpp = (156543.03392 * Math.cos(latRad)) / Math.pow(2, zoom); // metres per pixel
  return {
    lat: lat + (dy * mpp) / 111320,
    lon: lon - (dx * mpp) / (111320 * Math.cos(latRad)),
  };
}

// Snap a coordinate to the nearest drivable road (OSRM public server).
// Returns:
//   { lat, lng }            -> snapped onto the road
//   { lat, lng, kept:true } -> OSRM error/unreachable: keep ORIGINAL coords
//                              (Waze police are already reported on roads, so a
//                              transient OSRM/network hiccup must NOT drop them)
//   null                    -> OSRM explicitly says nearest road > maxSnapMeters
//                              (genuine off-road noise -> drop)
async function snapToRoad(lat, lon) {
  try {
    const r = await fetchT(`https://router.project-osrm.org/nearest/v1/driving/${lon},${lat}?number=1`, {}, 10000);
    if (!r.ok) return { lat, lng: lon, kept: true };
    const d = await r.json();
    const w = d.waypoints && d.waypoints[0];
    if (!w) return { lat, lng: lon, kept: true };
    if (w.distance > CONFIG.maxSnapMeters) return null; // explicitly far from any road
    return { lat: w.location[1], lng: w.location[0] };
  } catch {
    return { lat, lng: lon, kept: true }; // network/OSRM down -> keep original
  }
}

async function trDelete(id) {
  const r = await fetch(`${CONFIG.tesradarBase}/api/admin/events?id=${encodeURIComponent(id)}`, {
    method: 'DELETE', headers: trHeaders(),
  });
  if (!r.ok) throw new Error(`TesRadar delete failed: ${r.status}`);
}

// --------------------------- 3. SYNC ------------------------------
async function main() {
  if (CONFIG.tesradarSecret.includes('PUT_YOUR')) {
    console.error('Set TESRADAR_SECRET (env var) or edit CONFIG.tesradarSecret.');
    process.exit(1);
  }

  // Which group to scan: node sync.mjs <group>  (cities | route | all). Default: all.
  const arg = (process.argv[2] || 'all').toLowerCase();
  let tiles;
  if (arg === 'all') tiles = [...CONFIG.groups.cities, ...CONFIG.groups.route];
  else if (CONFIG.groups[arg]) tiles = [...CONFIG.groups[arg]];
  else { console.error(`Unknown group "${arg}". Use: ${Object.keys(CONFIG.groups).join(' | ')} | all`); process.exit(1); }

  // Shuffle so Waze never sees the same scan sequence twice.
  for (let i = tiles.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [tiles[i], tiles[j]] = [tiles[j], tiles[i]];
  }
  console.log(`Group: ${arg} (${tiles.length} locations). Order: ${tiles.map(t => t.name).join(', ')}`);
  try {
    const ipResp = await fetch('https://api.ipify.org?format=json');
    const { ip } = await ipResp.json();
    console.log(`Outbound IP: ${ip}`);
  } catch { console.log('Outbound IP: (lookup failed)'); }

  // NL/BE now sync once a day (04:00), so their markers must survive until the
  // next scan: 25h = 24h + 1h buffer (no gap before the next 04:00 run).
  // BG (cities/route) keeps the server default (2h15m) by leaving markerTtlMs null.
  markerTtlMs = (arg === 'nl' || arg === 'be') ? 25 * 60 * 60 * 1000 : null; // 25 hours

  // Cities (20 locations): 3-minute breather between the first 10 and the next 10.
  if (arg === 'cities') { midPauseAfter = 10; midPauseMs = 3 * 60 * 1000; }

  // Jitter: random 0..jitterMaxMin minutes, so staggered tasks don't hit Waze
  // at the exact same clock minute every cycle.
  if (CONFIG.jitterMaxMin > 0) {
    const ms = Math.floor(Math.random() * CONFIG.jitterMaxMin * 60_000);
    console.log(`Jitter: waiting ${(ms / 1000).toFixed(0)}s before starting...`);
    await sleep(ms);
  }

  const wazeRaw = await collectWazePolice(tiles);

  // ---- snap every point to the nearest road (ON-ROAD GUARANTEE) ----
  // A police alert must sit on the road, never off it. We snap each Waze
  // coordinate to the nearest drivable way; anything farther than
  // maxSnapMeters from a road is discarded as noise.
  const waze = [];
  let keptOrig = 0;
  for (const p of wazeRaw) {
    const s = await snapToRoad(p.lat, p.lon);
    if (!s) continue;            // OSRM says explicitly off-road -> drop
    if (s.kept) keptOrig++;       // OSRM hiccup -> kept original (still on road)
    waze.push({ id: p.id, lat: s.lat, lng: s.lng });
    await sleep(120);             // be gentle on the public OSRM server
  }
  console.log(`On-road after snapping: ${waze.length}/${wazeRaw.length}${keptOrig ? ` (${keptOrig} kept original coords - OSRM hiccup)` : ''}.`);

  let existing;
  try {
    existing = await trListEvents();
  } catch (e) {
    collectProblem = `TesRadar unreachable (${e.message.split('\n')[0]}) - nothing posted this run.`;
    console.log(`  ${collectProblem}`);
    return { added: 0, found: wazeRaw.length, onRoad: waze.length, alert: { subject: 'WazeSync: TesRadar unreachable', body: collectProblem } };
  }
  const existingPolice = existing.filter((e) => e.type === POLICE_TYPE);

  // Index of markers this script previously created, keyed by Waze id.
  const ours = new Map();
  for (const e of existingPolice) {
    const m = /wazesync:(.+)$/.exec(e.description || '');
    if (m) ours.set(m[1], e);
  }

  // ---- additions ----
  let added = 0, failed = 0;
  for (const p of waze) {
    if (ours.has(p.id)) continue; // already mirrored
    // skip if a police marker already sits right here (manual or other)
    const near = existingPolice.some(
      (e) => haversine(p.lat, p.lng, e.lat, e.lng) <= CONFIG.dedupMeters
    );
    if (near) continue;
    try {
      await trAddPolice(p.lat, p.lng, p.id);
      existingPolice.push({ type: POLICE_TYPE, lat: p.lat, lng: p.lng }); // avoid intra-run dupes
      added++;
    } catch (e) {
      failed++;
      if (failed <= 3) console.log(`  add failed: ${e.message.split('\n')[0]}`);
    }
  }
  if (failed) console.log(`  ${failed} additions failed (network?).`);

  // ---- removals (optional) ----
  let removed = 0;
  if (CONFIG.removeStale) {
    const liveIds = new Set(waze.map((p) => p.id));
    for (const [id, e] of ours) {
      if (!liveIds.has(id)) {
        await trDelete(e.id);
        removed++;
      }
    }
  }

  console.log(`Done. Added ${added}, removed ${removed}, Waze on-road total ${waze.length}.`);

  // Decide whether to raise an email alert.
  let alert = null;
  if (collectProblem) {
    alert = { subject: 'WazeSync: sync problem', body: `${collectProblem}\n\nAdded ${added}, found ${wazeRaw.length} police.` };
  } else if (CONFIG.email.alertOnZero && wazeRaw.length === 0) {
    alert = { subject: 'WazeSync: 0 police found', body: 'The run completed but found 0 police across all cities -- possible Waze block or outage. Added 0.' };
  }
  return { added, found: wazeRaw.length, onRoad: waze.length, incomplete: unresolvedTiles.length, alert };
}

(async () => {
  let code = 0;
  // Watchdog: never let a run hang forever (e.g. an operation with no timeout
  // while the network flaps). Force-exit after the hard limit so the scheduled
  // task returns to Ready and the next run can proceed.
  const watchdog = setTimeout(() => {
    console.error('[watchdog] run exceeded the hard time limit -- force exit');
    process.exit(3);
  }, CONFIG.hardTimeoutMs);
  try {
    const r = await main();
    if (r && r.alert) {
      if (warmupThrottled) {
        // IP throttle: send a distinct, less alarming alert — but only once per
        // 90-minute quiet window so the inbox isn't flooded by repeated runs.
        const ageMin = Math.round(_throttleAge() / 60000);
        if (_throttleAge() < _QUIET_MS) {
          console.warn(`  [alert suppressed] IP throttle ongoing -- already notified ${ageMin}min ago (quiet for 90min)`);
        } else {
          const subj = 'WazeSync: IP throttled (temporary, ~60min)';
          const body = r.alert.body +
            '\n\nThis is a Waze IP-level rate-limit, NOT a Chrome session issue.' +
            '\nIt typically resolves in 30-60min without any manual action.';
          console.warn(`  [alert] ${subj}`);
          await sendAlert(subj, body);
          _markThrottle();
        }
      } else {
        // Real sync problem — send the normal alert and reset throttle memory
        // so the next IP throttle gets a fresh first-notification.
        _clearThrottle();
        console.warn(`  [alert] ${r.alert.subject}`);
        await sendAlert(r.alert.subject, r.alert.body);
      }
      code = 2; // ran, but flagged a problem
    } else {
      // Clean run — clear throttle memory so the next throttle notifies again.
      _clearThrottle();
    }
    // Some locations didn't pass cleanly → signal "incomplete" so the chain
    // re-runs the priority group. (Exit 4; no e-mail — the chain handles it.)
    if (r && r.incomplete > 0 && code === 0) code = 4;
  } catch (e) {
    console.error(e);
    await sendAlert('WazeSync FAILED (crash)', String((e && e.stack) || e));
    code = 1;
  }
  clearTimeout(watchdog);
  // Make the exit code reliable: if the browser/CDP closed, Node may drain and
  // exit on its own BEFORE the unref'd timer below — without this it would exit
  // 0 even on a crash, and the chain would wrongly treat the run as "clean".
  process.exitCode = code;
  // CDP leaves a websocket handle open, so Node won't exit on its own. Calling
  // process.exit() immediately can crash libuv (UV_HANDLE_CLOSING), so wait a
  // moment for the transport to finish closing, then hard-exit. .unref() lets
  // Node exit earlier if all handles already closed cleanly.
  setTimeout(() => process.exit(code), 1500).unref();
})();
