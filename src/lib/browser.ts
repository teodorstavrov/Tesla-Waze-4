// ─── Browser / device detection ───────────────────────────────────────

const _ua = navigator.userAgent

// ─── Tesla 2026.26 zoomed-viewport fingerprint ────────────────────────────
//
// After Tesla software 2026.26, the built-in Chromium browser increased its
// device pixel ratio from ~1.0 to ~1.53, shrinking the CSS viewport from
// ~1180×919 to ~773×601. The PHYSICAL display is unchanged; only the CSS
// pixel density changed.
//
// Critically: the UA string does NOT contain "Tesla" or "QtWebEngine" in
// 2026.26+. Real measured values on Model 3 HW3 after 2026.26:
//
//   innerWidth:            773     innerHeight:           601
//   screen.width:         1254     screen.height:         784
//   devicePixelRatio:    1.530
//   visualViewport.scale: 1.000   (NOT a user zoom — DPR change only)
//   UA: Mozilla/5.0 (X11; Linux x86_64) ... Chrome/148.0.0.0 Safari/537.36
//
// We use a CONFIDENCE-BASED multi-signal detector. Each signal contributes
// a weighted score. Score >= 9/14 = isTesla2026Zoomed.
// This tolerates small variations across Tesla models (3/Y vs S/X vs CT).

export interface TeslaZoomedSignals {
  score:       number
  maxScore:    number
  confidence:  number    // 0-100
  matched:     string[]  // human-readable descriptions of signals that fired
  unmatched:   string[]  // signals that did NOT fire (for debugging)
}

function _computeZoomedSignals(): TeslaZoomedSignals {
  const dpr = window.devicePixelRatio
  const iw  = window.innerWidth
  const ih  = window.innerHeight
  const sw  = screen.width
  const sh  = screen.height
  const vvs = window.visualViewport?.scale ?? 1

  const matched:   string[] = []
  const unmatched: string[] = []
  let score = 0

  function chk(pts: number, label: string, ok: boolean) {
    if (ok) { score += pts; matched.push(label) }
    else     { unmatched.push(label) }
  }

  // Total max = 14 points
  // ──────────────────────────────────────────────────────────────────────────
  // [2] DPR in the 2026.26 zoom range
  //     Tesla 2026.26: 1.530. Windows 125%=1.25, 150%=1.5, 175%=1.75 (round).
  //     Range 1.45–1.65 covers Tesla while excluding standard Windows values.
  chk(2, `DPR ${dpr.toFixed(3)} in range 1.45–1.65`,
    dpr >= 1.45 && dpr <= 1.65)

  // [2] CSS viewport width characteristic of Tesla HW3 post-2026.26
  chk(2, `innerWidth ${iw}px in range 700–850`,
    iw >= 700 && iw <= 850)

  // [2] CSS viewport height characteristic of Tesla HW3 post-2026.26
  chk(2, `innerHeight ${ih}px in range 520–680`,
    ih >= 520 && ih <= 680)

  // [1] Physical screen width (screen.width = physical / DPR, reported as CSS px)
  //     Tesla 1920-wide display at DPR 1.53: 1920/1.53 ≈ 1255 CSS px
  chk(1, `screen.width ${sw}px in range 1150–1400`,
    sw >= 1150 && sw <= 1400)

  // [1] Physical screen height (Tesla 1920×1200 display: 1200/1.53 ≈ 785)
  chk(1, `screen.height ${sh}px in range 700–870`,
    sh >= 700 && sh <= 870)

  // [1] No user-initiated zoom (Tesla changed DPR at OS level, not browser zoom)
  chk(1, `visualViewport.scale ${vvs.toFixed(3)} ≈ 1.000`,
    vvs >= 0.95 && vvs <= 1.05)

  // [2] Browser viewport occupies a specific fraction of the total CSS screen.
  //     Tesla UI (media player, climate) takes ~38% of the width.
  //     Tesla 2026.26: 773/1254 = 0.616. Regular fullscreen browser: ~0.95-1.0.
  //     Regular windowed browser on a large screen: varies (hard to match Tesla's exact ratio).
  const widthRatio = sw > 0 ? iw / sw : 0
  chk(2, `viewport/screen ratio ${widthRatio.toFixed(3)} in range 0.55–0.68`,
    widthRatio >= 0.55 && widthRatio <= 0.68)

  // [2] Screen aspect ratio reflects 1920×1200 (16:10) Tesla display.
  //     Tesla: 1254/784 = 1.599. Most laptops are 16:9 (ratio 1.78). Rare but strong signal.
  const screenAspect = sh > 0 ? sw / sh : 0
  chk(2, `screen aspect ${screenAspect.toFixed(3)} ≈ 1.60 (16:10 Tesla display, range 1.50–1.68)`,
    screenAspect >= 1.50 && screenAspect <= 1.68)

  // [1] Chrome-based, non-mobile UA (Tesla runs standard Chromium)
  chk(1, `Chrome desktop UA (no mobile OS)`,
    /Chrome/i.test(_ua) && !/Android|iPhone|iPad|iPod|CriOS/i.test(_ua))

  const maxScore = 14
  return {
    score,
    maxScore,
    confidence: Math.round(score / maxScore * 100),
    matched,
    unmatched,
  }
}

