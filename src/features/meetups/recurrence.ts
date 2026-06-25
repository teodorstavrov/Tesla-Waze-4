// ─── Meetup recurrence utilities ─────────────────────────────────────────

export type RecurrenceType =
  | 'none'             // single event
  | 'weekly'           // every week on the same weekday
  | 'biweekly'         // every 2 weeks on the same weekday
  | 'monthly_date'     // every month on the same date number (e.g. 15th)
  | 'monthly_weekday'  // every month on the same Nth weekday (e.g. 2nd Sunday)

// Which ordinal occurrence of a weekday within its month (1–4, or -1 for last)
function nthOfMonth(date: Date): number {
  const d = date.getDate()
  const daysInMonth = new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate()
  if (d + 7 > daysInMonth) return -1
  return Math.ceil(d / 7)
}

// Date of the Nth occurrence of `weekday` in the given year/month
function nthWeekdayInMonth(year: number, month: number, weekday: number, nth: number): Date {
  if (nth === -1) {
    const d = new Date(year, month + 1, 0)
    while (d.getDay() !== weekday) d.setDate(d.getDate() - 1)
    return new Date(d)
  }
  const first = new Date(year, month, 1)
  const diff  = (weekday - first.getDay() + 7) % 7
  return new Date(year, month, 1 + diff + (nth - 1) * 7)
}

/** Returns the next occurrence of the event on or after `from` (default: now). */
export function nextOccurrence(
  baseDate: Date,
  recurrence: RecurrenceType | undefined,
  from: Date = new Date(),
): Date {
  if (!recurrence || recurrence === 'none') return baseDate

  const timeMs = baseDate.getHours() * 3_600_000 + baseDate.getMinutes() * 60_000

  if (recurrence === 'weekly') {
    let d = new Date(baseDate)
    while (d < from) d = new Date(d.getTime() + 7 * 86_400_000)
    return d
  }

  if (recurrence === 'biweekly') {
    let d = new Date(baseDate)
    while (d < from) d = new Date(d.getTime() + 14 * 86_400_000)
    return d
  }

  if (recurrence === 'monthly_date') {
    const day = baseDate.getDate()
    let year = from.getFullYear(), month = from.getMonth()
    for (let i = 0; i < 25; i++) {
      const daysInMonth = new Date(year, month + 1, 0).getDate()
      const full = new Date(year, month, Math.min(day, daysInMonth), 0, 0, 0, timeMs)
      if (full >= from) return full
      if (++month > 11) { month = 0; year++ }
    }
    return baseDate
  }

  if (recurrence === 'monthly_weekday') {
    const weekday = baseDate.getDay()
    const nth     = nthOfMonth(baseDate)
    let year = from.getFullYear(), month = from.getMonth()
    for (let i = 0; i < 25; i++) {
      const d    = nthWeekdayInMonth(year, month, weekday, nth)
      const full = new Date(d.getTime() + timeMs)
      if (full >= from) return full
      if (++month > 11) { month = 0; year++ }
    }
    return baseDate
  }

  return baseDate
}

const WEEKDAYS: Record<string, string[]> = {
  bg: ['неделя','понеделник','вторник','сряда','четвъртък','петък','събота'],
  en: ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'],
  no: ['søndag','mandag','tirsdag','onsdag','torsdag','fredag','lørdag'],
  sv: ['söndag','måndag','tisdag','onsdag','torsdag','fredag','lördag'],
  fi: ['sunnuntai','maanantai','tiistai','keskiviikko','torstai','perjantai','lauantai'],
  nl: ['zondag','maandag','dinsdag','woensdag','donderdag','vrijdag','zaterdag'],
}

const ORDINALS: Record<string, string[]> = {
  bg: ['1-ва','2-ра','3-та','4-та','последна'],
  en: ['1st','2nd','3rd','4th','last'],
  no: ['1.','2.','3.','4.','siste'],
  sv: ['1:a','2:a','3:e','4:e','sista'],
  fi: ['1.','2.','3.','4.','viimeinen'],
  nl: ['1e','2e','3e','4e','laatste'],
}

/** Human-readable recurrence pattern in the given language. Returns '' for 'none'. */
export function formatRecurrence(
  baseDate: Date,
  recurrence: RecurrenceType | undefined,
  lang: string,
): string {
  if (!recurrence || recurrence === 'none') return ''

  const wds = WEEKDAYS[lang]  ?? WEEKDAYS.en!
  const wd  = wds[baseDate.getDay()]!

  if (recurrence === 'weekly') {
    return ({ bg: `Всяка ${wd}`, en: `Every ${wd}`, no: `Hver ${wd}`, sv: `Varje ${wd}`, fi: `Joka ${wd}`, nl: `Elke ${wd}` } as Record<string,string>)[lang]
      ?? `Every ${wd}`
  }

  if (recurrence === 'biweekly') {
    return ({ bg: `Всяка 2-ра ${wd}`, en: `Every other ${wd}`, no: `Hver 2. ${wd}`, sv: `Varannan ${wd}`, fi: `Joka toinen ${wd}`, nl: `Elke 2e ${wd}` } as Record<string,string>)[lang]
      ?? `Every other ${wd}`
  }

  if (recurrence === 'monthly_date') {
    const d = baseDate.getDate()
    return ({ bg: `Всеки месец на ${d}-то число`, en: `Every month on the ${d}th`, no: `Hver måned den ${d}.`, sv: `Varje månad den ${d}`, fi: `Joka kuun ${d}.`, nl: `Elke maand op de ${d}e` } as Record<string,string>)[lang]
      ?? `Every month on the ${d}th`
  }

  if (recurrence === 'monthly_weekday') {
    const nth  = nthOfMonth(baseDate)
    const ords = ORDINALS[lang] ?? ORDINALS.en!
    const ord  = ords[nth === -1 ? 4 : nth - 1]!
    return ({ bg: `Всяка ${ord} ${wd} от месеца`, en: `Every ${ord} ${wd} of the month`, no: `Hver ${ord} ${wd} i måneden`, sv: `Varje ${ord} ${wd} i månaden`, fi: `Joka kuun ${ord} ${wd}`, nl: `Elke ${ord} ${wd} van de maand` } as Record<string,string>)[lang]
      ?? `Every ${ord} ${wd} of the month`
  }

  return ''
}
