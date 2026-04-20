// ─── Onboarding overlay ──────────────────────────────────────────────────
// Shown only on first visit (localStorage flag).
// 3-step carousel — large text, single tap to advance, designed for Tesla.
//
// Country-aware: steps are derived from the selected country config.
//   - EN locale (Norway): step 1 = full welcome screen with benefit bullets
//   - BG locale (Bulgaria): step 1 = standard welcome paragraph
//   - features.speedSections = true  → camera/section step
//   - features.speedSections = false → EV-focused step
//
// Step interface supports optional `bullets[]` and `note` fields.
// When `bullets` is present: body renders as a tagline; bullets appear below.
// When `note` is present: small print shown below body/bullets.

import { useState } from 'react'
import { countryStore } from '@/lib/countryStore'
import { getLang } from '@/lib/locale'
import type { CountryConfig } from '@/config/countries'

const STORAGE_KEY = 'teslaradar-onboarded-v2'

interface Step {
  icon:     string
  title:    string
  body:     string
  hint:     string | null
  /** When present: rendered as bullet list below the tagline (body). */
  bullets?: string[]
  /** When present: small print below body / bullets. */
  note?:    string
}

function getSteps(country: CountryConfig): Step[] {
  const isBg = getLang() === 'bg'

  // ── Step 1: Welcome ───────────────────────────────────────────────────
  // EN: full welcome screen with tagline + benefit bullets + early-version note
  // BG: standard single-paragraph welcome

  const step1: Step = isBg ? {
    icon:  '⚡',
    title: 'Добре дошли в TesRadar',
    body:  'Навигационен асистент за шофьори — EV зарядни станции, камери за средна скорост и пътни инциденти в реално време.',
    hint:  null,
  } : {
    icon:    '⚡',
    title:   'TesRadar',
    body:    'Smarter driving for Tesla owners.',
    bullets: [
      '⚡  EV charging stations — find available chargers',
      '🚨  Live alerts — police, hazards, accidents',
      '🗺️  Route planning with real-time ETA',
      '🔊  Audio alerts — never miss what matters',
    ],
    note:  'Early release · Data coverage growing · Built for Tesla drivers',
    hint:  null,
  }

  // ── Step 2: Feature highlight ─────────────────────────────────────────
  // BG with speedSections: camera/section step
  // NO (no speedSections): EV-focused step

  const step2: Step = country.features.speedSections
    ? (isBg ? {
        icon:  '📷',
        title: 'Камери и средна скорост',
        body:  'Системата следи 47 отсечки за средна скорост в България. При наближаване виждате предупреждение и progress bar с текущата ви средна скорост.',
        hint:  '⚠️  Предупреждение 2 км преди зоната',
      } : {
        icon:  '📷',
        title: 'Average Speed Cameras',
        body:  'The system monitors average-speed camera sections. You get a warning 2 km before the zone, with your live average speed on a progress bar.',
        hint:  '⚠️  Warning 2 km before the zone',
      })
    : (isBg ? {
        icon:  '⚡',
        title: 'EV зарядни станции',
        body:  'Виждайте зарядни станции наоколо в реално време. Филтрирайте по свободни места, тип конектор и мощност.',
        hint:  null,
      } : {
        icon:    '⚡',
        title:   'EV Charging Network',
        body:    'Every public charger near you — updated live.',
        bullets: [
          '🔌  Filter by connector (CCS, CHAdeMO, Type 2)',
          '⚡  Filter by speed (50 kW, 150 kW+)',
          '✅  See real-time availability',
        ],
        hint:    null,
      })

  // ── Step 3: Routes, events, reporting ────────────────────────────────

  const step3: Step = isBg ? {
    icon:  '🗺️',
    title: 'Станции, маршрути и репортване',
    body:  'Намерете зарядна станция, планирайте маршрут с ETA. Докоснете Report за да споделите полиция, катастрофа или опасност.',
    hint:  '🔊  Докоснете екрана за да активирате звука',
  } : {
    icon:  '🗺️',
    title: 'Routes, Events & Reporting',
    body:  'Plan a route with ETA. Tap Report to share a police sighting, accident or road hazard — your alerts help every Tesla driver nearby.',
    hint:  '🔊  Tap the screen to enable sound alerts',
  }

  return [step1, step2, step3]
}

