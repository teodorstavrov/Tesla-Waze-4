// ─── Sentry error monitoring — API (Vercel serverless) ──────────────────
//
// Initialises only when SENTRY_DSN is set in Vercel env vars.
// Serverless functions must call Sentry.flush() before returning —
// captureApiError() handles this automatically.
//
// Setup:
//   1. Create project at https://sentry.io  → get DSN
//   2. Set SENTRY_DSN=<dsn> in Vercel Environment Variables (server-side only)
//   3. Redeploy — monitoring activates automatically

import * as Sentry from '@sentry/node'

const dsn = process.env['SENTRY_DSN']
let _ready = false

function _ensureInit(): void {
  if (_ready || !dsn) return
  _ready = true
  Sentry.init({
    dsn,
    environment: process.env['VERCEL_ENV'] ?? 'development',
    tracesSampleRate: 0,
  })
}

/**
 * Log error to console (always) + Sentry (when DSN configured).
 * Awaiting this ensures the event is flushed before the serverless
 * function returns (Sentry requires explicit flush in serverless).
 */
export async function captureApiError(err: unknown, context: string): Promise<void> {
  console.error(`[${context}]`, err)
  if (!dsn) return
  _ensureInit()
  Sentry.captureException(err, { tags: { context } })
  await Sentry.flush(2000)
}
