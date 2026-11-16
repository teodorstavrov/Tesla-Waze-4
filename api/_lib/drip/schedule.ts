// ─── Re-engage email course: schedule ──────────────────────────────────
// One 10-email course for every registered user (plan: "TesRadar Re-engage план").
//
// • Users registered on or before the anchor day (Mon 16 Nov 2026) get the
//   emails on fixed dates: anchor + offset.
// • Users registered later get them `offset` days after their registration day,
//   moved off weekends to Monday and never closer than 2 days to the previous one.
// • BE, DE, FR skip email 5 (average-speed cameras) pending a legal check.
//
// • Resend allows 100 emails a day. The course uses at most DRIP_DAILY_CAP of
//   them and leaves OTHER_EMAIL_RESERVE for PIN, admin and meetup emails. Existing users are split
//   into two waves by a hash of the email: wave A gets each email on its date,
//   wave B one day later (113 users → ~57 a day). The cron stops at
//   DRIP_DAILY_CAP, sends each user at most one email per run and keeps at
//   least 2 days between two emails, so a late start simply shifts everything.
//
// Sent state lives in Redis hash `drip:{email}`: field = email number (1–10),
// value = ISO timestamp of when it was sent. The future cron writes it;
// the admin panel reads it.

export const RESEND_DAILY_LIMIT = 100
// PIN emails, the admin copy of each registration and meetup reminders share the quota.
export const OTHER_EMAIL_RESERVE = 30
export const DRIP_DAILY_CAP      = RESEND_DAILY_LIMIT - OTHER_EMAIL_RESERVE // 70
export const DRIP_WAVES         = 2

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

/** FNV-1a over the lower-cased email; same function as in the plan page. */
function hashEmail(email: string): number {
  const s = email.trim().toLowerCase()
  let h = 0x811c9dc5
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 0x01000193) >>> 0
  }
  return h >>> 0
}

/** 0 = wave A, 1 = wave B (one day later). */
export const dripWave = (email: string): number => hashEmail(email) % DRIP_WAVES

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
export function plannedDates(createdAt: number | string, country: string, email = ''): Record<number, string | null> {
  const created  = Number(createdAt)
  const cc       = String(country || '').trim().toUpperCase()
  const existing = !Number.isFinite(created) || created < DRIP_ANCHOR + DAY
  const regDay   = Number.isFinite(created) ? dayStart(created) : DRIP_ANCHOR

  const out: Record<number, string | null> = {}
  let prev: number | null = null
  for (const m of DRIP_EMAILS) {
    if (m.n === 5 && SKIP_EMAIL_5.has(cc)) { out[m.n] = null; continue }
    let d = existing
      ? DRIP_ANCHOR + (m.offset + dripWave(email)) * DAY
      : offWeekend(regDay + m.offset * DAY)
    if (!existing && prev !== null && d < prev + 2 * DAY) d = offWeekend(prev + 2 * DAY)
    prev = d
    out[m.n] = new Date(d).toISOString().slice(0, 10)
  }
  return out
}

export const SKIPS_EMAIL_5 = (country: string): boolean => SKIP_EMAIL_5.has(String(country || '').trim().toUpperCase())

/** Addresses never to send to (invalid). */
export const DRIP_EXCLUDE = new Set([
  'mihailnikolov13@gmai.com',
  'ibrishimov55@gmail',
])

export const UNSUB_SET = 'email:unsub'

const MIN_GAP_DAYS = 2

/**
 * Which course email (if any) is due for this user today.
 * `sent` is the drip:{email} hash (email № → ISO time). `today` is a YYYY-MM-DD (UTC).
 */
export function nextDue(
  user: { email: string; country: string; createdAt: number | string },
  sent: Record<string, string>,
  today: string,
): { n: number; planned: string } | null {
  const planned = plannedDates(user.createdAt, user.country, user.email)
  let last: string | null = null
  for (const m of DRIP_EMAILS) {
    const p = planned[m.n]
    if (p == null) continue                         // skipped for this country
    if (sent[String(m.n)]) { last = sent[String(m.n)].slice(0, 10); continue }
    if (p > today) return null                      // not yet
    if (last) {
      const gap = (Date.parse(today) - Date.parse(last)) / DAY
      if (gap < MIN_GAP_DAYS) return null
    }
    return { n: m.n, planned: p }
  }
  return null                                       // course finished
}
