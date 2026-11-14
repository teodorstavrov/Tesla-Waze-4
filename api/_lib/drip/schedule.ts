// ─── Re-engage email course: schedule ──────────────────────────────────
// One 10-email course for every registered user (plan: "TesRadar Re-engage план").
//
// • Users registered on or before the anchor day (Mon 16 Nov 2026) get the
//   emails on fixed dates: anchor + offset.
// • Users registered later get them `offset` days after their registration day,
//   moved off weekends to Monday and never closer than 2 days to the previous one.
// • BE, DE, FR skip email 5 (average-speed cameras) pending a legal check.
//
// Sent state lives in Redis hash `drip:{email}`: field = email number (1–10),
// value = ISO timestamp of when it was sent. The future cron writes it;
// the admin panel reads it.

export const DRIP_ANCHOR = Date.UTC(2026, 10, 16) // Mon 16 Nov 2026 = day 0
const DAY = 86_400_000

export const DRIP_EMAILS: ReadonlyArray<{ n: number; offset: number; feature: string }> = [
  { n: 1,  offset: 1,  feature: 'Бърз старт' },
  { n: 2,  offset: 3,  feature: 'Полиция, катастрофи, опасности' },
  { n: 3,  offset: 7,  feature: 'Батерия при пристигане' },
  { n: 4,  offset: 10, feature: 'Зарядни станции' },
  { n: 5,  offset: 14, feature: 'Камери за средна скорост' },
  { n: 6,  offset: 17, feature: 'AI асистент' },
  { n: 7,  offset: 21, feature: 'Звуци и мелодии' },
  { n: 8,  offset: 28, feature: 'Tesla срещи' },
  { n: 9,  offset: 35, feature: 'Любими места и зимен обхват' },
  { n: 10, offset: 42, feature: 'Оценка и подкрепа' },
]

const SKIP_EMAIL_5 = new Set(['BE', 'DE', 'FR'])

export const dripKey = (email: string): string => `drip:${email.trim().toLowerCase()}`

function dayStart(ms: number): number {
  const d = new Date(ms)
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())
}

function offWeekend(ms: number): number {
  const wd = new Date(ms).getUTCDay()
  if (wd === 6) return ms + 2 * DAY
  if (wd === 0) return ms + DAY
  return ms
}

/** Planned send date (YYYY-MM-DD, UTC) per email number; null = skipped for this user. */
export function plannedDates(createdAt: number | string, country: string): Record<number, string | null> {
  const created  = Number(createdAt)
  const cc       = String(country || '').trim().toUpperCase()
  const existing = !Number.isFinite(created) || created < DRIP_ANCHOR + DAY
  const regDay   = Number.isFinite(created) ? dayStart(created) : DRIP_ANCHOR

  const out: Record<number, string | null> = {}
  let prev: number | null = null
  for (const m of DRIP_EMAILS) {
    if (m.n === 5 && SKIP_EMAIL_5.has(cc)) { out[m.n] = null; continue }
    let d = existing ? DRIP_ANCHOR + m.offset * DAY : offWeekend(regDay + m.offset * DAY)
    if (!existing && prev !== null && d < prev + 2 * DAY) d = offWeekend(prev + 2 * DAY)
    prev = d
    out[m.n] = new Date(d).toISOString().slice(0, 10)
  }
  return out
}
