// ─── Event time helpers ─────────────────────────────────────────────────
//
// Pure functions — no React, no imports, safe to call anywhere.
// All functions read getLang() at call-time, so they're always current.

import { getLang } from '@/lib/locale'

/** How long ago an event was reported. */
export function formatTimeAgo(reportedAt: string): string {
  const lang = getLang()
  const ms   = Date.now() - new Date(reportedAt).getTime()

  if (ms < 60_000) {
    return lang === 'bg' ? 'Току-що' : 'Just now'
  }

  const mins  = Math.floor(ms / 60_000)
  const hours = Math.floor(mins / 60)

  if (mins < 60) {
    return lang === 'bg' ? `преди ${mins} мин` : `${mins} min ago`
  }

  const remMins = mins % 60
  if (remMins === 0) {
    return lang === 'bg' ? `преди ${hours} ч` : `${hours} h ago`
  }
  return lang === 'bg'
    ? `преди ${hours} ч ${remMins} мин`
    : `${hours} h ${remMins} min ago`
}

/** How long until an event expires. Empty string if already expired. */
export function formatExpiresIn(expiresAt: string): string {
  const lang = getLang()
  const ms   = new Date(expiresAt).getTime() - Date.now()

  if (ms <= 0) return lang === 'bg' ? 'Изтекло' : 'Expired'

  const mins  = Math.floor(ms / 60_000)
  const hours = Math.floor(mins / 60)
  const remMins = mins % 60

  if (mins < 60) {
    return lang === 'bg' ? `изтича след ${mins} мин` : `expires in ${mins} min`
  }
  if (remMins === 0) {
    return lang === 'bg' ? `изтича след ${hours} ч` : `expires in ${hours} h`
  }
  return lang === 'bg'
    ? `изтича след ${hours} ч ${remMins} мин`
    : `expires in ${hours} h ${remMins} min`
}

/**
 * "Докладвано преди X мин" line.
 * Permanent (admin) events show when added; user events also show expiry.
 */
export function reportedLine(reportedAt: string, expiresAt: string, permanent?: boolean): string {
  const lang    = getLang()
  const ago     = formatTimeAgo(reportedAt)
  if (permanent) {
    return lang === 'bg' ? `Добавено ${ago}` : `Added ${ago}`
  }
  const expires = formatExpiresIn(expiresAt)
  return lang === 'bg'
    ? `Докладвано ${ago} · ${expires}`
    : `Reported ${ago} · ${expires}`
}

/**
 * Short label for the map marker tooltip.
 * BG: "преди 5 мин"   EN: "5 min ago"
 */
export function markerTimeLabel(reportedAt: string): string {
  return formatTimeAgo(reportedAt)
}
