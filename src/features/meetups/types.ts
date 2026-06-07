// ─── Community meetup types (frontend) ──────────────────────────────────

export interface Meetup {
  id:          string
  lat:         number
  lng:         number
  title:       string
  date:        string          // ISO datetime
  organizer:   string | null
  facebookUrl: string | null
  createdAt:   string
  interested:  string[]
}
