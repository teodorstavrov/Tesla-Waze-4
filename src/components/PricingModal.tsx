// ─── Pricing Modal ─────────────────────────────────────────────────────
//
// FREE vs PRO tier comparison. Stripe-ready placeholder.
// No payments connected — CTA shows "Coming soon" until stripeLink is filled.
//
// OPENING
//   openPricingModal()   → called from LeftControls PRO button, UpgradeModal
//
// STRIPE READINESS
//   Pass stripeLink prop from App.tsx when Stripe is live:
//     <PricingModal stripeLink="https://buy.stripe.com/…" price="€4.99/mo" />
//
// DESIGN
//   Two-column layout (FREE | PRO) — minimal, dark, Tesla-friendly.
//   No heavy animations. No large images. No layout shifts.

import { useState, useEffect, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { isTeslaBrowser } from '@/lib/browser'

// ── Free tier features ─────────────────────────────────────────────────
const FREE_ITEMS = [
  { icon: '🗺️', text: 'Live map navigation' },
  { icon: '⚡', text: 'EV charging station map' },
  { icon: '🚨', text: 'Police, hazard & accident alerts' },
  { icon: '🛣️', text: 'Route planning with ETA' },
  { icon: '📣', text: 'Report events in real time' },
  { icon: '🌍', text: 'Multi-country support' },
]

// ── PRO tier features ──────────────────────────────────────────────────
const PRO_ITEMS = [
  { icon: '⭐', text: 'Everything in Free' },
  { icon: '🔋', text: 'Smart battery-at-arrival estimate' },
  { icon: '🗺️', text: 'Multi-route intelligence' },
  { icon: '📷', text: 'Average speed camera sections' },
  { icon: '🔊', text: 'Enhanced voice alerts & guidance' },
  { icon: '⚡', text: 'Advanced charging filters (kW, network)' },
  { icon: '⭐', text: 'Saved routes & favorite destinations' },
  { icon: '🚀', text: 'Early access to new features' },
]

// ── Imperative opener ──────────────────────────────────────────────────
let _openFn: (() => void) | null = null

export function openPricingModal(): void {
  _openFn?.()
}

// ── Props ──────────────────────────────────────────────────────────────
export interface PricingModalProps {
  stripeLink?: string
  price?:      string
}

// ── Component ──────────────────────────────────────────────────────────
export function PricingModal({ stripeLink, price = '€4.99 / month' }: PricingModalProps) {
  const [open,  setOpen]  = useState(false)
  const [shown, setShown] = useState(false)

  _openFn = () => {
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

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, close])

  if (!open) return null

  function handleUpgrade() {
    if (stripeLink) window.open(stripeLink, '_blank', 'noopener,noreferrer')
  }

  return createPortal(
    <div style={{
      position:       'fixed',
      inset:          0,
      zIndex:         860,
      display:        'flex',
      alignItems:     'center',
      justifyContent: 'center',
      opacity:        shown ? 1 : 0,
      transition:     isTeslaBrowser ? undefined : 'opacity 0.22s ease',
    }}>
      {/* Backdrop */}
      {/* eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions */}
      <div onClick={close} style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.88)' }} />

      {/* Card */}
      <div
        role="dialog"
        aria-modal="true"
        aria-label="TesRadar Plans"
        style={{
          position:      'relative',
          zIndex:        1,
          width:         'min(640px, calc(100vw - 24px))',
          maxHeight:     'calc(100vh - 32px)',
          overflowY:     'auto',
          borderRadius:  22,
          background:    '#0c0c14',
          border:        '1px solid rgba(255,255,255,0.09)',
          boxShadow:     '0 32px 80px rgba(0,0,0,0.8)',
          opacity:       shown ? 1 : 0,
          transform:     shown ? 'scale(1)' : 'scale(0.96)',
          transition:    isTeslaBrowser ? undefined : 'opacity 0.22s ease-out, transform 0.22s ease-out',
          display:       'flex',
          flexDirection: 'column',
        }}
      >
        {/* ── Header ───────────────────────────────────────────────── */}
        <div style={{
          padding:        '22px 24px 18px',
          borderBottom:   '1px solid rgba(255,255,255,0.07)',
          display:        'flex',
          alignItems:     'center',
          justifyContent: 'space-between',
          flexShrink:     0,
        }}>
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#e31937', letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 4 }}>
              TesRadar
            </div>
            <div style={{ fontSize: 20, fontWeight: 800, color: '#f2f2f2', letterSpacing: '-0.02em' }}>
              Choose your plan
            </div>
          </div>
          <button
            onClick={close}
            aria-label="Close"
            style={{
              width: 36, height: 36,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              borderRadius: 10,
              background: 'rgba(255,255,255,0.06)',
              border: '1px solid rgba(255,255,255,0.1)',
              color: 'rgba(255,255,255,0.45)',
              cursor: 'pointer', touchAction: 'manipulation',
            }}
          >
            <CloseX />
          </button>
        </div>

        {/* ── Two-column plan grid ──────────────────────────────────── */}
        <div style={{
          display:  'flex',
          gap:      12,
          padding:  '18px 18px 0',
          flexShrink: 0,
        }}>
          {/* FREE column */}
          <div style={{
            flex:          1,
            borderRadius:  16,
            background:    'rgba(255,255,255,0.03)',
            border:        '1px solid rgba(255,255,255,0.09)',
            padding:       '18px 16px',
            display:       'flex',
            flexDirection: 'column',
            gap:           12,
          }}>
            <div>
              <div style={{ fontSize: 13, fontWeight: 700, color: 'rgba(255,255,255,0.4)', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 4 }}>
                Free
              </div>
              <div style={{ fontSize: 24, fontWeight: 800, color: '#f2f2f2', letterSpacing: '-0.02em' }}>
                €0
              </div>
              <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.35)', marginTop: 2 }}>
                Always free
              </div>
            </div>

            <div style={{
              padding:      '10px 14px',
              borderRadius: 10,
              background:   'rgba(255,255,255,0.05)',
              border:       '1px solid rgba(255,255,255,0.08)',
              fontSize:     13,
              fontWeight:   600,
              color:        'rgba(255,255,255,0.45)',
              textAlign:    'center',
              letterSpacing: '0.02em',
            }}>
              Current plan
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {FREE_ITEMS.map((item) => (
                <div key={item.text} style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                  <span style={{ fontSize: 14, lineHeight: 1.4, flexShrink: 0 }}>{item.icon}</span>
                  <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.6)', lineHeight: 1.45 }}>{item.text}</span>
                </div>
              ))}
            </div>
          </div>

          {/* PRO column */}
          <div style={{
            flex:          1,
            borderRadius:  16,
            background:    'rgba(217,119,6,0.06)',
            border:        '1.5px solid rgba(251,191,36,0.25)',
            padding:       '18px 16px',
            display:       'flex',
            flexDirection: 'column',
            gap:           12,
            position:      'relative',
          }}>
            {/* PRO badge */}
            <div style={{
              position:     'absolute',
              top:          -10,
              right:        14,
              background:   'linear-gradient(135deg, #b45309 0%, #d97706 50%, #f59e0b 100%)',
              color:        '#fff',
              fontSize:     10,
              fontWeight:   800,
              letterSpacing: '0.1em',
              textTransform: 'uppercase',
              padding:      '3px 10px',
              borderRadius:  20,
              boxShadow:    '0 2px 10px rgba(217,119,6,0.4)',
            }}>
              👑 PRO
            </div>

            <div>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#f59e0b', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 4 }}>
                Pro
              </div>
              <div style={{ fontSize: 24, fontWeight: 800, color: '#f2f2f2', letterSpacing: '-0.02em' }}>
                {price.split('/')[0]?.trim() ?? price}
              </div>
              <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.35)', marginTop: 2 }}>
                per month
              </div>
            </div>

            <button
              onClick={handleUpgrade}
              style={{
                padding:       '10px 14px',
                borderRadius:  10,
                background:    stripeLink
                  ? 'linear-gradient(135deg, #b45309 0%, #d97706 50%, #f59e0b 100%)'
                  : 'rgba(251,191,36,0.12)',
                border:        stripeLink ? 'none' : '1px solid rgba(251,191,36,0.25)',
                color:         stripeLink ? '#fff' : 'rgba(251,191,36,0.55)',
                fontSize:      13,
                fontWeight:    700,
                cursor:        stripeLink ? 'pointer' : 'default',
                touchAction:   'manipulation',
                letterSpacing: '0.02em',
                textAlign:     'center',
                boxShadow:     stripeLink ? '0 4px 20px rgba(217,119,6,0.35)' : 'none',
              }}
            >
              {stripeLink ? '👑 Upgrade to PRO' : '👑 Coming soon'}
            </button>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {PRO_ITEMS.map((item) => (
                <div key={item.text} style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                  <span style={{
                    fontSize: 14, lineHeight: 1.4, flexShrink: 0,
                    filter: item.icon === '⭐' ? 'none' : undefined,
                  }}>{item.icon}</span>
                  <span style={{
                    fontSize: 13,
                    color:    item.text === 'Everything in Free' ? 'rgba(255,255,255,0.35)' : 'rgba(255,255,255,0.75)',
                    lineHeight: 1.45,
                    fontWeight: item.text === 'Everything in Free' ? 400 : 500,
                  }}>
                    {item.text}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* ── Footer ───────────────────────────────────────────────── */}
        <div style={{
          padding:        '16px 24px 20px',
          display:        'flex',
          flexDirection:  'column',
          alignItems:     'center',
          gap:            10,
          flexShrink:     0,
        }}>
          {/* Early version note */}
          <div style={{
            fontSize:    12,
            color:       'rgba(255,255,255,0.28)',
            textAlign:   'center',
            lineHeight:  1.5,
            maxWidth:    420,
          }}>
            TesRadar is free to use. PRO features are in development — pricing is a placeholder until launch.
          </div>

          {/* Stripe trust */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" aria-hidden="true"
              stroke="rgba(255,255,255,0.2)" strokeWidth="2" strokeLinecap="round">
              <rect x="3" y="11" width="18" height="11" rx="2" />
              <path d="M7 11V7a5 5 0 0 1 10 0v4" />
            </svg>
            <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.2)', letterSpacing: '0.05em' }}>
              Payments powered by Stripe · Secure checkout
            </span>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  )
}

// ── Close icon ─────────────────────────────────────────────────────────
function CloseX() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true"
      stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
      <line x1="3" y1="3" x2="13" y2="13" />
      <line x1="13" y1="3" x2="3" y2="13" />
    </svg>
  )
}
