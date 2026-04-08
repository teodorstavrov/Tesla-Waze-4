// ─── Speed Section types ───────────────────────────────────────────────
//
// A speed section is a road segment with average-speed enforcement
// (two cameras: one at entry, one at exit). The driver's average speed
// across the section is computed from elapsed time and GPS distance.

export interface SpeedSection {
  id:         string
  road:       string          // motorway label, e.g. "А1 Тракия"
  name:       string          // section label, e.g. "Вакарел — Ихтиман"
  startLat:   number
  startLng:   number
  endLat:     number
  endLng:     number
  lengthM:    number          // road distance in meters (used for avg speed calc)
  limitKmh:   number          // enforced speed limit
}

// Runtime state tracked by sectionEngine
export interface SectionSession {
  section:    SpeedSection
  enteredAt:  number          // Date.now() at entry
  distM:      number          // GPS-accumulated distance since entry (meters)
  avgKmh:     number          // rolling average speed (km/h)
  warned:     boolean         // true if over-limit warning already shown
}
