/**
 * WazeGuard — protective layer around teslanav.com / Waze sync runs.
 *
 * Reads / writes storage/waze-health.json.
 * Called from sync.mjs at the start and end of every run.
 *
 * check()    — decide whether to allow the run (called at start of main())
 * afterRun() — record the run result and update state (called before process.exit)
 */

import { readFileSync, writeFileSync, appendFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { CircuitBreaker } from './CircuitBreaker.js';
import { RiskEngine } from './RiskEngine.js';

const __dir   = dirname(fileURLToPath(import.meta.url));
const STORAGE = join(__dir, '..', 'storage');
const HEALTH  = join(STORAGE, 'waze-health.json');
const EVENTS  = join(STORAGE, 'sync-events.jsonl');

// Adaptive cooldown per block count today (index 0 = first block, etc.)
const COOLDOWN_MS = [
  60  * 60 * 1000,  // 1st block:  60 min
  120 * 60 * 1000,  // 2nd block: 120 min
  240 * 60 * 1000,  // 3rd+ block: 240 min
];

function cooldownForCount(n) {
  return COOLDOWN_MS[Math.min(n - 1, COOLDOWN_MS.length - 1)] ?? COOLDOWN_MS.at(-1);
}

// ── Persistence ──────────────────────────────────────────────────────────────

function readHealth() {
  try {
    return JSON.parse(readFileSync(HEALTH, 'utf8'));
  } catch {
    return {
      status:              'healthy',
      circuitState:        'CLOSED',
      riskScore:           100,
      blocked:             false,
      blockedAt:           null,
      cooldownUntil:       null,
      blockCountToday:     0,
      lastBlockDay:        null,
      lastSuccessfulRun:    null,
      lastFailure:          null,
      lastPassiveRecovery:  null,
      hourlyLimit:          0,   // 0 = disabled; circuit breaker handles Waze throttle
      dailyLimit:           0,   // 0 = disabled
      currentHourRequests: 0,
      todayRequests:       0,
      lastHourReset:       null,
      lastDayReset:        null,
    };
  }
}

function writeHealth(h) {
  try {
    mkdirSync(STORAGE, { recursive: true });
    writeFileSync(HEALTH, JSON.stringify(h, null, 2));
  } catch (e) {
    console.warn(`[WazeGuard] cannot write health: ${e.message}`);
  }
}

function appendEvent(obj) {
  try {
    mkdirSync(STORAGE, { recursive: true });
    appendFileSync(EVENTS, JSON.stringify(obj) + '\n');
  } catch { /* best-effort */ }
}

// ── Date helpers ─────────────────────────────────────────────────────────────

const todayStr = () => new Date().toISOString().slice(0, 10);   // "2026-07-26" UTC date
const thisHour = () => new Date().toISOString().slice(0, 13);   // "2026-07-26T21" UTC hour

// Format a UTC ISO timestamp as LOCAL time (so "Resume after" matches the wall clock).
function fmtResume(iso) {
  const d   = new Date(iso);
  const pad = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// Passive recovery: +1 per hour since last recovery (or last failure), capped at 60.
// Prevents permanent lockout when a burst of blocks drives the score to BLOCK territory.
// Recovery is capped at 60 (SLOW mode) — reaching NORMAL requires a successful run.
function applyPassiveRecovery(h, now = Date.now()) {
  if (!h.lastFailure) return;
  const baseline    = h.lastPassiveRecovery ?? h.lastFailure;
  const msSince     = now - new Date(baseline).getTime();
  const hoursElapsed = Math.floor(msSince / (60 * 60 * 1000));
  if (hoursElapsed <= 0) return;
  const gain    = Math.min(hoursElapsed, 10); // max +10 per recovery window
  const before  = h.riskScore ?? 100;
  h.riskScore   = Math.min(Math.max(before, 0) + gain, 60); // passive ceiling: 60
  h.lastPassiveRecovery = new Date(now).toISOString();
  if (h.riskScore !== before)
    console.log(`[WazeGuard] Passive recovery +${gain} (${hoursElapsed}h elapsed) → risk ${h.riskScore}/100`);
}

// ── Public API ────────────────────────────────────────────────────────────────

export const WazeGuard = {
  /**
   * Pre-run check. Returns:
   *   { allow: true,  mode: 'NORMAL'|'SLOW'|'LIMITED'|'BLOCK', riskScore }
   *   { allow: false, reason: string, resumeAfter: string }
   *
   * Exits process with code 3 if called inside main() when blocked — the caller
   * is expected to handle the returned object and call process.exit(3) itself.
   */
  async check(group = 'all') {
    const h   = readHealth();
    const now = Date.now();

    // ── Reset daily counters at midnight ──────────────────────────────────
    const today = todayStr();
    if (h.lastBlockDay !== today)   { h.blockCountToday = 0; h.lastBlockDay = today; }
    if (h.lastDayReset !== today)   { h.todayRequests = 0;   h.lastDayReset = today; }
    const hour = thisHour();
    if (h.lastHourReset !== hour)   { h.currentHourRequests = 0; h.lastHourReset = hour; }

    // ── Circuit breaker check ─────────────────────────────────────────────
    const state = CircuitBreaker.getState(h);

    if (state === 'OPEN') {
      const cooldownUntil = h.cooldownUntil ? new Date(h.cooldownUntil).getTime() : 0;
      if (now < cooldownUntil) {
        // Still in cooldown — apply passive recovery while waiting, then skip.
        applyPassiveRecovery(h, now);
        writeHealth(h);
        const resumeStr = fmtResume(h.cooldownUntil);
        return { allow: false, reason: 'active cooldown', resumeAfter: resumeStr };
      }
      // Cooldown expired → HALF_OPEN.
      // Apply passive recovery before the test run, then BYPASS the risk check:
      // HALF_OPEN's sole purpose is a recovery test — blocking it here causes
      // permanent lockout if the risk score is critically low.
      h.circuitState = 'HALF_OPEN';
      h.status       = 'recovering';
      h.blocked      = false;
      applyPassiveRecovery(h, now);
      const halfScore = h.riskScore ?? 100;
      console.log(`[SyncGuard] Cooldown expired. Circuit: HALF_OPEN — one test run allowed. Risk: ${halfScore}/100`);
      writeHealth(h);
      return { allow: true, mode: RiskEngine.getMode(halfScore), riskScore: halfScore, halfOpen: true };
    }

    // ── Already HALF_OPEN ─────────────────────────────────────────────────
    // The previous test run failed with a non-block exit code (1 or 4), which
    // does NOT reset circuitState back to OPEN — leaving it stuck here.
    // Without this branch, check() falls through to the risk gate and blocks
    // the run permanently (risk=3/100 → BLOCK mode → "after manual reset").
    // Fix: allow the run exactly as we do when transitioning from OPEN, bypassing
    // the risk score — HALF_OPEN's purpose is recovery probing, not gating.
    if (state === 'HALF_OPEN') {
      applyPassiveRecovery(h, now);
      const halfScore = h.riskScore ?? 100;
      console.log(`[SyncGuard] Circuit HALF_OPEN — test run allowed (risk: ${halfScore}/100)`);
      writeHealth(h);
      return { allow: true, mode: RiskEngine.getMode(halfScore), riskScore: halfScore, halfOpen: true };
    }

    // ── Request budget check ──────────────────────────────────────────────
    if (h.hourlyLimit && h.currentHourRequests >= h.hourlyLimit) {
      writeHealth(h);
      return {
        allow: false,
        reason: `hourly request budget exhausted (${h.currentHourRequests}/${h.hourlyLimit})`,
        resumeAfter: 'next hour',
      };
    }
    if (h.dailyLimit && h.todayRequests >= h.dailyLimit) {
      writeHealth(h);
      return {
        allow: false,
        reason: `daily request budget exhausted (${h.todayRequests}/${h.dailyLimit})`,
        resumeAfter: 'tomorrow',
      };
    }

    // ── Risk mode (only for CLOSED circuit) ──────────────────────────────
    const mode      = RiskEngine.getMode(h.riskScore ?? 100);
    const riskScore = h.riskScore ?? 100;

    if (mode === 'BLOCK') {
      writeHealth(h);
      return {
        allow: false,
        reason: `risk score critically low (${riskScore}/100) — run: node tools/reset-guard.mjs`,
        resumeAfter: 'after manual reset',
      };
    }

    writeHealth(h);
    return { allow: true, mode, riskScore };
  },

  /**
   * Record the result of a completed run.
   *
   * @param {object} opts
   *   group           - 'cities' | 'route' | 'nl' | 'be' | 'all'
   *   warmupThrottled - true when Waze blocked on warm-up (IP throttle)
   *   code            - process exit code (0=ok, 2=problem, 4=partial)
   *   requestCount    - total georss requests made this run
   *   alertFn         - async (subject, body) => void (Resend sendAlert)
   */
  async afterRun({ group = 'all', warmupThrottled = false, code = 0, requestCount = 0, alertFn = null } = {}) {
    const h   = readHealth();
    const now = new Date().toISOString();
    const today = todayStr();
    const hour  = thisHour();

    // Reset counters if crossed midnight / hour boundary since last check()
    if (h.lastDayReset  !== today) { h.todayRequests = 0;        h.lastDayReset  = today; }
    if (h.lastHourReset !== hour)  { h.currentHourRequests = 0;  h.lastHourReset = hour; }
    if (h.lastBlockDay  !== today) { h.blockCountToday = 0;      h.lastBlockDay  = today; }

    h.currentHourRequests = (h.currentHourRequests || 0) + requestCount;
    h.todayRequests       = (h.todayRequests       || 0) + requestCount;

    const isBlock = warmupThrottled || code === 2;

    if (isBlock) {
      // ── Block / throttle ──────────────────────────────────────────────
      h.blockCountToday = (h.blockCountToday || 0) + 1;
      h.blocked         = true;
      h.blockedAt       = now;
      h.lastFailure     = now;

      const cooldownMs  = cooldownForCount(h.blockCountToday);
      const cooldownEnd = new Date(Date.now() + cooldownMs);
      h.cooldownUntil   = cooldownEnd.toISOString();
      h.circuitState    = 'OPEN';
      h.status          = 'blocked';

      const signal     = warmupThrottled ? 'warmup_blocked' : 'http_403';
      h.riskScore      = RiskEngine.applySignal(h.riskScore ?? 100, signal);

      const cooldownMin = Math.round(cooldownMs / 60000);
      const resumeStr   = fmtResume(h.cooldownUntil);

      console.log(`[SyncGuard] Block #${h.blockCountToday} today recorded.`);
      console.log(`[SyncGuard] Adaptive cooldown: ${cooldownMin}min → resume after ${resumeStr}`);
      console.log(`[SyncGuard] Circuit state: OPEN — All sync jobs suspended`);
      console.log(`[SyncGuard] Risk score: ${h.riskScore}/100`);

      // Email alert
      if (alertFn) {
        const subject = `SyncGuard: Circuit OPEN — block #${h.blockCountToday} today [${group}]`;
        const body    =
          `Sync blocked (${warmupThrottled ? 'warmup IP throttle' : 'HTTP 403'}).\n` +
          `Block #${h.blockCountToday} today. Cooldown: ${cooldownMin} min.\n` +
          `Resume after: ${resumeStr}\n` +
          `Risk score: ${h.riskScore}/100\n` +
          `Group: ${group}`;
        try { await alertFn(subject, body); } catch {}
      }

      appendEvent({
        time: now, group, code, warmupThrottled,
        blockCountToday: h.blockCountToday, cooldownMin,
        riskScore: h.riskScore, circuitState: 'OPEN',
        geoRequests: requestCount,
      });

    } else if (code === 0) {
      // ── Clean run ─────────────────────────────────────────────────────
      h.lastSuccessfulRun = now;
      h.blocked           = false;
      h.riskScore         = RiskEngine.applySignal(h.riskScore ?? 100, 'success');

      if (h.circuitState === 'HALF_OPEN') {
        h.circuitState = 'CLOSED';
        h.status       = 'healthy';
        // Ensure risk is high enough that the VERY NEXT check() won't immediately
        // re-block. A successful recovery run earns at least LIMITED mode (30).
        h.riskScore    = Math.max(h.riskScore ?? 0, 30);
        console.log(`[SyncGuard] Clean run confirmed. Circuit: CLOSED — normal operation resumed. Risk: ${h.riskScore}/100`);
      } else {
        h.circuitState = 'CLOSED';
        h.status       = 'healthy';
      }

      appendEvent({
        time: now, group, code, warmupThrottled: false,
        riskScore: h.riskScore, circuitState: h.circuitState,
        geoRequests: requestCount,
      });

    } else if (code === 4) {
      // ── Partial run ───────────────────────────────────────────────────
      h.lastFailure = now;
      h.riskScore   = RiskEngine.applySignal(h.riskScore ?? 100, 'partial');

      appendEvent({
        time: now, group, code, warmupThrottled: false,
        riskScore: h.riskScore, circuitState: h.circuitState,
        geoRequests: requestCount,
      });
    }

    // Alert when risk score drops below 80 (any non-normal situation)
    if ((h.riskScore ?? 100) <= 20 && alertFn && !isBlock) {
      try {
        await alertFn(
          `SyncGuard: Risk score critical (${h.riskScore}/100) [${group}]`,
          `Risk score dropped to ${h.riskScore}/100 after group "${group}" run.\nExit code: ${code}.`,
        );
      } catch {}
    }

    writeHealth(h);
  },
};
