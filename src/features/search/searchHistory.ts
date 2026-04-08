// ─── Search history + Favorites (localStorage) ────────────────────────
// Persists the last MAX geo destinations + starred favorites.
// Stations excluded — they're searchable locally.

const LS_HISTORY_KEY   = 'search-history'
const LS_FAVORITES_KEY = 'search-favorites'
const MAX_HISTORY      = 10
const MAX_FAVORITES    = 20

export interface HistoryEntry {
  shortName:   string
  displayName: string
  lat:         number
  lng:         number
  savedAt:     number
}

// ── History ────────────────────────────────────────────────────────

export function loadHistory(): HistoryEntry[] {
  try {
    const raw = localStorage.getItem(LS_HISTORY_KEY)
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
    ].slice(0, MAX_HISTORY)
    localStorage.setItem(LS_HISTORY_KEY, JSON.stringify(updated))
  } catch { /* quota — non-fatal */ }
}

export function removeFromHistory(lat: number, lng: number): void {
  try {
    const updated = loadHistory().filter(
      (h) => !(Math.abs(h.lat - lat) < 0.0001 && Math.abs(h.lng - lng) < 0.0001),
    )
    localStorage.setItem(LS_HISTORY_KEY, JSON.stringify(updated))
  } catch { /* non-fatal */ }
}

export function clearHistory(): void {
  try { localStorage.removeItem(LS_HISTORY_KEY) } catch { /* ignore */ }
}

// ── Favorites ──────────────────────────────────────────────────────

export function loadFavorites(): HistoryEntry[] {
  try {
    const raw = localStorage.getItem(LS_FAVORITES_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as HistoryEntry[]
    if (!Array.isArray(parsed)) return []
    return parsed
  } catch { return [] }
}

export function isFavorite(lat: number, lng: number): boolean {
  return loadFavorites().some(
    (f) => Math.abs(f.lat - lat) < 0.0001 && Math.abs(f.lng - lng) < 0.0001,
  )
}

export function toggleFavorite(entry: Omit<HistoryEntry, 'savedAt'>): boolean {
  try {
    const existing = loadFavorites()
    const idx = existing.findIndex(
      (f) => Math.abs(f.lat - entry.lat) < 0.0001 && Math.abs(f.lng - entry.lng) < 0.0001,
    )
    let updated: HistoryEntry[]
    let nowFavorite: boolean
    if (idx >= 0) {
      // Remove
      updated = existing.filter((_, i) => i !== idx)
      nowFavorite = false
    } else {
      // Add
      updated = [{ ...entry, savedAt: Date.now() }, ...existing].slice(0, MAX_FAVORITES)
      nowFavorite = true
    }
    localStorage.setItem(LS_FAVORITES_KEY, JSON.stringify(updated))
    return nowFavorite
  } catch { return false }
}
