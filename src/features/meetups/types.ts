// ─── Community meetup types (frontend) ──────────────────────────────────

export interface Meetup {
  id:             string
  lat:            number
  lng:            number
  title:          string
  date:           string          // ISO datetime
  organizer:      string | null
  organizerPhone: string | null
  organizerEmail: string | null
  facebook:       string | null   // free text OR url
  createdAt:      string
  followers:      string[]
}
