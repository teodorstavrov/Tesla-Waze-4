// ─── Maneuver text + arrow helpers ─────────────────────────────────────
// Shared between routeStore (voice) and TurnInstruction (display).

import type { RouteStep } from './types.js'
import { getLang } from '@/lib/locale'

// ── Voice modifier strings — all 5 UI languages ──────────────────────

const MODIFIER_VOICE: Record<string, Record<string, string>> = {
  bg: {
    'uturn':        'обърнете се',
    'sharp right':  'завийте рязко надясно',
    'right':        'завийте надясно',
    'slight right': 'завийте леко надясно',
    'straight':     'продължете направо',
    'slight left':  'завийте леко наляво',
    'left':         'завийте наляво',
    'sharp left':   'завийте рязко наляво',
  },
  en: {
    'uturn':        'make a u-turn',
    'sharp right':  'turn sharp right',
    'right':        'turn right',
    'slight right': 'keep slight right',
    'straight':     'continue straight',
    'slight left':  'keep slight left',
    'left':         'turn left',
    'sharp left':   'turn sharp left',
  },
  no: {
    'uturn':        'snu bilen',
    'sharp right':  'ta en skarp høyresving',
    'right':        'sving til høyre',
    'slight right': 'hold deg til høyre',
    'straight':     'kjør rett frem',
    'slight left':  'hold deg til venstre',
    'left':         'sving til venstre',
    'sharp left':   'ta en skarp venstresving',
  },
  sv: {
    'uturn':        'gör en u-sväng',
    'sharp right':  'ta en skarp högersväng',
    'right':        'sväng höger',
    'slight right': 'håll till höger',
    'straight':     'kör rakt fram',
    'slight left':  'håll till vänster',
    'left':         'sväng vänster',
    'sharp left':   'ta en skarp vänstersväng',
  },
  fi: {
    'uturn':        'tee u-käännös',
    'sharp right':  'käänny jyrkästi oikealle',
    'right':        'käänny oikealle',
    'slight right': 'pidä oikealla',
    'straight':     'jatka suoraan',
    'slight left':  'pidä vasemmalla',
    'left':         'käänny vasemmalle',
    'sharp left':   'käänny jyrkästi vasemmalle',
  },
}

// ── Display modifier strings ──────────────────────────────────────────

const MODIFIER_DISPLAY: Record<string, Record<string, string>> = {
  bg: {
    'uturn':        'Обърнете се',
    'sharp right':  'Рязко надясно',
    'right':        'Завийте надясно',
    'slight right': 'Леко надясно',
    'straight':     'Продължете',
    'slight left':  'Леко наляво',
    'left':         'Завийте наляво',
    'sharp left':   'Рязко наляво',
  },
  en: {
    'uturn':        'Make a U-turn',
    'sharp right':  'Sharp right',
    'right':        'Turn right',
    'slight right': 'Keep right',
    'straight':     'Continue',
    'slight left':  'Keep left',
    'left':         'Turn left',
    'sharp left':   'Sharp left',
  },
  no: {
    'uturn':        'Snu bilen',
    'sharp right':  'Skarp høyresving',
    'right':        'Sving høyre',
    'slight right': 'Hold høyre',
    'straight':     'Fortsett',
    'slight left':  'Hold venstre',
    'left':         'Sving venstre',
    'sharp left':   'Skarp venstresving',
  },
  sv: {
    'uturn':        'Gör en u-sväng',
    'sharp right':  'Skarp högersväng',
    'right':        'Sväng höger',
    'slight right': 'Håll höger',
    'straight':     'Fortsätt',
    'slight left':  'Håll vänster',
    'left':         'Sväng vänster',
    'sharp left':   'Skarp vänstersväng',
  },
  fi: {
    'uturn':        'Tee u-käännös',
    'sharp right':  'Jyrkkä oikea',
    'right':        'Käänny oikealle',
    'slight right': 'Pidä oikealla',
    'straight':     'Jatka',
    'slight left':  'Pidä vasemmalla',
    'left':         'Käänny vasemmalle',
    'sharp left':   'Jyrkkä vasen',
  },
}

// Clockwise rotation in degrees for the "straight-up" arrow SVG
export const MODIFIER_ROTATION: Record<string, number> = {
  'uturn':        180,
  'sharp right':  70,
  'right':        90,
  'slight right': 45,
  'straight':     0,
  'slight left':  -45,
  'left':         -90,
  'sharp left':   -70,
}

// ── Helpers ───────────────────────────────────────────────────────────

function cap(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1)
}

function exitOrdinal(n: number, lang: string): string {
  switch (lang) {
    case 'en':
      if (n === 1) return '1st'
      if (n === 2) return '2nd'
      if (n === 3) return '3rd'
      return `${n}th`
    case 'no':
    case 'fi':
      return `${n}.`
    case 'sv':
      if (n === 1 || n === 2) return `${n}:a`
      if (n === 3) return '3:e'
      return `${n}:e`
    default: // bg
      if (n === 1) return '1-ви'
      if (n === 2) return '2-ри'
      if (n === 3) return '3-ти'
      return `${n}-ти`
  }
}

// ── Public helpers ────────────────────────────────────────────────────