export function Onboarding() {
  const [step, setStep] = useState(0)

  // Country must be chosen first (CountryPicker handles that step)
  if (!countryStore.isChosen()) return null

  // Already onboarded — render nothing
  if (typeof localStorage !== 'undefined' && localStorage.getItem(STORAGE_KEY)) {
    return null
  }

  const country  = countryStore.getCountryOrDefault()
  const steps    = getSteps(country)
  const isBg     = getLang() === 'bg'
  const isLast   = step === steps.length - 1
  const current  = steps[step]!

  const nextLabel  = isBg ? 'Напред'    : 'Next'
  const startLabel = isBg ? 'Започни'   : 'Get started'
  const tapHint    = isBg ? 'Докоснете навсякъде за продължение' : 'Tap anywhere to continue'

  function advance() {
    if (isLast) {
      localStorage.setItem(STORAGE_KEY, '1')
      // Remove from DOM directly — avoids re-render cost
      const el = document.getElementById('onboarding-root')
      if (el) el.style.display = 'none'
    } else {
      setStep((s) => s + 1)
    }
  }

  const hasBullets = Boolean(current.bullets?.length)

  return (
    <div
      id="onboarding-root"
      onClick={advance}
      style={{
        position: 'fixed', inset: 0, zIndex: 900,
        background: 'rgba(0,0,0,0.88)',
        backdropFilter: 'blur(10px)',
        WebkitBackdropFilter: 'blur(10px)',
        display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center',
        padding: '32px 24px', gap: 0,
        textAlign: 'center', touchAction: 'manipulation',
      }}
    >
      {/* Step dots */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 28 }}>
        {steps.map((_, i) => (
          <div key={i} style={{
            width:  i === step ? 20 : 6,
            height: 6,
            borderRadius: 3,
            background: i === step ? '#e31937' : 'rgba(255,255,255,0.2)',
            transition: 'width 0.25s ease, background 0.25s ease',
          }} />
        ))}
      </div>

      {/* Icon */}
      <div style={{ fontSize: 52, marginBottom: 16, lineHeight: 1 }}>
        {current.icon}
      </div>

      {/* Title */}
      <div style={{
        fontSize: 24, fontWeight: 800, color: '#fff',
        letterSpacing: '-0.3px', marginBottom: 12,
        maxWidth: 360,
      }}>
        {current.title}
      </div>

      {/* Body — tagline when bullets are present */}
      <div style={{
        fontSize:   hasBullets ? 15 : 15,
        color:      hasBullets ? 'rgba(255,255,255,0.5)' : 'rgba(255,255,255,0.7)',
        fontWeight: hasBullets ? 400 : 400,
        lineHeight: 1.6,
        maxWidth:   340,
        marginBottom: hasBullets ? 16 : (current.hint ? 16 : 36),
        fontStyle:  hasBullets ? 'italic' : undefined,
      }}>
        {current.body}
      </div>

      {/* Bullet list — shown for EN welcome step */}
      {hasBullets && (
        <div style={{
          width: '100%', maxWidth: 340,
          marginBottom: current.note ? 10 : (current.hint ? 16 : 36),
          display: 'flex', flexDirection: 'column', gap: 6,
          textAlign: 'left',
        }}>
          {current.bullets!.map((b) => (
            <div key={b} style={{
              padding: '9px 14px',
              borderRadius: 10,
              background: 'rgba(255,255,255,0.05)',
              border: '1px solid rgba(255,255,255,0.08)',
              fontSize: 14,
              color: 'rgba(255,255,255,0.78)',
              lineHeight: 1.4,
              fontWeight: 500,
            }}>
              {b}
            </div>
          ))}
        </div>
      )}

      {/* Small note — early version / built for Tesla */}
      {current.note && (
        <div style={{
          marginBottom: current.hint ? 16 : 36,
          fontSize: 11,
          color: 'rgba(255,255,255,0.3)',
          letterSpacing: '0.03em',
          maxWidth: 340,
          lineHeight: 1.5,
        }}>
          {current.note}
        </div>
      )}

      {/* Hint badge */}
      {current.hint && (
        <div style={{
          marginBottom: 36,
          padding: '8px 16px', borderRadius: 10,
          background: 'rgba(255,255,255,0.07)',
          border: '1px solid rgba(255,255,255,0.12)',
          fontSize: 13, color: 'rgba(255,255,255,0.55)',
        }}>
          {current.hint}
        </div>
      )}

      {/* CTA button */}
      <div style={{
        padding: '14px 48px', borderRadius: 14,
        background: '#e31937',
        color: '#fff', fontSize: 17, fontWeight: 700,
        letterSpacing: '0.01em',
        boxShadow: '0 4px 20px rgba(227,25,55,0.4)',
      }}>
        {isLast ? startLabel : nextLabel}
      </div>

      <div style={{ marginTop: 14, fontSize: 12, color: 'rgba(255,255,255,0.22)' }}>
        {tapHint}
      </div>

      <div style={{ marginTop: 10, fontSize: 10, color: 'rgba(255,255,255,0.15)', maxWidth: 340, lineHeight: 1.4 }}>
        {isBg
          ? 'Независим проект — не е свързан с Tesla, Inc.'
          : 'This is an independent project not affiliated with Tesla.'}
      </div>
    </div>
  )
}
