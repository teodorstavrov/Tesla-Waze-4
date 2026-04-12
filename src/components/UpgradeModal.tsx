// ─── Upgrade / PRO Modal ───────────────────────────────────────────────
//
// Stripe-ready premium upgrade modal. Not connected to payments yet —
// all payment-specific props accept placeholders and are simply unused
// until Stripe is wired.
//
// OPENING
//   openUpgradeModal()                         → generic PRO overview
//   openUpgradeModal('average_speed_sections') → feature-specific copy
//
// STRIPE READINESS
//   The modal is mounted in App.tsx with:
//     <UpgradeModal stripeLink="https://buy.stripe.com/…" qrImageUrl="/pro-qr.png" price="€4.99/mo" />
//   When stripeLink is set, the primary CTA button navigates to it.
//   When qrImageUrl is set, the QR block shows the real image.
//   When neither is set, placeholder UI is shown — perfectly safe.
//
// MODES
//   OFF  → renders null (nothing shown, no overhead)
//   SOFT → modal can open from tapped PRO badge (teaser, feature accessible)
//   FULL → modal opens from locked-state "Upgrade" button

import { useState, useEffect, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { isTeslaBrowser } from '@/lib/browser'
import { isPremiumEnabled } from '@/lib/featureFlags'
import { openPricingModal } from '@/components/PricingModal'
import type { PremiumFeature } from '@/config/premium'

// ── Feature copy ──────────────────────────────────────────────────────
// Each premium feature gets a short title, description and icon.
// Add new entries here when new features are gated.

interface FeatureCopy { icon: string; title: string; desc: string }

const FEATURE_COPY: Record<PremiumFeature, FeatureCopy> = {
  average_speed_sections: {
    icon:  '📷',
    title: 'Average Speed Sections',
    desc:  'Real-time tracking across 47 speed-camera sections. Get warned 2 km in advance and see your live average vs the limit.',
  },
  advanced_route_intelligence: {
    icon:  '🗺️',
    title: 'Route Intelligence',
    desc:  'Multi-route comparison with smart detour suggestions based on live traffic events and road conditions.',
  },
  smart_arrival_battery: {
    icon:  '🔋',
    title: 'Smart Battery Arrival',
    desc:  'Precise battery-at-arrival estimate accounting for speed, temperature, elevation and charging stops.',
  },
  premium_voice_alerts: {
    icon:  '🔊',
    title: 'Premium Voice Alerts',
    desc:  'Enhanced audio alerts and clear voice guidance for police, hazards, cameras and turn instructions.',
  },
  saved_routes_and_favorites: {
    icon:  '⭐',
    title: 'Saved Routes & Favorites',
    desc:  'Save destinations and recent routes for instant one-tap navigation without re-searching.',
  },
  advanced_charging_filters: {
    icon:  '⚡',
    title: 'Advanced Charging Filters',
    desc:  'Filter stations by network, power output (kW), connector type and real-time availability.',
  },
}

// Generic benefit bullets shown when no specific feature is highlighted
const GENERIC_BENEFITS = [
  { icon: '📷', text: 'Average speed section tracking (47 sections)' },
  { icon: '🔋', text: 'Battery-at-arrival smart estimation' },
  { icon: '🗺️', text: 'Multi-route intelligence & smart detours' },
  { icon: '🔊', text: 'Premium voice alerts & guidance' },
  { icon: '⭐', text: 'Saved routes & favorite destinations' },
  { icon: '⚡', text: 'Advanced EV charging filters' },
]

// ── Imperative open function ──────────────────────────────────────────
// Same pattern as openSupportModal(), openCountryPicker(), etc.

let _openFn: ((feature?: PremiumFeature) => void) | null = null

export function openUpgradeModal(feature?: PremiumFeature): void {
  _openFn?.(feature)
}

// ── Props (configured in App.tsx, filled in when Stripe goes live) ────

export interface UpgradeModalProps {
  /** Stripe payment / checkout link. Leave undefined until Stripe is ready. */
  stripeLink?:  string
  /** QR code image URL for mobile payment. Leave undefined until ready. */
  qrImageUrl?:  string
  /** Price copy. E.g. "€4.99 / month". Shown in the CTA area. */
  price?:       string
}

// ── Component (always mounted by App.tsx) ─────────────────────────────

export function UpgradeModal({ stripeLink, qrImageUrl, price = 'PRO Plan' }: UpgradeModalProps) {
  const [open,    setOpen]    = useState(false)
  const [shown,   setShown]   = useState(false)
  const [feature, setFeature] = useState<PremiumFeature | undefined>(undefined)

  // In OFF mode the modal never opens — zero overhead
  _openFn = isPremiumEnabled()
    ? (f?: PremiumFeature) => {
        setFeature(f)
        setOpen(true)
        if (isTeslaBrowser) {
          setShown(true)
        } else {
          requestAnimationFrame(() => requestAnimationFrame(() => setShown(true)))
        }
      }
    : () => { /* noop in OFF mode */ }

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

  const copy = feature ? FEATURE_COPY[feature] : undefined

  function handleCTA() {
    if (stripeLink) {
      window.open(stripeLink, '_blank', 'noopener,noreferrer')
    }
    // If no stripeLink yet: button is shown but does nothing (placeholder)
    // Replace with: window.open(stripeLink, ...) when Stripe is live
  }

  return createPortal(
    <div style={{
      position:        'fixed',
      inset:           0,
      zIndex:          850,
      display:         'flex',
      alignItems:      'center',
      justifyContent:  'center',
      opacity:         shown ? 1 : 0,
      transition:      isTeslaBrowser ? undefined : 'opacity 0.22s ease',
    }}>
      {/* Backdrop */}
      {/* eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions */}
      <div onClick={close} style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.85)' }} />

      {/* Card */}
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Upgrade to PRO"
        style={{
          position:      'relative',
          zIndex:        1,
          width:         'min(420px, calc(100vw - 32px))',
          maxHeight:     'calc(100vh - 48px)',
          overflowY:     'auto',
          padding:       '0 0 24px',
          borderRadius:  20,
          background:    'rgba(14,14,20,0.98)',
          border:        '1px solid rgba(255,255,255,0.10)',
          boxShadow:     '0 28px 72px rgba(0,0,0,0.7)',
          opacity:       shown ? 1 : 0,
          transform:     shown ? 'scale(1)' : 'scale(0.95)',
          transition:    isTeslaBrowser ? undefined : 'opacity 0.22s ease-out, transform 0.22s ease-out',
          display:       'flex',
          flexDirection: 'column',
        }}
      >
        {/* ── Gold header band ─────────────────────────────────────── */}
        <div style={{
          background:    'linear-gradient(135deg, #92400e 0%, #b45309 40%, #d97706 70%, #f59e0b 100%)',
          padding:       '22px 24px 20px',
          borderRadius:  '20px 20px 0 0',
          display:       'flex',
          alignItems:    'center',
          justifyContent: 'space-between',
          gap:           12,
          flexShrink:    0,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: 26, lineHeight: 1 }}>👑</span>
            <div>
              <div style={{ fontSize: 18, fontWeight: 800, color: '#fff', letterSpacing: '-0.01em', lineHeight: 1.2 }}>
                TesRadar PRO
              </div>
              <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.75)', marginTop: 2, fontWeight: 500 }}>
                {price}
              </div>
            </div>
          </div>

          {/* Close */}
          <button
            onClick={close}
            aria-label="Close"
            style={{
              width: 34, height: 34, borderRadius: 10, border: 'none',
              background: 'rgba(0,0,0,0.25)',
              color: 'rgba(255,255,255,0.75)',
              fontSize: 18, lineHeight: 1, cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              touchAction: 'manipulation', flexShrink: 0,
            }}
          >
            ×
          </button>
        </div>

        {/* ── Body ─────────────────────────────────────────────────── */}
        <div style={{ padding: '20px 24px 0', display: 'flex', flexDirection: 'column', gap: 18 }}>

          {/* Feature highlight (when opened from a specific feature) */}
          {copy ? (
            <div style={{
              display:       'flex',
              gap:           14,
              padding:       '14px 16px',
              borderRadius:  12,
              background:    'rgba(251,191,36,0.07)',
              border:        '1px solid rgba(251,191,36,0.2)',
              alignItems:    'flex-start',
            }}>
              <span style={{ fontSize: 28, lineHeight: 1, flexShrink: 0, marginTop: 1 }}>{copy.icon}</span>
              <div>
                <div style={{ fontSize: 14, fontWeight: 700, color: '#f2f2f2', marginBottom: 4 }}>
                  {copy.title}
                </div>
                <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.55)', lineHeight: 1.55 }}>
                  {copy.desc}
                </div>
              </div>
            </div>
          ) : (
            /* Generic benefits list (no specific feature) */
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: 'rgba(255,255,255,0.45)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 2 }}>
                What you get
              </div>
              {GENERIC_BENEFITS.map((b) => (
                <div key={b.text} style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                  <span style={{ fontSize: 15, lineHeight: 1.4, flexShrink: 0 }}>{b.icon}</span>
                  <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.65)', lineHeight: 1.45 }}>{b.text}</span>
                </div>
              ))}
            </div>
          )}

          {/* CTA button */}
          <button
            onClick={handleCTA}
            style={{
              width:         '100%',
              padding:       '16px 0',
              borderRadius:  14,
              border:        'none',
              background:    stripeLink
                ? 'linear-gradient(135deg, #b45309 0%, #d97706 50%, #f59e0b 100%)'
                : 'rgba(251,191,36,0.15)',
              color:         stripeLink ? '#fff' : 'rgba(251,191,36,0.6)',
              fontSize:      16,
              fontWeight:    800,
              letterSpacing: '0.02em',
              cursor:        stripeLink ? 'pointer' : 'default',
              touchAction:   'manipulation',
              boxShadow:     stripeLink ? '0 4px 24px rgba(217,119,6,0.4)' : 'none',
              transition:    isTeslaBrowser ? undefined : 'opacity 0.15s ease',
              display:       'flex',
              alignItems:    'center',
              justifyContent: 'center',
              gap:           8,
            }}
          >
            {stripeLink ? '👑 Unlock PRO' : '👑 Coming Soon'}
          </button>

          {/* QR alternative */}
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
            <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.25)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
              or scan on your phone
            </div>
            {qrImageUrl ? (
              <img
                src={qrImageUrl}
                alt="PRO upgrade QR code"
                width={120}
                height={120}
                style={{ width: 120, height: 120, borderRadius: 8, background: '#fff', display: 'block' }}
              />
            ) : (
              <QrPlaceholder />
            )}
          </div>

          {/* Compare plans link */}
          <div style={{ textAlign: 'center' }}>
            <button
              onClick={() => { close(); setTimeout(openPricingModal, 50) }}
              style={{
                background:    'none',
                border:        'none',
                color:         'rgba(255,255,255,0.35)',
                fontSize:      12,
                cursor:        'pointer',
                touchAction:   'manipulation',
                textDecoration: 'underline',
                textUnderlineOffset: 3,
                padding:       '4px 0',
                letterSpacing: '0.02em',
              }}
            >
              Compare all plans →
            </button>
          </div>

          {/* Stripe trust badge */}
          <div style={{
            display:        'flex',
            alignItems:     'center',
            justifyContent: 'center',
            gap:            6,
            marginTop:      -4,
          }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true"
              stroke="rgba(255,255,255,0.2)" strokeWidth="2" strokeLinecap="round">
              <rect x="3" y="11" width="18" height="11" rx="2" />
              <path d="M7 11V7a5 5 0 0 1 10 0v4" />
            </svg>
            <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.2)', letterSpacing: '0.05em' }}>
              Payments powered by Stripe
            </span>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  )
}

// ── QR placeholder ─────────────────────────────────────────────────────

function QrPlaceholder() {
  return (
    <div style={{
      width: 120, height: 120,
      borderRadius: 8,
      background: 'rgba(255,255,255,0.03)',
      border: '1.5px dashed rgba(255,255,255,0.12)',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 6,
    }}>
      <svg width="36" height="36" viewBox="0 0 24 24" fill="none" aria-hidden="true"
        stroke="rgba(255,255,255,0.18)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="3" width="7" height="7" rx="1" />
        <rect x="14" y="3" width="7" height="7" rx="1" />
        <rect x="3" y="14" width="7" height="7" rx="1" />
        <rect x="5" y="5" width="3" height="3" fill="rgba(255,255,255,0.18)" stroke="none" />
        <rect x="16" y="5" width="3" height="3" fill="rgba(255,255,255,0.18)" stroke="none" />
        <rect x="5" y="16" width="3" height="3" fill="rgba(255,255,255,0.18)" stroke="none" />
        <path d="M14 14h2v2h-2zM18 14h3M18 18h3M14 18v3M14 21h3" />
      </svg>
      <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.18)', letterSpacing: '0.1em', textTransform: 'uppercase' }}>
        QR soon
      </div>
    </div>
  )
}
