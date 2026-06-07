// ─── Meetup ownership (localStorage) ────────────────────────────────────
// On create the server returns an ownerToken; we store it keyed by meetup id
// so the same device can edit the event later.

const LS_KEY = 'teslaradar:meetup-tokens'

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
