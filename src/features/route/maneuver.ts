// ─── Maneuver text + arrow helpers ─────────────────────────────────────
// Shared between routeStore (voice) and TurnInstruction (display).

import type { RouteStep } from './types.js'
import { getLang } from '@/lib/locale'

// Voice strings per lang (lowercase — capitalize at call site if needed)
const MODIFIER_VOICE_BG: Record<string, string> = {
  'uturn':        'обърнете се',
  'sharp right':  'завийте рязко надясно',
  'right':        'завийте надясно',
  'slight right': 'завийте леко надясно',
  'straight':     'продължете направо',
  'slight left':  'завийте леко наляво',
  'left':         'завийте наляво',
  'sharp left':   'завийте рязко наляво',
}

const MODIFIER_VOICE_EN: Record<string, string> = {
  'uturn':        'make a u-turn',
  'sharp right':  'turn sharp right',
  'right':        'turn right',
  'slight right': 'keep slight right',
  'straight':     'continue straight',
  'slight left':  'keep slight left',
  'left':         'turn left',
  'sharp left':   'turn sharp left',
}

// Display strings per lang (title-case)
const MODIFIER_DISPLAY_BG: Record<string, string> = {
  'uturn':        'Обърнете се',
  'sharp right':  'Рязко надясно',
  'right':        'Завийте надясно',
  'slight right': 'Леко надясно',
  'straight':     'Продължете',
  'slight left':  'Леко наляво',
  'left':         'Завийте наляво',
  'sharp left':   'Рязко наляво',
}

const MODIFIER_DISPLAY_EN: Record<string, string> = {
  'uturn':        'Make a U-turn',
  'sharp right':  'Sharp right',
  'right':        'Turn right',
  'slight right': 'Keep right',
  'straight':     'Continue',
  'slight left':  'Keep left',
  'left':         'Turn left',
  'sharp left':   'Sharp left',
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

function cap(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1)
}

function exitOrdinal(n: number): string {
  if (getLang() === 'en') {
    if (n === 1) return '1st'
    if (n === 2) return '2nd'
    if (n === 3) return '3rd'
    return `${n}th`
  }
  if (n === 1) return '1-ви'
  if (n === 2) return '2-ри'
  return `${n}-ти`
}

/** Text for voice synthesis. */
export function maneuverVoiceText(step: RouteStep): string {
  const isBg = getLang() === 'bg'
  if (step.type === 'arrive')
    return isBg ? 'Пристигнахте' : 'You have arrived'
  if (step.type === 'depart')
    return isBg ? 'Тръгнете' : 'Depart'
  if (step.type === 'roundabout' || step.type === 'rotary') {
    if (step.exit) return isBg
      ? `Влезте в кръговото и излезте на ${exitOrdinal(step.exit)} изход`
      : `At the roundabout, take the ${exitOrdinal(step.exit)} exit`
    return isBg ? 'Влезте в кръговото движение' : 'Enter the roundabout'
  }
  if (step.type === 'exit roundabout' || step.type === 'exit rotary')
    return isBg ? 'Излезте от кръговото' : 'Exit the roundabout'
  const v = step.modifier
    ? (isBg ? MODIFIER_VOICE_BG : MODIFIER_VOICE_EN)[step.modifier]
    : undefined
  return v ? cap(v) : (isBg ? 'Продължете' : 'Continue')
}

/** Short text for the HUD display. */
export function maneuverDisplayText(step: RouteStep): string {
  const isBg = getLang() === 'bg'
  if (step.type === 'arrive')
    return isBg ? 'Пристигнахте' : 'Arrived'
  if (step.type === 'depart')
    return isBg ? 'Тръгнете' : 'Depart'
  if (step.type === 'roundabout' || step.type === 'rotary') {
    if (step.exit) return isBg
      ? `Кръгово — ${exitOrdinal(step.exit)} изход`
      : `Roundabout — ${exitOrdinal(step.exit)} exit`
    return isBg ? 'Кръгово' : 'Roundabout'
  }
  if (step.type === 'exit roundabout' || step.type === 'exit rotary')
    return isBg ? 'Излезте от кръговото' : 'Exit roundabout'
  const d = step.modifier
    ? (isBg ? MODIFIER_DISPLAY_BG : MODIFIER_DISPLAY_EN)[step.modifier]
    : undefined
  return d ?? (isBg ? 'Продължете' : 'Continue')
}

/** Arrow rotation for the step (degrees, clockwise from up). */
export function maneuverArrowRotation(step: RouteStep): number {
  if (step.type === 'arrive') return 0
  if (step.type === 'roundabout' || step.type === 'rotary') return 45
  const r = step.modifier !== undefined ? MODIFIER_ROTATION[step.modifier] : undefined
  return r ?? 0
}
