// ─── User station ownership (localStorage) ─────────────────────────────
// After submitting a station the server returns a random ownerToken.
// We store it here keyed by station ID so the same device can edit/delete.

const LS_KEY = 'teslaradar:station-tokens'

function _load(): Record<string, string> {
  try { return JSON.parse(localStorage.getItem(LS_KEY) ?? '{}') as Record<string, string> }
  catch { return {} }
}

export function saveOwnerToken(stationId: string, token: string): void {
  try {
    const map = _load()
    map[stationId] = token
    localStorage.setItem(LS_KEY, JSON.stringify(map))
  } catch { /* quota */ }
}

export function getOwnerToken(stationId: string): string | null {
  return _load()[stationId] ?? null
}

export function removeOwnerToken(stationId: string): void {
  try {
    const map = _load()
    delete map[stationId]
    localStorage.setItem(LS_KEY, JSON.stringify(map))
  } catch { /* quota */ }
}
