// ─── Feature Flag Helpers ──────────────────────────────────────────────
//
// The ONLY place in the app where premium gating logic lives.
// All components import from here — never from premium.ts directly.
//
// Public API
// ──────────
//   getPremiumMode()                     → 'off' | 'soft' | 'full'
//   isPremiumEnabled()                   → true when mode is soft or full
//   canUseFeature(feature)               → true if user may use this feature
//   shouldShowPremiumTeaser(feature)     → true if premium badge/teaser should render
//   shouldBlockFeature(feature)          → true if feature should be hard-locked
//
// Entitlement stub
// ────────────────
//   _userHasPremium() is the SINGLE PLACE to replace when Stripe goes live.
//   Currently returns false (no one has premium yet).
//   Replace with: check localStorage JWT / session token / API response.

import { PREMIUM_MODE, PREMIUM_FEATURE_MAP } from '@/config/premium'
import type { PremiumFeature } from '@/config/premium'

// ── Entitlement stub ──────────────────────────────────────────────────
// TODO (Stripe): replace with real subscription check.
// Example future implementation:
//   const token = localStorage.getItem('teslaradar:premium_token')
//   return token ? verifyToken(token) : false
function _userHasPremium(): boolean {
  return false   // no one has premium until payment is wired
}

// ── Public API ────────────────────────────────────────────────────────

/** Current premium mode: 'off' | 'soft' | 'full'. */
export function getPremiumMode(): typeof PREMIUM_MODE {
  return PREMIUM_MODE
}

/**
 * True when the app is running in soft or full premium mode.
 * Use this to conditionally render premium UI chrome (badges, teasers).
 */
export function isPremiumEnabled(): boolean {
  return PREMIUM_MODE !== 'off'
}

/**
 * True when the user may actually USE this feature.
 *
 * - OFF mode   → always true (free)
 * - SOFT mode  → always true (features not hard-blocked in soft mode)
 * - FULL mode  → true only if feature is free OR user has premium entitlement
 */
export function canUseFeature(feature: PremiumFeature): boolean {
  if (PREMIUM_MODE === 'off')  return true
  if (PREMIUM_MODE === 'soft') return true  // soft = teaser only, no hard block
  // FULL mode: check entitlement
  const isPremiumFeature = PREMIUM_FEATURE_MAP[feature] ?? false
  return !isPremiumFeature || _userHasPremium()
}

/**
 * True when a premium badge / teaser prompt should be shown next to a feature.
 *
 * - OFF mode   → never (don't reveal monetization until ready)
 * - SOFT mode  → yes, for all premium-flagged features (teaser UX testing)
 * - FULL mode  → yes, when user doesn't have access to the feature
 */
export function shouldShowPremiumTeaser(feature: PremiumFeature): boolean {
  if (PREMIUM_MODE === 'off') return false
  const isPremiumFeature = PREMIUM_FEATURE_MAP[feature] ?? false
  if (!isPremiumFeature) return false
  if (PREMIUM_MODE === 'soft') return true
  // FULL mode: show teaser only when user doesn't have premium
  return !_userHasPremium()
}

/**
 * True when the feature should render as a hard-locked / blocked state.
 * Only possible in FULL mode when user lacks entitlement.
 *
 * In OFF and SOFT mode this always returns false.
 */
export function shouldBlockFeature(feature: PremiumFeature): boolean {
  if (PREMIUM_MODE !== 'full') return false
  const isPremiumFeature = PREMIUM_FEATURE_MAP[feature] ?? false
  return isPremiumFeature && !_userHasPremium()
}
