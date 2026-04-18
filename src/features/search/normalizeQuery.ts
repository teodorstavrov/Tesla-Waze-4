// ─── Search query normalization & transliteration ─────────────────────────
//
// Pure functions — no side effects, no imports.
// Used by Nominatim and station search so users can type naturally:
//   "Pop Dimitar" / "Поп Димитър" → both find the same street
//   "ул. Витоша" / "ul. Vitosha" → stripped to bare name for Nominatim
//
// KEY AMBIGUITY: the official BG transliteration maps "ъ" → "a", so:
//   "Димитър" → "Dimitar"   (Cyrillic → Latin: correct)
//   "Dimitar" → "димитар"   (Latin → Cyrillic: WRONG — should be "димитър")
// The _withBGShva() function generates a second Cyrillic variant that tries
// "ър" for word-final "ar" so both spellings produce matching results.

// ─── Cyrillic → Latin (Bulgarian transliteration) ────────────────────────
const _CYR_TO_LAT: Record<string, string> = {
  'а':'a',  'б':'b',  'в':'v',  'г':'g',  'д':'d',  'е':'e',  'ж':'zh', 'з':'z',
  'и':'i',  'й':'y',  'к':'k',  'л':'l',  'м':'m',  'н':'n',  'о':'o',  'п':'p',
  'р':'r',  'с':'s',  'т':'t',  'у':'u',  'ф':'f',  'х':'h',  'ц':'ts', 'ч':'ch',
  'ш':'sh', 'щ':'sht','ъ':'a',  'ь':'',   'ю':'yu', 'я':'ya',
}

// ─── Latin → Cyrillic single-char fallback table ──────────────────────────
// Digraphs (sh/zh/ch/ts/yu/ya/sht) are matched before single chars.
const _LAT_SINGLE_TO_CYR: Record<string, string> = {
  'a':'а', 'b':'б', 'c':'к', 'd':'д', 'e':'е', 'f':'ф', 'g':'г', 'h':'х',
  'i':'и', 'j':'й', 'k':'к', 'l':'л', 'm':'м', 'n':'н', 'o':'о', 'p':'п',
  'q':'к', 'r':'р', 's':'с', 't':'т', 'u':'у', 'v':'в', 'w':'в', 'x':'кс',
  'y':'й', 'z':'з',
}

// ─── Street/road type prefixes to strip ───────────────────────────────────
// Nominatim indexes the bare street name ("Vitosha"), not "ул. Витоша".
const _STREET_PREFIX_RE = /^(?:ул\.?\s*|улица\s*|бул\.?\s*|булевард\s*|пр\.?\s*|проспект\s*|пл\.?\s*|площад\s*|кв\.?\s*|квартал\s*|ж\.?к\.?\s*|жк\s*|ul\.?\s*|ulitsa\s*|ulica\s*|bul\.?\s*|bulevard\s*|blvd\.?\s*|str\.?\s*|street\s*|ave\.?\s*|avenue\s*|rd\.?\s*|road\s*|sq\.?\s*|square\s*)/i

/** Lower-case, trim, collapse multiple spaces. */
export function normalizeText(s: string): string {
  return s.toLowerCase().trim().replace(/\s+/g, ' ')
}

/** Bulgarian Cyrillic → Latin transliteration. */
export function cyrillicToLatin(s: string): string {
  return s
    .toLowerCase()
    .split('')
    .map((c) => _CYR_TO_LAT[c] ?? c)
    .join('')
}

/** Latin phonetic → Bulgarian Cyrillic (digraph-aware). */
export function latinToCyrillic(s: string): string {
  const lower = s.toLowerCase()
  let result = ''
  let i = 0
  while (i < lower.length) {
    // 3-char digraph first
    if (lower.startsWith('sht', i)) { result += 'щ'; i += 3; continue }
    // 2-char digraphs
    if (lower.startsWith('sh', i))  { result += 'ш'; i += 2; continue }
    if (lower.startsWith('zh', i))  { result += 'ж'; i += 2; continue }
    if (lower.startsWith('ch', i))  { result += 'ч'; i += 2; continue }
    if (lower.startsWith('ts', i))  { result += 'ц'; i += 2; continue }
    if (lower.startsWith('yu', i))  { result += 'ю'; i += 2; continue }
    if (lower.startsWith('ya', i))  { result += 'я'; i += 2; continue }
    if (lower.startsWith('yo', i))  { result += 'йо'; i += 2; continue }
    // Single char fallback
    const c = lower[i]!
    result += _LAT_SINGLE_TO_CYR[c] ?? c
    i++
  }
  return result
}

