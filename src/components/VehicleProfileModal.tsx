// ─── Vehicle Profile Modal — Premium Redesign ──────────────────────────
// Split layout: left = model visual + selector, right = detail config.
// Inline SVG silhouettes per model — zero network, instant, vector-crisp.
// Touch-friendly battery slider with +/− fine controls.

import { useState, useEffect, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { vehicleProfileStore } from '@/features/planning/store'
import { batteryStore } from '@/features/planning/batteryStore'
import { TESLA_MODELS, getYearsForModel, getTrimsForYear } from '@/features/planning/vehicleConfig'
import type { TeslaModel } from '@/features/planning/types'
import { isTeslaBrowser } from '@/lib/browser'
import { countryStore } from '@/lib/countryStore'

// ── Model S 3-step configurator constants ─────────────────────────────
const MS_YEAR_GROUPS = ['2012–2016', '2016–2019', '2019–2021', '2021+'] as const
type MSYearGroup = typeof MS_YEAR_GROUPS[number]

// year group → { battery kWh → drive options }
const MS_OPTIONS: Record<MSYearGroup, Record<number, string[]>> = {
  '2012–2016': { 60: ['RWD'], 70: ['AWD'], 85: ['RWD', 'AWD'] },
  '2016–2019': { 75: ['RWD', 'AWD'], 90: ['AWD'], 100: ['AWD'] },
  '2019–2021': { 100: ['AWD'] },
  '2021+':     { 100: ['AWD', 'Plaid'] },
}

// (group_battery_drive) → vehicleConfig trim ID
const MS_TRIM_IDS: Record<string, string> = {
  '2012–2016_60_RWD':   'S60',
  '2012–2016_70_AWD':   'S70D',
  '2012–2016_85_RWD':   'S85',
  '2012–2016_85_AWD':   'S85D',
  '2016–2019_75_RWD':   'S75',
  '2016–2019_75_AWD':   'S75D',
  '2016–2019_90_AWD':   'S90D',
  '2016–2019_100_AWD':  'S100D',
  '2019–2021_100_AWD':  'LR_AWD_19',
  '2021+_100_AWD':      'LR_AWD',
  '2021+_100_Plaid':    'PLAID',
}

// Representative year saved per group (used by getTrimConfig)
const MS_GROUP_YEAR: Record<MSYearGroup, number> = {
  '2012–2016': 2014, '2016–2019': 2017, '2019–2021': 2020, '2021+': 2022,
}

// Reverse map: existing trim ID → [group, battery, drive]
const MS_REVERSE: Record<string, [MSYearGroup, number, string]> = {
  'S60':       ['2012–2016', 60,  'RWD'],
  'S70D':      ['2012–2016', 70,  'AWD'],
  'S85':       ['2012–2016', 85,  'RWD'],
  'S85D':      ['2012–2016', 85,  'AWD'],
  'P85':       ['2012–2016', 85,  'AWD'],
  'P85D':      ['2012–2016', 85,  'AWD'],
  'S75':       ['2016–2019', 75,  'RWD'],
  'S75D':      ['2016–2019', 75,  'AWD'],
  'S90D':      ['2016–2019', 90,  'AWD'],
  'P90D':      ['2016–2019', 90,  'AWD'],
  'S100D':     ['2016–2019', 100, 'AWD'],
  'P100D':     ['2016–2019', 100, 'AWD'],
  'LR':        ['2019–2021', 100, 'AWD'],
  'LR_AWD_19': ['2019–2021', 100, 'AWD'],
  'LR_AWD':    ['2021+',     100, 'AWD'],
  'PLAID':     ['2021+',     100, 'Plaid'],
}

// ── Locale-aware label map ─────────────────────────────────────────────
// Computed once per modal open — no live reactivity needed.
function getLabels() {
  const locale = countryStore.getCountryOrDefault().locale
  const isBg   = locale === 'bg'
  return {
    title:           isBg ? 'Профил на автомобила'                             : 'Vehicle Setup',
    model:           isBg ? 'Модел'                                             : 'Model',
    trim:            isBg ? 'Версия'                                            : 'Version',
    year:            isBg ? 'Година'                                            : 'Year',
    battery:         isBg ? 'Текущ заряд'                                       : 'Current charge',
    batteryHint:     isBg ? 'нужен за планиране при пътуване'                  : 'needed for trip planning',
    degradation:     isBg ? 'Деградация (незадължително)'                       : 'Degradation (optional)',
    degradationHint: isBg ? 'Остави празно — ще се изчисли по годината.'        : 'Leave blank — will be estimated by year.',
    privacy:         isBg ? 'Данните се съхраняват локално на устройството. Не се изпращат никъде.' : 'Your data is stored locally. Nothing is shared.',
    placeholder:     isBg ? 'напр. 8'                                           : 'e.g. 8',
    later:           isBg ? 'По-късно'                                          : 'Later',
    save:            isBg ? 'Запази'                                            : 'Save',
    close:           isBg ? 'Затвори'                                           : 'Close',
    dialogLabel:     isBg ? 'Профил на автомобила'                             : 'Vehicle Setup',
  }
}

// ── Imperative opener ──────────────────────────────────────────────────
let _open: (() => void) | null = null
export function openVehicleProfileModal(): void { _open?.() }

// ── Tesla car SVG silhouettes ──────────────────────────────────────────
// Clean minimal side-profile vector art. Fixed 280×120 viewBox for all models.
// Pure CSS fill — no stroke complexity — GPU-friendly rendering.

function CarSilhouette({ model }: { model: TeslaModel }) {
  const props = {
    width: '100%',
    viewBox: '0 0 280 120',
    fill: 'none',
    style: { display: 'block', maxHeight: 130 } as React.CSSProperties,
  }

  if (model === 'Model 3') return (
    <svg {...props} aria-label="Tesla Model 3">
      {/* Body */}
      <path d="M30 82 C30 82 38 62 60 55 C82 48 110 44 140 44 C170 44 200 46 218 54 C236 62 248 72 250 82 Z"
        fill="#2a2a35" />
      {/* Cabin */}
      <path d="M75 55 C82 42 100 34 130 33 C158 32 178 38 192 50 C200 55 202 60 198 62 C178 64 110 64 78 62 Z"
        fill="#1a1a24" />
      {/* Window shine */}
      <path d="M90 54 C96 44 112 37 132 36 C150 35 165 40 175 48 L168 53 C155 44 136 40 115 41 C97 42 90 50 88 56 Z"
        fill="rgba(255,255,255,0.08)" />
      {/* Wheels */}
      <circle cx="78"  cy="85" r="15" fill="#1a1a24" />
      <circle cx="78"  cy="85" r="9"  fill="#2e2e3e" />
      <circle cx="78"  cy="85" r="4"  fill="#3e3e50" />
      <circle cx="202" cy="85" r="15" fill="#1a1a24" />
      <circle cx="202" cy="85" r="9"  fill="#2e2e3e" />
      <circle cx="202" cy="85" r="4"  fill="#3e3e50" />
      {/* Ground line */}
      <line x1="20" y1="100" x2="260" y2="100" stroke="rgba(255,255,255,0.07)" strokeWidth="1" />
      {/* Headlight */}
      <path d="M248 70 L256 68 L258 74 L250 75 Z" fill="rgba(255,255,255,0.3)" />
      {/* Tail */}
      <path d="M32 70 L24 72 L22 78 L30 78 Z" fill="rgba(227,25,55,0.5)" />
    </svg>
  )

  if (model === 'Model Y') return (
    <svg {...props} aria-label="Tesla Model Y">
      {/* Body — taller, more upright SUV shape */}
      <path d="M28 84 C28 84 36 60 58 52 C80 44 112 40 140 40 C168 40 200 42 220 52 C240 62 250 74 252 84 Z"
        fill="#2a2a35" />
      {/* Cabin — SUV higher roofline */}
      <path d="M70 52 C76 36 100 28 132 27 C162 26 185 34 200 46 C208 52 210 58 205 60 C180 62 100 62 72 60 Z"
        fill="#1a1a24" />
      {/* Window */}
      <path d="M84 51 C90 38 110 30 135 29 C158 28 176 36 188 46 L180 51 C168 40 148 35 128 36 C106 37 94 45 90 54 Z"
        fill="rgba(255,255,255,0.08)" />
      {/* Wheels */}
      <circle cx="76"  cy="87" r="16" fill="#1a1a24" />
      <circle cx="76"  cy="87" r="9"  fill="#2e2e3e" />
      <circle cx="76"  cy="87" r="4"  fill="#3e3e50" />
      <circle cx="204" cy="87" r="16" fill="#1a1a24" />
      <circle cx="204" cy="87" r="9"  fill="#2e2e3e" />
      <circle cx="204" cy="87" r="4"  fill="#3e3e50" />
      <line x1="20" y1="103" x2="260" y2="103" stroke="rgba(255,255,255,0.07)" strokeWidth="1" />
      <path d="M250 70 L258 68 L260 75 L252 76 Z" fill="rgba(255,255,255,0.3)" />
      <path d="M30 70 L22 72 L20 79 L28 79 Z" fill="rgba(227,25,55,0.5)" />
    </svg>
  )

  if (model === 'Model S') return (
    <svg {...props} aria-label="Tesla Model S">
      {/* Body — longer, lower fastback */}
      <path d="M24 80 C24 80 34 60 58 53 C82 46 112 43 142 43 C172 43 205 45 224 54 C243 63 254 73 256 80 Z"
        fill="#2a2a35" />
      {/* Fastback cabin — long sweeping roofline */}
      <path d="M72 54 C82 38 106 30 138 29 C165 28 188 36 208 50 C216 56 214 62 208 64 C185 66 102 66 76 64 Z"
        fill="#1a1a24" />
      {/* Window */}
      <path d="M87 53 C96 40 116 32 140 31 C163 30 183 38 200 50 L192 56 C177 45 158 39 138 40 C115 41 99 49 94 57 Z"
        fill="rgba(255,255,255,0.08)" />
      {/* Wheels */}
      <circle cx="80"  cy="83" r="16" fill="#1a1a24" />
      <circle cx="80"  cy="83" r="9"  fill="#2e2e3e" />
      <circle cx="80"  cy="83" r="4"  fill="#3e3e50" />
      <circle cx="208" cy="83" r="16" fill="#1a1a24" />
      <circle cx="208" cy="83" r="9"  fill="#2e2e3e" />
      <circle cx="208" cy="83" r="4"  fill="#3e3e50" />
      <line x1="14" y1="99" x2="266" y2="99" stroke="rgba(255,255,255,0.07)" strokeWidth="1" />
      <path d="M254 68 L262 66 L264 73 L256 74 Z" fill="rgba(255,255,255,0.3)" />
      <path d="M26 68 L18 70 L16 77 L24 77 Z" fill="rgba(227,25,55,0.5)" />
    </svg>
  )

  if (model === 'Model X') return (
    <svg {...props} aria-label="Tesla Model X">
      {/* Body — large tall SUV */}
      <path d="M24 86 C24 86 34 60 58 50 C82 40 112 37 142 37 C172 37 205 39 224 50 C243 61 254 75 256 86 Z"
        fill="#2a2a35" />
      {/* Cabin */}
      <path d="M66 50 C74 32 100 24 136 23 C168 22 194 32 212 46 C220 52 220 60 212 62 C184 64 96 64 70 62 Z"
        fill="#1a1a24" />
      {/* Falcon wing hint — subtle lines at roof */}
      <path d="M142 26 L110 32 M142 26 L174 32" stroke="rgba(255,255,255,0.12)" strokeWidth="1.5" />
      {/* Window */}
      <path d="M82 50 C90 35 114 27 140 26 C164 25 184 33 200 46 L192 51 C178 39 158 34 138 35 C112 36 96 44 90 53 Z"
        fill="rgba(255,255,255,0.08)" />
      {/* Wheels */}
      <circle cx="78"  cy="89" r="17" fill="#1a1a24" />
      <circle cx="78"  cy="89" r="10" fill="#2e2e3e" />
      <circle cx="78"  cy="89" r="5"  fill="#3e3e50" />
      <circle cx="206" cy="89" r="17" fill="#1a1a24" />
      <circle cx="206" cy="89" r="10" fill="#2e2e3e" />
      <circle cx="206" cy="89" r="5"  fill="#3e3e50" />
      <line x1="14" y1="106" x2="266" y2="106" stroke="rgba(255,255,255,0.07)" strokeWidth="1" />
      <path d="M254 72 L262 70 L264 77 L256 78 Z" fill="rgba(255,255,255,0.3)" />
      <path d="M26 72 L18 74 L16 81 L24 81 Z" fill="rgba(227,25,55,0.5)" />
    </svg>
  )

  // Cybertruck — angular/geometric
  return (
    <svg {...props} aria-label="Tesla Cybertruck">
      {/* Bed + body — sharp angles */}
      <path d="M22 82 L22 60 L80 60 L96 42 L200 42 L240 60 L258 60 L258 82 Z"
        fill="#2a2a35" />
      {/* Cab detail */}
      <path d="M96 42 L110 28 L186 28 L200 42 Z"
        fill="#1e1e2a" />
      {/* Window */}
      <path d="M114 42 L124 30 L178 30 L188 42 Z"
        fill="#1a1a24" />
      <path d="M120 40 L128 32 L160 32 L168 40 Z"
        fill="rgba(255,255,255,0.08)" />
      {/* Bed cover */}
      <path d="M22 60 L80 60 L80 56 L26 56 Z"
        fill="rgba(255,255,255,0.05)" />
      {/* Wheels */}
      <circle cx="80"  cy="85" r="17" fill="#1a1a24" />
      <circle cx="80"  cy="85" r="10" fill="#2e2e3e" />
      <circle cx="80"  cy="85" r="5"  fill="#3e3e50" />
      <circle cx="208" cy="85" r="17" fill="#1a1a24" />
      <circle cx="208" cy="85" r="10" fill="#2e2e3e" />
      <circle cx="208" cy="85" r="5"  fill="#3e3e50" />
      <line x1="14" y1="102" x2="266" y2="102" stroke="rgba(255,255,255,0.07)" strokeWidth="1" />
      {/* Headlights — strip style */}
      <path d="M244 60 L258 60 L258 64 L244 64 Z" fill="rgba(255,255,255,0.25)" />
      <path d="M22 60 L36 60 L36 64 L22 64 Z" fill="rgba(227,25,55,0.4)" />
    </svg>
  )
}

// ── Battery color helper ───────────────────────────────────────────────
function batteryColor(pct: number): string {
  if (pct >= 60) return '#22c55e'
  if (pct >= 30) return '#eab308'
  return '#ef4444'
}

// ── Close icon ────────────────────────────────────────────────────────
function CloseX() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true"
      stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
      <line x1="3" y1="3" x2="13" y2="13" />
      <line x1="13" y1="3" x2="3" y2="13" />
    </svg>
  )
}

