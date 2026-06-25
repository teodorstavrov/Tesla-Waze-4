// ─── Meetup ownership + RSVP tracking (localStorage) ────────────────────
// ownerToken: per-meetup secret returned at create time → enables edit
// deviceId:   one UUID per browser → anonymous RSVP identity
// rsvp state: { [meetupId]: { attend: boolean; interest: boolean } }

const LS_KEY     = 'teslaradar:meetup-tokens'
const DEVICE_KEY = 'teslaradar:deviceId'
const RSVP_KEY   = 'teslaradar:meetup-rsvp'

// ── Owner tokens ─────────────────────────────────────────────────────────

function _load(): Record<string, string> {
  try { return JSON.parse(localStorage.getItem(LS_KEY) ?? '{}') as Record<string, string> }
  catch { return {} }
}

export function saveMeetupToken(id: string, token: string): void {
  try { const m = _load(); m[id] = token; localStorage.setItem(LS_KEY, JSON.stringify(m)) }
  catch { /* quota */ }
}

export function getMeetupToken(id: string): string | null {
  return _load()[id] ?? null
}

// ── Device ID (anonymous RSVP identity) ──────────────────────────────────

export function getDeviceId(): string {
  try {
    let id = localStorage.getItem(DEVICE_KEY)
    if (!id) { id = crypto.randomUUID(); localStorage.setItem(DEVICE_KEY, id) }
    return id
  } catch { return 'unknown' }
}

// ── Local RSVP state ──────────────────────────────────────────────────────

type RsvpMap = Record<string, { attend?: boolean; interest?: boolean }>

function _loadRsvp(): RsvpMap {
  try { return JSON.parse(localStorage.getItem(RSVP_KEY) ?? '{}') as RsvpMap }
  catch { return {} }
}

export function getRsvp(meetupId: string): { attend: boolean; interest: boolean } {
  const m = _loadRsvp()[meetupId]
  return { attend: m?.attend ?? false, interest: m?.interest ?? false }
}

export function setRsvp(meetupId: string, type: 'attend' | 'interest', value: boolean): void {
  try {
    const m = _loadRsvp()
    const other = type === 'attend' ? 'interest' : 'attend'
    m[meetupId] = { ...m[meetupId], [type]: value, ...(value ? { [other]: false } : {}) }
    localStorage.setItem(RSVP_KEY, JSON.stringify(m))
  } catch { /* quota */ }
}
