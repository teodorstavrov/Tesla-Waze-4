/**
 * Police marker scoring.
 *
 * Formula:
 *   score = reliability * 4
 *         + confidence  * 3
 *         + min(thumbs_up * 5, 20)
 *         + freshness_bonus
 *
 * freshness_bonus = max(0, 10 - floor(age_minutes / 9))
 *
 * Result clamped to [0, 100].
 */

export interface ScoreInput {
  reliability: number;  // 0–10
  confidence: number;   // 0–10
  thumbsUp: number;
  ageSeconds: number;
}

export function calculateScore(input: ScoreInput): number {
  const { reliability, confidence, thumbsUp, ageSeconds } = input;

  const ageMinutes = ageSeconds / 60;

  const reliabilityPart = clamp(reliability, 0, 10) * 4;         // max 40
  const confidencePart  = clamp(confidence, 0, 10) * 3;          // max 30
  const thumbsPart      = Math.min(clamp(thumbsUp, 0, 9999) * 5, 20); // max 20
  const freshnessPart   = Math.max(0, 10 - Math.floor(ageMinutes / 9)); // max 10

  const raw = reliabilityPart + confidencePart + thumbsPart + freshnessPart;
  return clamp(Math.round(raw), 0, 100);
}

function clamp(value: number, min: number, max: number): number {
  if (!isFinite(value)) return min;
  return Math.min(Math.max(value, min), max);
}
