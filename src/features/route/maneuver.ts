// ─── Maneuver text + arrow helpers ─────────────────────────────────────
// Shared between routeStore (voice) and TurnInstruction (display).

import type { RouteStep } from './types.js'

// Bulgarian voice strings (lowercase — capitalize at call site if needed)
const MODIFIER_VOICE: Record<string, string> = {
  'uturn':        'обърнете се',
  'sharp right':  'завийте рязко надясно',
  'right':        'завийте надясно',
  'slight right': 'завийте леко надясно',
  'straight':     'продължете направо',
  'slight left':  'завийте леко наляво',
  'left':         'завийте наляво',
  'sharp left':   'завийте рязко наляво',
}

// Bulgarian display strings (title-case)
const MODIFIER_DISPLAY: Record<string, string> = {
  'uturn':        'Обърнете се',
  'sharp right':  'Рязко надясно',
  'right':        'Завийте надясно',
  'slight right': 'Леко надясно',
  'straight':     'Продължете',
  'slight left':  'Леко наляво',
  'left':         'Завийте наляво',
  'sharp left':   'Рязко наляво',
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

/** Text for voice synthesis (Bulgarian). */
export function maneuverVoiceText(step: RouteStep): string {
  if (step.type === 'arrive')                                  return 'Пристигнахте'
  if (step.type === 'depart')                                  return 'Тръгнете'
  if (step.type === 'roundabout' || step.type === 'rotary')   return 'Влезте в кръговото движение'
  if (step.type === 'exit roundabout' || step.type === 'exit rotary') return 'Излезте от кръговото'
  const v = step.modifier ? MODIFIER_VOICE[step.modifier] : undefined
  return v ? cap(v) : 'Продължете'
}

/** Short text for the HUD display. */
export function maneuverDisplayText(step: RouteStep): string {
  if (step.type === 'arrive')                                  return 'Пристигнахте'
  if (step.type === 'depart')                                  return 'Тръгнете'
  if (step.type === 'roundabout' || step.type === 'rotary')   return 'Кръгово'
  if (step.type === 'exit roundabout' || step.type === 'exit rotary') return 'Излезте от кръговото'
  const d = step.modifier ? MODIFIER_DISPLAY[step.modifier] : undefined
  return d ?? 'Продължете'
}

/** Arrow rotation for the step (degrees, clockwise from up). */
export function maneuverArrowRotation(step: RouteStep): number {
  if (step.type === 'arrive') return 0
  if (step.type === 'roundabout' || step.type === 'rotary') return 45
  const r = step.modifier !== undefined ? MODIFIER_ROTATION[step.modifier] : undefined
  return r ?? 0
}
