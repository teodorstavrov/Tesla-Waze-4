// ─── Battery Degradation Utilities ──────────────────────────────────────
//
// Degradation reduces usable pack capacity over time.
// It does NOT directly increase consumption per km — it only shrinks
// the available energy bucket (fewer kWh to start with).
//
// Source: Recurrent Auto survey 2023, Tesla owner community data.
// Conservative model: slightly higher than statistical average so the
// app never over-promises range.

/**
 * Estimate degradation % from vehicle manufacturing year if the user
 * didn't provide one. ~2%/year for first 5 years, ~1.5%/year after, max 25%.
 */
export function estimateDegradation(yearOfManufacture: number): number {
  const age = Math.max(0, new Date().getFullYear() - yearOfManufacture)
  if (age === 0) return 0
  const deg = age <= 5 ? age * 2 : 10 + (age - 5) * 1.5
  return Math.min(Math.round(deg), 25)
}

/**
 * Apply degradation percentage to nominal usable kWh.
 */
export function applyDegradation(nominalUsableKwh: number, degradPct: number): number {
  return nominalUsableKwh * (1 - degradPct / 100)
}

/**
 * Get effective usable kWh for a pack, accounting for degradation.
 * If degradationPercent is null, falls back to age-based estimate.
 */
export function getEffectiveUsableKwh(
  nominalUsableKwh: number,
  degradationPercent: number | null,
  yearOfManufacture: number,
): number {
  const deg = degradationPercent ?? estimateDegradation(yearOfManufacture)
  return applyDegradation(nominalUsableKwh, deg)
}
