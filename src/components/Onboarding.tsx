// ─── Onboarding overlay ──────────────────────────────────────────────────
// Shown only on first visit (localStorage flag).
// 3-step carousel — large text, single tap to advance, designed for Tesla.
//
// Layout (mobile-first):
//   ┌─────────────────────────┐
//   │  scrollable content     │  flex: 1, overflowY: auto
//   │  (dots, icon, text,     │  → never clips on small phones
//   │   bullets, hint)        │
//   ├─────────────────────────┤
//   │  sticky CTA footer      │  flexShrink: 0
//   │  (button always visible)│  → always reachable regardless of content height
//   └─────────────────────────┘
//
// Country-aware: steps are derived from the selected country config.

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
  bullets?: string[]
  note?:    string
}

function getSteps(country: CountryConfig): Step[] {
  const isBg = getLang() === 'bg'

  const step1: Step = isBg ? {
    icon:    '⚡',
    title:   'Добре дошли в TesRadar',
    body:    'Всичко нужно за пътя — в един екран.',
    bullets: [
      '⚡  1 400+ зарядни станции в България',
      '📷  47 отсечки за средна скорост с live bar',
      '🚨  Репорти за полиция от общността в реално време',
      '🚧  Пътни затваряния от официален държавен фийд',
      '🗺️  Гласова навигация с пренасочване',
    ],
    hint: null,
  } : {
    icon:    '⚡',
    title:   'TesRadar',
    body:    'Smarter driving — built for Tesla.',
    bullets: [
      '⚡  17 000+ EV chargers across Europe',
      '📷  Average-speed camera alerts with live bar',
      '🚨  Community police & hazard reports',
      '🚧  Live road closures — official DATEX II feed',
      '🗺️  Voice navigation with live rerouting',
    ],
    hint: null,
  }

  const step2: Step = country.features.speedSections
    ? (isBg ? {
        icon:  '📷',
        title: 'Камери, полиция и средна скорост',
        body:  'Системата следи 47 отсечки за средна скорост. Репорти за полиция и катастрофи от общността достигат до теб секунди след подаването им. Пътните затваряния се зареждат от официалния DATEX II фийд на АПИ.',
        hint:  '⚠️  Предупреждение 2 км преди зоната',
      } : {
        icon:  '📷',
        title: 'Speed Cameras & Police Reports',
        body:  'Average-speed camera sections monitored in real time. Community police reports alert you to controls on your route within seconds of being submitted.',
        hint:  '⚠️  Warning 2 km before each zone',
      })
    : (isBg ? {
        icon:    '⚡',
        title:   'EV зарядни станции',
        body:    'Над 1 400 зарядни станции в България от Tesla, OCM и OpenStreetMap. Филтрирай по конектор и мощност.',
        hint:    null,
      } : {
        icon:    '⚡',
        title:   'EV Charging Network',
        body:    'Every public charger near you — Tesla Superchargers, CCS, CHAdeMO and Type 2.',
        bullets: [
          '🔌  Filter by connector type',
          '⚡  Filter by speed (50 kW, 150 kW+)',
          '📍  Tap any charger for details',
        ],
        hint:    null,
      })

  const step3: Step = isBg ? {
    icon:  '🗺️',
    title: 'Навигация и репортване',
    body:  'Гласово навигиране с автоматично пренасочване при отклонение. Запази Дом и Работа за бърз старт. Натисни Report за да споделиш полиция, катастрофа или опасност — репортът достига до всички шофьори наблизо.',
    hint:  '🔊  Докоснете екрана за да активирате звука',
  } : {
    icon:  '🗺️',
    title: 'Navigation & Reporting',
    body:  'Voice-guided routing with live rerouting. Save Home & Work for one-tap navigation. Tap Report to share a police sighting, accident or hazard — your alert reaches every driver nearby.',
    hint:  '🔊  Tap the screen to enable audio alerts',
  }

  return [step1, step2, step3]
}

