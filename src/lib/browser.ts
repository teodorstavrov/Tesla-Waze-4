// ─── Browser / device detection ───────────────────────────────────────

const ua = navigator.userAgent

/** Running inside a Tesla vehicle browser (QtWebEngine-based) */
export const isTeslaBrowser: boolean =
  /Tesla/i.test(ua) || /QtWebEngine/i.test(ua)

/** Any mobile or touch-primary device */
export const isMobile: boolean =
  /Android|iPhone|iPad|iPod/i.test(ua) || navigator.maxTouchPoints > 0

/** Phone/tablet (not Tesla, identified by OS UA) */
export const isPhone: boolean =
  !isTeslaBrowser && /Android|iPhone|iPad|iPod/i.test(ua)

/** Desktop browser — not Tesla, not a phone/tablet */
export const isDesktop: boolean = !isTeslaBrowser && !isPhone

/** Passive event options — required for Tesla scroll performance */
export const PASSIVE: AddEventListenerOptions = { passive: true }

// ─── Tesla 2026.26 viewport detection ─────────────────────────────────────
//
// Tesla software 2026.26 increased the in-car Chromium browser's CSS zoom /
// device pixel ratio, shrinking the CSS viewport from ~1180×919 to ~773×601
// on HW3 hardware. The physical display size is UNCHANGED — only the CSS
// coordinate space is smaller (same as when a mobile browser zooms in).
//
// Detection uses multiple signals:
//   1. Tesla browser UA (prevents any false positives on non-Tesla devices)
//   2. CSS viewport width in the 680–900 range (old Tesla was ~1180, far outside)
//   3. CSS viewport height in the 520–720 range (old Tesla was ~919, far outside)
//
// Tolerances of ±100px on each axis accommodate:
//   • Different Tesla models (3/Y vs S/X) having slightly different viewports
//   • Future Tesla firmware making minor zoom adjustments
//
// IMPORTANT: Evaluated at module load time, BEFORE main.tsx adjusts the
// viewport meta. The small original dimensions must be captured here.

/** True on Tesla 2026.26+ where the CSS viewport is zoomed-in (small). */
export const isTesla2026Zoomed: boolean =
  isTeslaBrowser &&
  window.innerWidth  >= 680 && window.innerWidth  <= 900 &&
  window.innerHeight >= 520 && window.innerHeight <= 720

/**
 * Compute the "physical" browser viewport width in real pixels.
 * Setting <meta name="viewport" content="width=N"> where N is this value
 * makes DPR effectively 1.0 and restores the pre-2026.26 CSS layout space.
 *
 * Formula: innerWidth × devicePixelRatio ≈ physical pixels of browser area.
 * At HW3 new viewport: 773 × 1.526 ≈ 1180 (matches old innerWidth exactly).
 */
export const TESLA_COMPAT_VIEWPORT_W: number = isTesla2026Zoomed
  ? Math.round(window.innerWidth * window.devicePixelRatio)
  : window.innerWidth