/** True for roundabout and rotary maneuver types. */
export function isRoundaboutStep(step: RouteStep): boolean {
  return step.type === 'roundabout' || step.type === 'rotary'
}

/**
 * Short exit label for the roundabout HUD subtext.
 * Returns null when no exit number is available.
 * Examples: "2nd exit" (EN), "2-ри изход" (BG), "2. avkjørsel" (NO)
 */
export function roundaboutExitLabel(step: RouteStep): string | null {
  if (step.exit === undefined) return null
  const lang = getLang()
  const ord = exitOrdinal(step.exit, lang)
  switch (lang) {
    case 'bg': return `${ord} изход`
    case 'no': return `${ord} avkjørsel`
    case 'sv': return `${ord} avfart`
    case 'fi': return `${ord} uloskäynti`
    default:   return `${ord} exit`
  }
}

/** Text for voice synthesis. */
export function maneuverVoiceText(step: RouteStep): string {
  const lang = getLang()

  if (step.type === 'arrive')
    return ({ bg: 'Пристигнахте', no: 'Du er fremme', sv: 'Du har anlänt', fi: 'Olet perillä' } as Record<string,string>)[lang] ?? 'You have arrived'

  if (step.type === 'depart')
    return ({ bg: 'Тръгнете', no: 'Kjør av sted', sv: 'Starta', fi: 'Lähde' } as Record<string,string>)[lang] ?? 'Depart'

  if (isRoundaboutStep(step)) {
    if (step.exit) {
      const ord = exitOrdinal(step.exit, lang)
      switch (lang) {
        case 'bg': return `Влезте в кръговото и излезте на ${ord} изход`
        case 'no': return `I rundkjøringen, ta ${ord} avkjørsel`
        case 'sv': return `I rondellen, ta ${ord} avfart`
        case 'fi': return `Kiertoliittymässä ota ${ord} uloskäynti`
        default:   return `At the roundabout, take the ${ord} exit`
      }
    }
    return ({ bg: 'Влезте в кръговото движение', no: 'Kjør inn i rundkjøringen', sv: 'Kör in i rondellen', fi: 'Aja kiertoliittymään' } as Record<string,string>)[lang]
      ?? 'Enter the roundabout'
  }

  if (step.type === 'exit roundabout' || step.type === 'exit rotary')
    return ({ bg: 'Излезте от кръговото', no: 'Kjør ut av rundkjøringen', sv: 'Kör ut ur rondellen', fi: 'Aja ulos kiertoliittymästä' } as Record<string,string>)[lang]
      ?? 'Exit the roundabout'

  const voices = MODIFIER_VOICE[lang] ?? MODIFIER_VOICE['en']!
  const v = step.modifier ? voices[step.modifier] : undefined
  return v
    ? cap(v)
    : (({ bg: 'Продължете', no: 'Fortsett', sv: 'Fortsätt', fi: 'Jatka' } as Record<string,string>)[lang] ?? 'Continue')
}

/** Short text for the HUD display. */
export function maneuverDisplayText(step: RouteStep): string {
  const lang = getLang()

  if (step.type === 'arrive')
    return ({ bg: 'Пристигнахте', no: 'Ankommet', sv: 'Anlänt', fi: 'Perillä' } as Record<string,string>)[lang] ?? 'Arrived'

  if (step.type === 'depart')
    return ({ bg: 'Тръгнете', no: 'Kjør av sted', sv: 'Starta', fi: 'Lähde' } as Record<string,string>)[lang] ?? 'Depart'

  if (isRoundaboutStep(step)) {
    if (step.exit) {
      const ord = exitOrdinal(step.exit, lang)
      switch (lang) {
        case 'bg': return `Кръгово — ${ord} изход`
        case 'no': return `Rundkjøring — ${ord} avkjørsel`
        case 'sv': return `Rondell — ${ord} avfart`
        case 'fi': return `Kiertoliittymä — ${ord} uloskäynti`
        default:   return `Roundabout — ${ord} exit`
      }
    }
    return ({ bg: 'Кръгово', no: 'Rundkjøring', sv: 'Rondell', fi: 'Kiertoliittymä' } as Record<string,string>)[lang] ?? 'Roundabout'
  }

  if (step.type === 'exit roundabout' || step.type === 'exit rotary')
    return ({ bg: 'Излезте от кръговото', no: 'Ut av rundkjøring', sv: 'Ut ur rondell', fi: 'Ulos kiertoliittymästä' } as Record<string,string>)[lang]
      ?? 'Exit roundabout'

  const displays = MODIFIER_DISPLAY[lang] ?? MODIFIER_DISPLAY['en']!
  return (step.modifier ? displays[step.modifier] : undefined)
    ?? (({ bg: 'Продължете', no: 'Fortsett', sv: 'Fortsätt', fi: 'Jatka' } as Record<string,string>)[lang] ?? 'Continue')
}

/** Arrow rotation for the step (degrees, clockwise from up). Not used for roundabouts (RoundaboutIcon replaces TurnArrow). */
export function maneuverArrowRotation(step: RouteStep): number {
  if (step.type === 'arrive') return 0
  if (isRoundaboutStep(step)) return 45  // fallback safety value, icon replaces arrow
  const r = step.modifier !== undefined ? MODIFIER_ROTATION[step.modifier] : undefined
  return r ?? 0
}
