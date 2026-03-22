// ─── Browser / device detection ───────────────────────────────────────

const ua = navigator.userAgent

/** Running inside a Tesla vehicle browser (QtWebEngine-based) */
export const isTeslaBrowser: boolean =
  /Tesla/i.test(ua) || /QtWebEngine/i.test(ua)

/** Any mobile or touch-primary device */
export const isMobile: boolean =
  /Android|iPhone|iPad|iPod/i.test(ua) || navigator.maxTouchPoints > 0

/** Passive event options — required for Tesla scroll performance */
export const PASSIVE: AddEventListenerOptions = { passive: true }