// ── Main modal ────────────────────────────────────────────────────────
export function VehicleProfileModal() {
  const [open,  setOpen]  = useState(false)
  const [shown, setShown] = useState(false)

  const existing = vehicleProfileStore.get()
  const [model,   setModel]   = useState<TeslaModel>(existing?.model ?? 'Model 3')
  const [year,    setYear]    = useState<number>(existing?.year ?? new Date().getFullYear() - 1)
  const [trim,    setTrim]    = useState<string>(existing?.trim ?? '')
  const [battery, setBattery] = useState<number>(existing?.currentBatteryPercent ?? 80)
  const [degrad,  setDegrad]  = useState<string>(
    existing?.degradationPercent != null ? String(existing.degradationPercent) : ''
  )

  // ── Model S 3-step state ──────────────────────────────────────────────
  const [msGroup, setMsGroup] = useState<MSYearGroup | null>(null)
  const [msBat,   setMsBat]   = useState<number | null>(null)
  const [msDrv,   setMsDrv]   = useState<string | null>(null)
  const isMS = model === 'Model S'

  // Derived trim ID for Model S — null if selection incomplete
  const msTrimId = (isMS && msGroup && msBat && msDrv)
    ? (MS_TRIM_IDS[`${msGroup}_${msBat}_${msDrv}`] ?? null)
    : null

  const years = getYearsForModel(model)
  const trims = getTrimsForYear(model, year)

  function handleModelChange(m: TeslaModel) {
    setModel(m)
    if (m === 'Model S') {
      setMsGroup('2021+'); setMsBat(100); setMsDrv('AWD')
    } else {
      const ys = getYearsForModel(m)
      const ny = ys[0] ?? new Date().getFullYear()
      setYear(ny)
      const ts = getTrimsForYear(m, ny)
      setTrim(ts[0]?.id ?? '')
    }
  }

  function handleYearChange(y: number) {
    setYear(y)
    const ts = getTrimsForYear(model, y)
    if (!ts.find((t) => t.id === trim)) setTrim(ts[0]?.id ?? '')
  }

  const labels = getLabels()

  function doOpen() {
    const p = vehicleProfileStore.get()
    if (p) {
      setModel(p.model); setYear(p.year); setTrim(p.trim)
      setBattery(p.currentBatteryPercent)
      setDegrad(p.degradationPercent != null ? String(p.degradationPercent) : '')
      if (p.model === 'Model S') {
        const rev = MS_REVERSE[p.trim]
        if (rev) { setMsGroup(rev[0]); setMsBat(rev[1]); setMsDrv(rev[2]) }
        else      { setMsGroup('2021+'); setMsBat(100); setMsDrv('AWD') }
      } else {
        setMsGroup(null); setMsBat(null); setMsDrv(null)
      }
    } else {
      const dm: TeslaModel = 'Model 3'
      const dy = new Date().getFullYear() - 1
      setModel(dm); setYear(dy)
      setTrim(getTrimsForYear(dm, dy)[0]?.id ?? '')
      setBattery(80); setDegrad('')
      setMsGroup(null); setMsBat(null); setMsDrv(null)
    }
    setOpen(true)
    if (isTeslaBrowser) {
      setShown(true)
    } else {
      requestAnimationFrame(() => requestAnimationFrame(() => setShown(true)))
    }
  }
  _open = doOpen

  const close = useCallback(() => {
    setShown(false)
    setTimeout(() => setOpen(false), isTeslaBrowser ? 0 : 220)
  }, [])

  useEffect(() => {
    if (!vehicleProfileStore.get()) {
      const t = setTimeout(doOpen, 800)
      return () => clearTimeout(t)
    }
  }, [])  // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!open) return
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') close() }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [open, close])

  function handleSave() {
    const dv = degrad.trim() === '' ? null : Math.max(0, Math.min(30, Number(degrad)))
    const degradVal = isNaN(dv as number) ? null : dv

    const savedYear = (isMS && msGroup) ? MS_GROUP_YEAR[msGroup] : year
    const savedTrim = (isMS && msTrimId) ? msTrimId : (trim || (trims[0]?.id ?? ''))

    const savedProfile = {
      model,
      year: savedYear,
      trim: savedTrim,
      currentBatteryPercent: Math.round(battery),
      degradationPercent: degradVal,
    }
    vehicleProfileStore.save(savedProfile)
    batteryStore.resetFromProfile({ ...savedProfile, updatedAt: Date.now() })
    close()
  }

  if (!open) return null

  const col     = batteryColor(battery)
  const canSave = isMS
    ? Boolean(msTrimId)
    : Boolean(model && year && (trim || trims.length === 0))

  const SELECT_STYLE: React.CSSProperties = {
    width: '100%',
    padding: '11px 36px 11px 14px',
    borderRadius: 10,
    background: 'rgba(255,255,255,0.06)',
    border: '1px solid rgba(255,255,255,0.14)',
    color: '#f2f2f2',
    fontSize: 16,
    outline: 'none',
    boxSizing: 'border-box',
    fontFamily: 'inherit',
    appearance: 'none',
    WebkitAppearance: 'none',
    cursor: 'pointer',
    backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='8' viewBox='0 0 12 8'%3E%3Cpath d='M1 1l5 5 5-5' stroke='%23888' stroke-width='1.8' fill='none' stroke-linecap='round'/%3E%3C/svg%3E")`,
    backgroundRepeat: 'no-repeat',
    backgroundPosition: 'right 12px center',
  }

  const SECTION_LABEL: React.CSSProperties = {
    fontSize: 12,
    fontWeight: 700,
    color: 'rgba(255,255,255,0.6)',
    letterSpacing: '0.1em',
    textTransform: 'uppercase',
    marginBottom: 8,
  }

  return createPortal(
    <div style={{
      position: 'fixed', inset: 0, zIndex: 900,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      opacity: shown ? 1 : 0,
      transition: isTeslaBrowser ? undefined : 'opacity 0.2s ease',
    }}>
      {/* Backdrop */}
      {/* eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions */}
      <div onClick={close} style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.88)' }} />

      {/* Modal card — wide split layout */}
      <div
        role="dialog" aria-modal="true" aria-label={labels.dialogLabel}
        style={{
          position: 'relative', zIndex: 1,
          width: 'min(860px, calc(100vw - 24px))',
          maxHeight: 'calc(100vh - 32px)',
          borderRadius: 22,
          background: '#0f0f17',
          border: '1px solid rgba(255,255,255,0.09)',
          boxShadow: '0 32px 80px rgba(0,0,0,0.8)',
          display: 'flex',
          overflow: 'hidden',
          opacity: shown ? 1 : 0,
          transform: isTeslaBrowser ? undefined : (shown ? 'scale(1)' : 'scale(0.96)'),
          transition: isTeslaBrowser ? undefined : 'opacity 0.2s ease-out, transform 0.2s ease-out',
        }}
      >
        {/* ── LEFT PANEL ─────────────────────────────────────────────── */}
        <div style={{
          width: '42%',
          flexShrink: 0,
          background: 'linear-gradient(160deg, #1a1a28 0%, #12121e 100%)',
          borderRight: '1px solid rgba(255,255,255,0.07)',
          padding: '28px 24px 28px',
          display: 'flex',
          flexDirection: 'column',
          gap: 20,
        }}>
          {/* Header */}
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#e31937', letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 6 }}>
              TesRadar
            </div>
            <div style={{ fontSize: 22, fontWeight: 700, color: '#f2f2f2', letterSpacing: '-0.02em', lineHeight: 1.2 }}>
              {labels.title}
            </div>
          </div>

          {/* Car image — fixed-height frame, no reflow on model change */}
          <div style={{
            height: 130,
            display: 'flex',
            alignItems: 'flex-end',
            justifyContent: 'center',
            padding: '0 8px',
          }}>
            <CarSilhouette model={model} />
          </div>

          {/* Model pills — 2+3 grid */}
          <div>
            <div style={SECTION_LABEL}>{labels.model}</div>
            {/* Row 1: 3 */}
            <div style={{ display: 'flex', gap: 6, marginBottom: 6 }}>
              {(TESLA_MODELS.slice(0, 3) as TeslaModel[]).map((m) => (
                <ModelPill key={m} label={m} selected={model === m} onClick={() => handleModelChange(m)} />
              ))}
            </div>
            {/* Row 2: 2 centered */}
            <div style={{ display: 'flex', gap: 6, justifyContent: 'center' }}>
              {(TESLA_MODELS.slice(3) as TeslaModel[]).map((m) => (
                <ModelPill key={m} label={m} selected={model === m} onClick={() => handleModelChange(m)} wide />
              ))}
            </div>
          </div>

          {/* Trim / Model S 3-step selector */}
          {isMS ? (
            <ModelSConfigurator
              msGroup={msGroup}
              msBat={msBat}
              msDrv={msDrv}
              onGroup={(g) => { setMsGroup(g); setMsBat(null); setMsDrv(null) }}
              onBat={(b)   => { setMsBat(b);   setMsDrv(null) }}
              onDrv={setMsDrv}
              sectionLabel={SECTION_LABEL}
            />
          ) : (
            trims.length > 0 && (
              <div>
                <div style={SECTION_LABEL}>{labels.trim}</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {trims.map((t) => {
                    const sel = trim === t.id
                    return (
                      <button
                        key={t.id}
                        onClick={() => setTrim(t.id)}
                        style={{
                          padding: '11px 14px',
                          borderRadius: 10,
                          border: `1px solid ${sel ? 'rgba(227,25,55,0.6)' : 'rgba(255,255,255,0.10)'}`,
                          background: sel ? 'rgba(227,25,55,0.12)' : 'rgba(255,255,255,0.03)',
                          color: sel ? '#fff' : 'rgba(255,255,255,0.55)',
                          fontSize: 15,
                          fontWeight: sel ? 600 : 400,
                          cursor: 'pointer', touchAction: 'manipulation',
                          textAlign: 'left',
                          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                        }}
                      >
                        <span>{t.label}</span>
                        <span style={{ fontSize: 13, color: sel ? 'rgba(255,255,255,0.55)' : 'rgba(255,255,255,0.4)', fontWeight: 400 }}>
                          {t.usableKwh} kWh
                        </span>
                      </button>
                    )
                  })}
                </div>
              </div>
            )
          )}

          {/* Subtitle note */}
          <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.5)', lineHeight: 1.6, marginTop: 'auto' }}>
            {labels.privacy}
          </div>
        </div>

        {/* ── RIGHT PANEL ────────────────────────────────────────────── */}
        <div style={{
          flex: 1,
          padding: '28px 28px 24px',
          overflowY: 'auto',
          display: 'flex',
          flexDirection: 'column',
          gap: 20,
        }}>
          {/* Close button */}
          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <button onClick={close} aria-label={labels.close} style={{
              width: 32, height: 32,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              borderRadius: 8,
              background: 'rgba(255,255,255,0.06)',
              border: '1px solid rgba(255,255,255,0.1)',
              color: 'rgba(255,255,255,0.45)',
              cursor: 'pointer', touchAction: 'manipulation',
            }}>
              <CloseX />
            </button>
          </div>

          {/* Year — hidden for Model S (year is derived from year group) */}
          {!isMS && <div>
            <div style={SECTION_LABEL}>{labels.year}</div>
            <div style={{
              display: 'flex',
              flexWrap: 'wrap',
              gap: 6,
              maxHeight: 148,
              overflowY: 'auto',
            }}>
              {years.map((y) => {
                const sel = year === y
                return (
                  <button
                    key={y}
                    onClick={() => handleYearChange(y)}
                    style={{
                      padding: '8px 14px',
                      borderRadius: 8,
                      border: `1px solid ${sel ? 'rgba(227,25,55,0.6)' : 'rgba(255,255,255,0.10)'}`,
                      background: sel ? 'rgba(227,25,55,0.15)' : 'rgba(255,255,255,0.04)',
                      color: sel ? '#fff' : 'rgba(255,255,255,0.55)',
                      fontSize: 15,
                      fontWeight: sel ? 700 : 400,
                      cursor: 'pointer',
                      touchAction: 'manipulation',
                      minWidth: 64,
                    }}
                  >
                    {y}
                  </button>
                )
              })}
            </div>
          </div>}

          {/* Battery — slider + fine controls */}
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 12 }}>
              <div style={SECTION_LABEL}>{labels.battery} <span style={{ fontWeight: 400, opacity: 0.85, textTransform: 'none', letterSpacing: 0, fontSize: 12 }}>({labels.batteryHint})</span></div>
              <div style={{ fontSize: 26, fontWeight: 800, color: col, letterSpacing: '-0.03em', lineHeight: 1 }}>
                {Math.round(battery)}%
              </div>
            </div>

            {/* Slider row */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <StepBtn label="−" onClick={() => setBattery((v) => Math.max(1, Math.round(v) - 1))} />
              <div style={{ flex: 1, position: 'relative' }}>
                {/* Track background with gradient fill */}
                <div style={{
                  position: 'absolute', top: '50%', left: 0,
                  transform: 'translateY(-50%)',
                  height: 6, borderRadius: 3,
                  width: `${((battery - 1) / 99) * 100}%`,
                  background: col,
                  pointerEvents: 'none',
                  zIndex: 1,
                }} />
                <input
                  type="range" min={1} max={100} step={1}
                  value={battery}
                  onChange={(e) => setBattery(Number(e.target.value))}
                  style={{
                    width: '100%', height: 28,
                    cursor: 'pointer',
                    accentColor: col,
                    position: 'relative', zIndex: 2,
                    background: 'transparent',
                  }}
                />
              </div>
              <StepBtn label="+" onClick={() => setBattery((v) => Math.min(100, Math.round(v) + 1))} />
            </div>

            {/* Preset quick-tap buttons */}
            <div style={{ display: 'flex', gap: 6, marginTop: 10 }}>
              {[20, 40, 60, 80, 100].map((v) => (
                <button
                  key={v}
                  onClick={() => setBattery(v)}
                  style={{
                    flex: 1, padding: '7px 0',
                    borderRadius: 8,
                    border: `1px solid ${Math.round(battery) === v ? col : 'rgba(255,255,255,0.10)'}`,
                    background: Math.round(battery) === v ? `${col}22` : 'rgba(255,255,255,0.03)',
                    color: Math.round(battery) === v ? col : 'rgba(255,255,255,0.4)',
                    fontSize: 14, fontWeight: 600,
                    cursor: 'pointer', touchAction: 'manipulation',
                  }}
                >
                  {v}%
                </button>
              ))}
            </div>
          </div>

          {/* Degradation */}
          <div>
            <div style={SECTION_LABEL}>{labels.degradation}</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <input
                type="number" min={0} max={30} step={1}
                placeholder={labels.placeholder}
                value={degrad}
                onChange={(e) => setDegrad(e.target.value)}
                style={{
                  flex: 1,
                  padding: '11px 14px',
                  borderRadius: 10,
                  background: 'rgba(255,255,255,0.05)',
                  border: '1px solid rgba(255,255,255,0.12)',
                  color: '#f2f2f2',
                  fontSize: 16,
                  outline: 'none',
                  fontFamily: 'inherit',
                }}
              />
              <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.3)' }}>%</div>
            </div>
            <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.5)', marginTop: 6, lineHeight: 1.5 }}>
              {labels.degradationHint}
            </div>
          </div>

          {/* Spacer */}
          <div style={{ flex: 1, minHeight: 8 }} />

          {/* Action buttons */}
          <div style={{ display: 'flex', gap: 10 }}>
            <button
              onClick={close}
              style={{
                padding: '14px 20px',
                borderRadius: 12,
                background: 'rgba(255,255,255,0.05)',
                border: '1px solid rgba(255,255,255,0.10)',
                color: 'rgba(255,255,255,0.45)',
                fontSize: 16, fontWeight: 500,
                cursor: 'pointer', touchAction: 'manipulation',
                whiteSpace: 'nowrap',
              }}
            >
              {labels.later}
            </button>
            <button
              onClick={handleSave}
              disabled={!canSave}
              style={{
                flex: 1,
                padding: '14px 0',
                borderRadius: 12,
                background: canSave ? '#e31937' : 'rgba(227,25,55,0.25)',
                border: 'none',
                color: canSave ? '#fff' : 'rgba(255,255,255,0.3)',
                fontSize: 17, fontWeight: 700,
                cursor: canSave ? 'pointer' : 'default',
                touchAction: 'manipulation',
                letterSpacing: '0.02em',
              }}
            >
              {labels.save}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  )
}

