// ─── Premium Badge + Teaser wrapper ───────────────────────────────────
//
// Lightweight UI primitives for premium feature presentation.
// All are no-ops when PREMIUM_MODE is 'off' — zero overhead in production
// until monetization is enabled.
//
// Components
// ──────────
//   <PremiumBadge />
//     Inline "PRO" gold pill. Renders nothing in OFF mode.
//     Tappable — opens UpgradeModal for the given feature.
//
//   <PremiumTeaser feature="…">…children…</PremiumTeaser>
//     OFF  → passes children through unchanged
//     SOFT → children usable, PRO badge shown in corner (tappable)
//     FULL → children blurred + locked overlay with "Upgrade" button
//
// Usage
// ─────
//   import { PremiumBadge, PremiumTeaser } from '@/components/PremiumBadge'
//
//   <span style={{ display:'flex', gap:6 }}>Average speed <PremiumBadge feature="average_speed_sections" /></span>
//
//   <PremiumTeaser feature="smart_arrival_battery">
//     <BatteryWidget />
//   </PremiumTeaser>

import type { ReactNode } from 'react'
import type { PremiumFeature } from '@/config/premium'
import { isPremiumEnabled, shouldShowPremiumTeaser, shouldBlockFeature } from '@/lib/featureFlags'
import { openUpgradeModal } from '@/components/UpgradeModal'

// ── PremiumBadge ──────────────────────────────────────────────────────
// Small gold "PRO" pill. Tapping opens the upgrade modal.
// Renders nothing in OFF mode.

interface PremiumBadgeProps {
  feature?: PremiumFeature
  style?:   React.CSSProperties
}

export function PremiumBadge({ feature, style }: PremiumBadgeProps) {
  if (!isPremiumEnabled()) return null

  return (
    <button
      onClick={(e) => { e.stopPropagation(); openUpgradeModal(feature) }}
      aria-label="Premium feature — tap to learn more"
      style={{
        display:          'inline-flex',
        alignItems:       'center',
        padding:          '1px 6px',
        borderRadius:     5,
        background:       'linear-gradient(135deg, #fbbf24 0%, #f59e0b 100%)',
        color:            '#1a1000',
        fontSize:         9,
        fontWeight:       800,
        letterSpacing:    '0.08em',
        lineHeight:       1.6,
        userSelect:       'none',
        WebkitUserSelect: 'none',
        flexShrink:       0,
        border:           'none',
        cursor:           'pointer',
        touchAction:      'manipulation',
        ...style,
      }}
    >
      PRO
    </button>
  )
}

// ── PremiumTeaser ─────────────────────────────────────────────────────

interface PremiumTeaserProps {
  feature:   PremiumFeature
  children:  ReactNode
  /** Short text inside the locked overlay. Defaults to "Premium feature" */
  lockText?: string
}

export function PremiumTeaser({ feature, children, lockText }: PremiumTeaserProps) {
  const blocked = shouldBlockFeature(feature)
  const teaser  = shouldShowPremiumTeaser(feature)

  // OFF mode or user already has access: render children as-is
  if (!teaser && !blocked) return <>{children}</>

  // ── FULL mode, no entitlement → locked state ─────────────────────
  if (blocked) {
    return (
      <div style={{ position: 'relative', userSelect: 'none' }}>
        {/* Dimmed content beneath the lock */}
        <div style={{ opacity: 0.2, filter: 'blur(2px)', pointerEvents: 'none' }}>
          {children}
        </div>

        {/* Lock overlay */}
        <div style={{
          position:        'absolute',
          inset:           0,
          display:         'flex',
          flexDirection:   'column',
          alignItems:      'center',
          justifyContent:  'center',
          gap:             8,
        }}>
          <span style={{ fontSize: 24, lineHeight: 1 }}>🔒</span>

          <span style={{
            fontSize:   12,
            fontWeight: 600,
            color:      'rgba(255,255,255,0.6)',
            textAlign:  'center',
            lineHeight: 1.4,
            maxWidth:   160,
          }}>
            {lockText ?? 'Premium feature'}
          </span>

          {/* Upgrade CTA — opens UpgradeModal with feature context */}
          <button
            onClick={() => openUpgradeModal(feature)}
            style={{
              display:       'flex',
              alignItems:    'center',
              gap:           5,
              padding:       '6px 14px',
              borderRadius:  8,
              border:        '1px solid rgba(251,191,36,0.4)',
              background:    'rgba(251,191,36,0.10)',
              color:         '#fbbf24',
              fontSize:      12,
              fontWeight:    700,
              letterSpacing: '0.04em',
              cursor:        'pointer',
              touchAction:   'manipulation',
              marginTop:     2,
            }}
          >
            <span>👑</span>
            <span>Upgrade to PRO</span>
          </button>
        </div>
      </div>
    )
  }

  // ── SOFT mode → children usable, PRO badge in corner (tappable) ───
  return (
    <div style={{ position: 'relative' }}>
      {children}
      <div style={{
        position:     'absolute',
        top:          4,
        right:        4,
        pointerEvents: 'auto',
      }}>
        <PremiumBadge feature={feature} />
      </div>
    </div>
  )
}