/**
 * Generate a "shva variant" of a Cyrillic string.
 *
 * In the official BG transliteration, "ъ" is written as "a", so reversing
 * Latin→Cyrillic produces "а" where the correct letter is "ъ" in many names.
 * The most reliable pattern is word-final "-ар" → "-ър":
 *   "поп димитар" → "поп димитър"   (Dimitar → Димитър ✓)
 *   "петар"       → "петър"          (Petar  → Петър  ✓)
 *   "александар"  → "александър"     (Alexander → Александър ✓)
 *   "несебар"     → "несебър"        (Nessebar → Несебър ✓)
 *
 * "-ар" inside a word (e.g. "варна", "цариградско") is left unchanged because
 * the regex only matches when "ар" is followed by a space or end-of-string.
 */
function _withBGShva(cyr: string): string {
  return cyr.replace(/ар(?=\s|$)/g, 'ър')
}

/** True if >50% of the letter characters in s are Cyrillic. */
function _isMostlyCyrillic(s: string): boolean {
  const letters = [...s].filter((c) => /\p{L}/u.test(c))
  if (letters.length === 0) return false
  const cyr = letters.filter((c) => /[\u0400-\u04FF]/.test(c)).length
  return cyr / letters.length > 0.5
}

/** True if >50% of the letter characters in s are basic Latin (a-z). */
function _isMostlyLatin(s: string): boolean {
  const letters = [...s].filter((c) => /\p{L}/u.test(c))
  if (letters.length === 0) return false
  const lat = letters.filter((c) => /[a-z]/i.test(c)).length
  return lat / letters.length > 0.5
}

/** Strip a recognized street-type prefix, returning the bare street name. */
export function stripStreetPrefix(q: string): string {
  const stripped = q.replace(_STREET_PREFIX_RE, '').trim()
  return stripped.length > 0 ? stripped : q
}

/**
 * Generate up to 3 query variants for a raw user input.
 *
 * For Latin input in BG mode (the most important case):
 *   "pop dimitar"      → ["pop dimitar", "поп димитър", "поп димитар"]
 *   "ul. pop dimitar"  → ["pop dimitar", "поп димитър", "поп димитар"]
 *   "vitosha"          → ["vitosha", "витоша"]
 *   "sofia"            → ["sofia", "софия"]  (shva variant = same here)
 *
 * For Cyrillic input:
 *   "поп димитър"      → ["поп димитър", "pop dimitar"]
 *   "ул. витоша"       → ["ул. витоша", "ul. vitosha", "витоша"]
 *
 * @param opts.forBG Set true only for Bulgaria — enables Latin→Cyrillic
 *   reverse transliteration. Must NOT be set for NO/SE/FI to avoid
 *   corrupting Scandinavian Latin queries.
 */
export function generateQueryVariants(rawQuery: string, opts?: { forBG?: boolean }): string[] {
  const normalized = normalizeText(rawQuery)
  const stripped   = stripStreetPrefix(normalized)
  const hasPrefix  = stripped !== normalized

  const seen     = new Set<string>()
  const variants: string[] = []

  function add(v: string) {
    if (v && !seen.has(v)) { seen.add(v); variants.push(v) }
  }

  if (_isMostlyCyrillic(normalized)) {
    // ── Cyrillic input ────────────────────────────────────────────────
    add(hasPrefix ? stripped : normalized)   // bare name first (best for Nominatim)
    add(cyrillicToLatin(hasPrefix ? stripped : normalized))  // Latin transliteration
    if (hasPrefix) add(normalized)           // also try with the full prefix

  } else if (_isMostlyLatin(normalized) && opts?.forBG && normalized.length >= 3) {
    // ── Latin input, Bulgaria mode ────────────────────────────────────
    // Primary: the stripped Latin form (Nominatim finds "Pop Dimitar" or
    // the English street name stored in OSM)
    add(hasPrefix ? stripped : normalized)

    // Secondary: shva Cyrillic variant — most likely to match BG street data
    // e.g. "pop dimitar" → "поп димитър"
    const baseForCyr = hasPrefix ? stripped : normalized
    const basicCyr   = latinToCyrillic(baseForCyr)
    if (!/[a-z]/.test(basicCyr)) {           // sanity: result must be all Cyrillic
      const shvaCyr = _withBGShva(basicCyr)
      if (shvaCyr !== basicCyr) add(shvaCyr) // add shva variant first (higher value)
      add(basicCyr)                           // also add the basic Cyrillic variant
    }

  } else {
    // ── Other (Scandinavian Latin, mixed, numbers-only, etc.) ─────────
    add(normalized)
    if (hasPrefix) add(stripped)
  }

  // Hard cap — never fire more than 3 Nominatim requests per search
  return variants.slice(0, 3)
}