export function Onboarding() {
  const [step, setStep] = useState(0)

  if (!countryStore.isChosen()) return null
  if (typeof localStorage !== 'undefined' && localStorage.getItem(STORAGE_KEY)) return null

  const country     = countryStore.getCountryOrDefault()
  const steps       = getSteps(country)
  const isBg        = getLang() === 'bg'
  const isLast      = step === steps.length - 1
  const current     = steps[step]!
  const hasBullets  = Boolean(current.bullets?.length)

  const nextLabel  = isBg ? 'Напред'  : 'Next'
  const startLabel = isBg ? 'Започни' : 'Get started'

  function advance() {
    if (isLast) {
      localStorage.setItem(STORAGE_KEY, '1')
      const el = document.getElementById('onboarding-root')
      if (el) el.style.display = 'none'
    } else {
      setStep((s) => s + 1)
    }
  }

  return (
    <div
      id="onboarding-root"
      style={{
        position: 'fixed', inset: 0, zIndex: 900,
        background: 'rgba(0,0,0,0.88)',
        backdropFilter: 'blur(10px)',
        WebkitBackdropFilter: 'blur(10px)',
        display: 'flex',
        flexDirection: 'column',
        // no overflow here — each section handles its own
      }}
    >
      {/* ── Scrollable content area ─────────────────────────────────────── */}
      <div style={{
        flex: 1,
        overflowY: 'auto',
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        WebkitOverflowScrolling: 'touch' as any,
        // Allow vertical pan (scroll) — block horizontal
        touchAction: 'pan-y',
      }}>
        <div style={{
          display: 'flex', flexDirection: 'column',
          alignItems: 'center', textAlign: 'center',
          padding: '40px 24px 24px',
          // minHeight 100% so content centers vertically when shorter than viewport
          minHeight: '100%',
          boxSizing: 'border-box',
        }}>
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

          {/* Body */}
          <div style={{
            fontSize: 15,
            color:    hasBullets ? 'rgba(255,255,255,0.5)' : 'rgba(255,255,255,0.7)',
            lineHeight: 1.6,
            maxWidth: 340,
            marginBottom: hasBullets ? 16 : (current.hint ? 16 : 8),
            fontStyle: hasBullets ? 'italic' : undefined,
          }}>
            {current.body}
          </div>

          {/* Bullet list */}
          {hasBullets && (
            <div style={{
              width: '100%', maxWidth: 340,
              marginBottom: current.note ? 10 : (current.hint ? 16 : 8),
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

          {/* Note */}
          {current.note && (
            <div style={{
              marginBottom: current.hint ? 16 : 8,
              fontSize: 11, color: 'rgba(255,255,255,0.3)',
              letterSpacing: '0.03em', maxWidth: 340, lineHeight: 1.5,
            }}>
              {current.note}
            </div>
          )}

          {/* Hint badge */}
          {current.hint && (
            <div style={{
              marginBottom: 8,
              padding: '8px 16px', borderRadius: 10,
              background: 'rgba(255,255,255,0.07)',
              border: '1px solid rgba(255,255,255,0.12)',
              fontSize: 13, color: 'rgba(255,255,255,0.55)',
            }}>
              {current.hint}
            </div>
          )}
        </div>
      </div>

      {/* ── Sticky CTA footer — always visible ─────────────────────────── */}
      <div style={{
        flexShrink: 0,
        display: 'flex', flexDirection: 'column', alignItems: 'center',
        padding: '16px 24px',
        // Respect iOS home-indicator safe area
        paddingBottom: 'max(24px, env(safe-area-inset-bottom, 24px))',
        background: 'rgba(0,0,0,0.6)',
        borderTop: '1px solid rgba(255,255,255,0.06)',
        backdropFilter: 'blur(8px)',
        WebkitBackdropFilter: 'blur(8px)',
        gap: 12,
      }}>
        {/* CTA button */}
        <button
          onClick={advance}
          style={{
            width: '100%', maxWidth: 340,
            padding: '15px 48px', borderRadius: 14,
            background: '#e31937', border: 'none',
            color: '#fff', fontSize: 17, fontWeight: 700,
            letterSpacing: '0.01em',
            boxShadow: '0 4px 20px rgba(227,25,55,0.4)',
            cursor: 'pointer',
            touchAction: 'manipulation',
          }}
        >
          {isLast ? startLabel : nextLabel}
        </button>

        {/* Disclaimer */}
        <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.18)', maxWidth: 340, lineHeight: 1.4, textAlign: 'center' }}>
          {isBg
            ? 'TesRadar е независим проект, който не е обвързан с Tesla или други компании.'
            : 'TesRadar is an independent project not affiliated with Tesla or any other company.'}
        </div>
      </div>
    </div>
  )
}
