/**
 * RiskEngine — tracks a 0-100 risk score for sync session health.
 *
 * Score starts at 100 (healthy). Each signal applies a delta.
 * The score is clamped to [0, 100].
 *
 * Modes (used to adjust sync behaviour):
 *   NORMAL  70-100  — full speed
 *   SLOW    40-69   — increase inter-request delay
 *   LIMITED 20-39   — run only one tile group
 *   BLOCK   0-19    — refuse to run
 */

export const SIGNALS = {
  success:        +1,
  slow_response:  -5,
  http_403:      -40,
  captcha:       -60,
  warmup_blocked:-50,
  partial:        -5,   // exit code 4 (incomplete run)
};

const MODES = [
  { min: 0,  max: 19,  label: 'BLOCK' },
  { min: 20, max: 39,  label: 'LIMITED' },
  { min: 40, max: 69,  label: 'SLOW' },
  { min: 70, max: 100, label: 'NORMAL' },
];

export const RiskEngine = {
  /**
   * Apply a named signal to the current score.
   * Returns the new clamped score.
   */
  applySignal(score, signal) {
    const delta = SIGNALS[signal] ?? 0;
    return Math.max(0, Math.min(100, (score ?? 100) + delta));
  },

  /** Return the mode label for a given score. */
  getMode(score) {
    for (const { min, max, label } of MODES) {
      if (score >= min && score <= max) return label;
    }
    return 'NORMAL';
  },
};
