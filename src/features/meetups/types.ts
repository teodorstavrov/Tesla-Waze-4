// ─── Community meetup types (frontend) ──────────────────────────────────

export type { RecurrenceType } from './recurrence'

export interface Meetup {
  id:             string
  lat:            number
  lng:            number
  title:          string
  date:           string          // ISO datetime (reference / first occurrence)
  description:    string | null   // short explanatory text
  recurrence:     import('./recurrence').RecurrenceType
  organizer:      string | null
  organizerPhone: string | null
  organizerEmail: string | null
  facebook:       string | null   // free text OR url
  createdAt:      string
  followers:      string[]
}