// ── Model pill button ─────────────────────────────────────────────────
function ModelPill({
  label, selected, onClick, wide = false,
}: {
  label: string
  selected: boolean
  onClick: () => void
  wide?: boolean
}) {
  return (
    <button
      onClick={onClick}
      style={{
        flex: wide ? '0 0 auto' : 1,
        width: wide ? 120 : undefined,
        padding: '9px 6px',
        borderRadius: 10,
        border: `1px solid ${selected ? 'rgba(227,25,55,0.7)' : 'rgba(255,255,255,0.10)'}`,
        background: selected ? 'rgba(227,25,55,0.18)' : 'rgba(255,255,255,0.04)',
        color: selected ? '#fff' : 'rgba(255,255,255,0.7)',
        fontSize: 13,
        fontWeight: selected ? 700 : 400,
        cursor: 'pointer', touchAction: 'manipulation',
        letterSpacing: selected ? '-0.01em' : undefined,
        transition: isTeslaBrowser ? undefined : 'border-color 0.1s, background 0.1s, color 0.1s',
        textAlign: 'center',
        lineHeight: 1.3,
      }}
    >
      {label}
    </button>
  )
}

// ── Model S 3-step configurator component ────────────────────────────
function ModelSConfigurator({
  msGroup, msBat, msDrv,
  onGroup, onBat, onDrv,
  sectionLabel,
}: {
  msGroup: MSYearGroup | null
  msBat:   number | null
  msDrv:   string | null
  onGroup: (g: MSYearGroup) => void
  onBat:   (b: number) => void
  onDrv:   (d: string) => void
  sectionLabel: React.CSSProperties
}) {
  const CHIP = (sel: boolean): React.CSSProperties => ({
    padding: '9px 14px',
    borderRadius: 10,
    border: `1px solid ${sel ? 'rgba(227,25,55,0.65)' : 'rgba(255,255,255,0.10)'}`,
    background: sel ? 'rgba(227,25,55,0.14)' : 'rgba(255,255,255,0.04)',
    color: sel ? '#fff' : 'rgba(255,255,255,0.55)',
    fontSize: 14,
    fontWeight: sel ? 700 : 400,
    cursor: 'pointer',
    touchAction: 'manipulation',
    whiteSpace: 'nowrap' as const,
    flex: 1,
    textAlign: 'center' as const,
  })

  const batteries = msGroup ? Object.keys(MS_OPTIONS[msGroup]).map(Number) : []
  const drives    = (msGroup && msBat) ? (MS_OPTIONS[msGroup][msBat] ?? []) : []

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {/* Step 1 — Year group */}
      <div>
        <div style={sectionLabel}>Generation</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {MS_YEAR_GROUPS.map((g) => (
            <button key={g} onClick={() => onGroup(g)} style={CHIP(msGroup === g)}>
              Model S {g}
            </button>
          ))}
        </div>
      </div>

      {/* Step 2 — Battery */}
      {msGroup && (
        <div>
          <div style={sectionLabel}>Battery</div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {batteries.map((b) => (
              <button key={b} onClick={() => onBat(b)} style={{ ...CHIP(msBat === b), flex: 'none', minWidth: 52 }}>
                {b} kWh
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Step 3 — Drive */}
      {msGroup && msBat && (
        <div>
          <div style={sectionLabel}>Drive</div>
          <div style={{ display: 'flex', gap: 6 }}>
            {drives.map((d) => (
              <button key={d} onClick={() => onDrv(d)} style={CHIP(msDrv === d)}>
                {d}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// ── Step button (+/−) ─────────────────────────────────────────────────
function StepBtn({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      style={{
        width: 38, height: 38, flexShrink: 0,
        borderRadius: 10,
        border: '1px solid rgba(255,255,255,0.12)',
        background: 'rgba(255,255,255,0.06)',
        color: '#f2f2f2',
        fontSize: 20, fontWeight: 300, lineHeight: 1,
        cursor: 'pointer', touchAction: 'manipulation',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}
    >
      {label}
    </button>
  )
}
