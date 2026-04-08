// ─── Premium Mode Configuration ────────────────────────────────────────
//
// SINGLE SOURCE OF TRUTH for premium behavior.
// Change PREMIUM_MODE in .env to switch globally — no other files need editing.
//
// MODES
// ─────
//   off   — Everything behaves as free. All features accessible.
//            Use during development or before monetization is live.
//
//   soft  — Premium UI is visible (badges, teasers, upgrade prompts).
//            Features are NOT hard-blocked. Used for pre-launch UX testing.
//
//   full  — Premium features are actually gated. Users without access see
//            a locked/upgrade state. Ready to wire to a real entitlement
//            check (Stripe subscription status, JWT claim, etc.).
//
// HOW TO CHANGE
// ─────────────
//   In .env / .env.local:
//     VITE_PREMIUM_MODE=off     ← default (free everything)
//     VITE_PREMIUM_MODE=soft    ← show premium UI, no hard gates
//     VITE_PREMIUM_MODE=full    ← fully gated premium
//
//   In code, never read import.meta.env directly — always use getPremiumMode().
//
// CONNECTING STRIPE LATER
// ───────────────────────
//   When real subscriptions are live, replace `_userHasPremium()` in
//   featureFlags.ts with a check against the stored subscription token
//   (localStorage JWT, Stripe session, etc.). No other changes needed.

export type PremiumMode = 'off' | 'soft' | 'full'

/**
 * All premium-gated feature names.
 * Referenced by canUseFeature() and shouldShowPremiumTeaser() in featureFlags.ts.
 * Add new features here as the product grows.
 */
export type PremiumFeature =
  | 'average_speed_sections'       // speed camera section tracking
  | 'advanced_route_intelligence'  // multi-route comparison, smart detours
  | 'smart_arrival_battery'        // battery-aware ETA + charging stop suggestion
  | 'premium_voice_alerts'         // enhanced audio alerts & voice directions
  | 'saved_routes_and_favorites'   // persistent saved routes across sessions
  | 'advanced_charging_filters'    // filter by network, kW, availability

/**
 * Which features are premium-gated (vs always free).
 * In OFF mode this map is ignored — everything is accessible.
 * In SOFT/FULL mode, features listed as `true` here show premium UI.
 */
export const PREMIUM_FEATURE_MAP: Record<PremiumFeature, boolean> = {
  average_speed_sections:      true,
  advanced_route_intelligence: true,
  smart_arrival_battery:       true,
  premium_voice_alerts:        true,
  saved_routes_and_favorites:  true,
  advanced_charging_filters:   true,
}

// ── Internal: read mode from env ──────────────────────────────────────

function _resolveMode(): PremiumMode {
  const raw = import.meta.env['VITE_PREMIUM_MODE'] as string | undefined
  if (raw === 'soft' || raw === 'full') return raw
  return 'off'   // default — everything free
}

// Evaluated once at module load; stable for the lifetime of the page.
export const PREMIUM_MODE: PremiumMode = _resolveMode()