// Evaluate once at module load — captures original dimensions BEFORE any
// meta viewport changes. Do not call again later.
const _zoomedSignals = _computeZoomedSignals()

/** Full signal breakdown for debug panel. */
export const teslaZoomedSignals: TeslaZoomedSignals = _zoomedSignals

/**
 * True when fingerprint strongly matches Tesla 2026.26+ zoomed viewport.
 * Requires score >= 9/14 (64%) — all real Tesla signals should score 14/14.
 * Does NOT require "Tesla" to appear in the User-Agent string.
 */
export const isTesla2026Zoomed: boolean = _zoomedSignals.score >= 9

/**
 * Running inside a Tesla vehicle browser.
 * Covers both:
 *  • Pre-2026.26: UA contains "Tesla" or "QtWebEngine"
 *  • 2026.26+:    isTesla2026Zoomed fingerprint (plain Chrome/Linux UA)
 * Used everywhere in the app for Tesla-specific perf optimisations.
 */
export const isTeslaBrowser: boolean =
  /Tesla/i.test(_ua) || /QtWebEngine/i.test(_ua) || isTesla2026Zoomed

/** Any mobile or touch-primary device */
export const isMobile: boolean =
  /Android|iPhone|iPad|iPod/i.test(_ua) || navigator.maxTouchPoints > 0

/** Phone/tablet (not Tesla, identified by OS UA) */
export const isPhone: boolean =
  !isTeslaBrowser && /Android|iPhone|iPad|iPod/i.test(_ua)

/** Desktop browser — not Tesla, not a phone/tablet */
export const isDesktop: boolean = !isTeslaBrowser && !isPhone

/** Passive event options — required for Tesla scroll performance */
export const PASSIVE: AddEventListenerOptions = { passive: true }

// ─── Tesla 2026.26 compatibility target width ──────────────────────────────
//
// Setting <meta name="viewport" content="width=N"> where N equals the
// physical pixel width of the browser viewport restores DPR ≈ 1.0, giving
// back the pre-2026.26 CSS layout space (~1180×919).
//
// Formula: innerWidth × devicePixelRatio = physical browser viewport width.
// At Tesla HW3 post-2026.26: Math.round(773 × 1.530) = 1183 ≈ 1180 px.
// Model-agnostic: works for any Tesla hardware as long as DPR is detected.
export const TESLA_COMPAT_VIEWPORT_W: number = isTesla2026Zoomed
  ? Math.round(window.innerWidth * window.devicePixelRatio)
  : window.innerWidth
