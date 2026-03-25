// ─── Search history (localStorage) ────────────────────────────────────
// Persists the last MAX geo destinations selected by the user.
// Stations are excluded — they're already searchable locally.

const LS_KEY = 'search-history'
const MAX    = 5

export interface HistoryEntry {
  shortName:   string
  displayName: string
  lat:         number
  lng:         number
  savedAt:     number
}

export function loadHistory(): HistoryEntry[] {
  try {
    const raw = localStorage.getItem(LS_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as HistoryEntry[]
    if (!Array.isArray(parsed)) return []
    return parsed
  } catch { return [] }
}

export function saveToHistory(entry: Omit<HistoryEntry, 'savedAt'>): void {
  try {
    const existing = loadHistory().filter(
      (h) => !(Math.abs(h.lat - entry.lat) < 0.0001 && Math.abs(h.lng - entry.lng) < 0.0001),
    )
    const updated: HistoryEntry[] = [
      { ...entry, savedAt: Date.now() },
      ...existing,
    ].slice(0, MAX)
    localStorage.setItem(LS_KEY, JSON.stringify(updated))
  } catch { /* quota — non-fatal */ }
}

export function clearHistory(): void {
  try { localStorage.removeItem(LS_KEY) } catch { /* ignore */ }
}
