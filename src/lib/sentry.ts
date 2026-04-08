// ─── Sentry error monitoring — frontend ────────────────────────────────
//
// Uses dynamic import so @sentry/react (~80KB) is ONLY loaded when
// VITE_SENTRY_DSN is configured. If the DSN is absent the chunk is never
// fetched and the main bundle is unaffected.
//
// Setup:
//   1. Create project at https://sentry.io  → get DSN
//   2. Set VITE_SENTRY_DSN=<dsn> in Vercel Environment Variables
//   3. Redeploy — monitoring activates automatically

const dsn = import.meta.env['VITE_SENTRY_DSN'] as string | undefined

// Capture function populated after async init — null-safe to call anytime
let _capture: ((err: unknown, context?: string) => void) | null = null

export async function initSentry(): Promise<void> {
  if (!dsn) return
  const Sentry = await import('@sentry/react')
  Sentry.init({
    dsn,
    environment: import.meta.env.MODE,
    tracesSampleRate: 0,
    integrations: [Sentry.globalHandlersIntegration()],
  })
  _capture = (err, context) =>
    Sentry.captureException(err, context ? { tags: { context } } : undefined)
}

export function captureError(err: unknown, context?: string): void {
  _capture?.(err, context)
}
