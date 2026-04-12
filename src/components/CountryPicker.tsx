// ─── Country Picker ────────────────────────────────────────────────────
//
// Dual role:
//   1. FIRST LOAD  — if no country is stored, auto-opens as a full-screen
//      blocking overlay that prevents any map interaction until the user
//      picks a country. No close button, no ESC.
//
//   2. IN-APP      — opened on demand via openCountryPicker() (globe button
//      in LeftControls). Same portal modal, but dismissible.
//
// Same portal + module-function pattern as RatingModal / SupportModal.

import { useState, useEffect, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { countryStore } from '@/lib/countryStore'
import { COUNTRY_LIST } from '@/config/countries'
import type { CountryCode } from '@/config/countries'
import { COUNTRIES } from '@/config/countries'
import { getMap } from '@/components/MapShell'
import { gpsStore } from '@/features/gps/gpsStore'
import { isTeslaBrowser } from '@/lib/browser'

// ── Module-level flag: set once at page load, never changes ───────────
// When the page loads without a stored country, this is true for the
// entire lifetime of the page — even after the user confirms their choice.
const _isFirstLoad = !countryStore.isChosen()

// ── Imperative open (same pattern as openRatingModal) ─────────────────
let _openFn: (() => void) | null = null
export function openCountryPicker(): void { _openFn?.() }

// ── Component (always mounted by App.tsx) ─────────────────────────────
export function CountryPicker() {
  const [open, setOpen]       = useState(false)
  const [shown, setShown]     = useState(false)
  const [selected, setSelected] = useState<CountryCode | null>(null)

  // Register the imperative open function
  _openFn = () => {
    setSelected(countryStore.getCode())
    setOpen(true)
    if (isTeslaBrowser) {
      setShown(true)
    } else {
      requestAnimationFrame(() => requestAnimationFrame(() => setShown(true)))
    }
  }

  const close = useCallback(() => {
    setShown(false)
    setTimeout(() => setOpen(false), isTeslaBrowser ? 0 : 220)
  }, [])

  // Auto-open on first load if no country has been chosen yet
  useEffect(() => {
    if (_isFirstLoad) {
      _openFn?.()
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ESC only works for the in-app switcher, not the first-load picker
  useEffect(() => {
    if (!open || _isFirstLoad) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, close])

  if (!open) return null

  function handleConfirm() {
    if (!selected) return
    const prevCode = countryStore.getCode()
    countryStore.setCountry(selected)

    if (selected !== prevCode || _isFirstLoad) {
      const map = getMap()
      const pos = gpsStore.getPosition()
      const country = COUNTRIES[selected]
      if (map) {
        // Always center on the user's GPS position if available.
        // Fall back to the country capital only when there is no GPS fix yet.
        if (pos) {
          map.setView([pos.lat, pos.lng], 15, { animate: false })
        } else {
          map.setView(country.center, country.zoom, { animate: !isTeslaBrowser })
        }
      }
    }

    close()
  }

  return createPortal(
    <div style={{
      position:        'fixed',
      inset:           0,
      zIndex:          950,
      display:         'flex',
      flexDirection:   'column',
      alignItems:      'center',
      justifyContent:  'center',
      padding:         '32px 24px',
      background:      'rgba(0,0,0,0.92)',
      opacity:         shown ? 1 : 0,
      transition:      isTeslaBrowser ? undefined : 'opacity 0.22s ease',
    }}>
      {/* Backdrop close (in-app mode only) */}
      {!_isFirstLoad && (
        // eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions
        <div
          onClick={close}
          style={{ position: 'absolute', inset: 0 }}
        />
      )}

      {/* Card */}
      <div style={{
        position:      'relative',
        zIndex:        1,
        width:         'min(380px, calc(100vw - 40px))',
        display:       'flex',
        flexDirection: 'column',
        alignItems:    'center',
        gap:           20,
        textAlign:     'center',
      }}>
        {/* Logo */}
        <img
          src="/new-medium_tran.png"
          alt="Tesla RADAR"
          style={{ height: 68, width: 'auto', borderRadius: 14 }}
        />

        {/* Title */}
        <div>
          <div style={{ fontSize: 21, fontWeight: 800, color: '#fff', marginBottom: 8 }}>
            Select your country
          </div>
          <div style={{ fontSize: 14, color: 'rgba(255,255,255,0.45)', lineHeight: 1.5, maxWidth: 300 }}>
            Tesla RADAR will use this to set your map, search, and language defaults.
          </div>
        </div>

        {/* Country options */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, width: '100%' }}>
          {COUNTRY_LIST.map((country) => {
            const isSelected = selected === country.code
            return (
              <button
                key={country.code}
                onClick={() => setSelected(country.code)}
                style={{
                  display:     'flex',
                  alignItems:  'center',
                  gap:         16,
                  padding:     '14px 18px',
                  borderRadius: 14,
                  background:  isSelected ? 'rgba(227,25,55,0.14)' : 'rgba(255,255,255,0.06)',
                  border:      `2px solid ${isSelected ? '#e31937' : 'rgba(255,255,255,0.12)'}`,
                  color:       '#fff',
                  cursor:      'pointer',
                  touchAction: 'manipulation',
                  transition:  isTeslaBrowser ? undefined : 'border-color 0.15s ease, background 0.15s ease',
                  width:       '100%',
                  textAlign:   'left',
                }}
              >
                <span style={{ fontSize: 30, lineHeight: 1 }}>{country.flag}</span>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 16, fontWeight: 700, lineHeight: 1.3 }}>
                    {country.nativeName}
                  </div>
                  <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)', marginTop: 2 }}>
                    {country.name}
                  </div>
                </div>
                {isSelected && (
                  <span style={{ fontSize: 18, color: '#e31937', fontWeight: 700 }}>✓</span>
                )}
              </button>
            )
          })}
        </div>

        {/* Confirm */}
        <button
          onClick={handleConfirm}
          disabled={!selected}
          style={{
            width:       '100%',
            padding:     '15px 0',
            borderRadius: 14,
            border:      'none',
            background:  selected ? '#e31937' : 'rgba(255,255,255,0.10)',
            color:       selected ? '#fff' : 'rgba(255,255,255,0.28)',
            fontSize:    16,
            fontWeight:  700,
            cursor:      selected ? 'pointer' : 'default',
            touchAction: 'manipulation',
            transition:  isTeslaBrowser ? undefined : 'background 0.15s ease',
          }}
        >
          {_isFirstLoad ? 'Continue →' : 'Switch country'}
        </button>

        {/* In-app cancel */}
        {!_isFirstLoad && (
          <button
            onClick={close}
            style={{
              background: 'none',
              border:     'none',
              color:      'rgba(255,255,255,0.35)',
              fontSize:   14,
              cursor:     'pointer',
              padding:    '4px 0',
              touchAction: 'manipulation',
            }}
          >
            Cancel
          </button>
        )}
      </div>
    </div>,
    document.body,
  )
}
