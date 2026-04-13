// ─── Donation Nudge ────────────────────────────────────────────────────
//
// Shows a compact donation prompt on every 10th visit.
// Appears 8 seconds after mount (map has loaded, user is settled).
//
// Visit counter: localStorage 'tr-visits' (integer, incremented each session).
// "Session" = one page load (not single-page navigation).
// Triggers on visits: 10, 20, 30, … (multiples of 10).
//
// Dismissing: sets 'tr-nudge-seen-N' so the same visit doesn't re-show on F5.
// TESLA MODE: no backdrop-filter, no animations.

import { useEffect, useState } from 'react'
import { useSyncExternalStore } from 'react'
import { isTeslaBrowser } from '@/lib/browser'
import { openSupportModal } from '@/components/SupportModal'
import { t, getLang, langStore } from '@/lib/locale'

const LS_VISITS  = 'tr-visits'
const EVERY_N    = 10
const DELAY_MS   = 8_000   // 8 s after mount

function getAndIncrementVisit(): number {
  try {
    const n = parseInt(localStorage.getItem(LS_VISITS) ?? '0', 10)
    const next = (isNaN(n) ? 0 : n) + 1
    localStorage.setItem(LS_VISITS, String(next))
    return next
  } catch { return 0 }
}

function markSeen(visit: number): void {
  try { localStorage.setItem(`tr-nudge-seen-${visit}`, '1') } catch { /* non-fatal */ }
}

function alreadySeen(visit: number): boolean {
  try { return localStorage.getItem(`tr-nudge-seen-${visit}`) === '1' } catch { return false }
}

// ── Component ─────────────────────────────────────────────────────────────

export function DonationNudge({ qrImageUrl, donationLink }: { qrImageUrl: string; donationLink?: string }) {
  useSyncExternalStore(langStore.subscribe.bind(langStore), getLang, getLang)
  const [visible, setVisible] = useState(false)
  const [shown,   setShown]   = useState(false)   // CSS transition target
  const [visit,   setVisit]   = useState(0)

  useEffect(() => {
    const v = getAndIncrementVisit()
    setVisit(v)

    // Only trigger on multiples of EVERY_N, and only once per session
    if (v % EVERY_N !== 0) return
    if (alreadySeen(v))    return

    const t = setTimeout(() => {
      setVisible(true)
      // Double-RAF for smooth CSS fade-in
      if (!isTeslaBrowser) {
        requestAnimationFrame(() => requestAnimationFrame(() => setShown(true)))
      } else {
        setShown(true)
      }
    }, DELAY_MS)

    return () => clearTimeout(t)
  }, [])

  function dismiss() {
    markSeen(visit)
    if (isTeslaBrowser) {
      setVisible(false)
    } else {
      setShown(false)
      setTimeout(() => setVisible(false), 220)
    }
  }

  if (!visible) return null

  return (
    <div
      style={{
        position:  'fixed',
        inset:      0,
        zIndex:    850,
        display:   'flex',
        alignItems: 'flex-end',
        justifyContent: 'center',
        paddingBottom: 100,   // above bottom dock
        pointerEvents: 'none',
      }}
    >
      {/* Card */}
      <div
        role="dialog"
        aria-modal="true"
        aria-label={t('nudge.dialogLabel')}
        style={{
          pointerEvents: 'auto',
          width:   'min(380px, calc(100vw - 32px))',
          borderRadius: 20,
          background: 'rgba(14,14,22,0.97)',
          border: '1px solid rgba(255,255,255,0.13)',
          boxShadow: '0 20px 60px rgba(0,0,0,0.7)',
          padding: '20px 20px 16px',
          display: 'flex',
          flexDirection: 'column',
          gap: 14,
          ...(isTeslaBrowser ? {} : {
            opacity:   shown ? 1 : 0,
            transform: shown ? 'translateY(0) scale(1)' : 'translateY(20px) scale(0.97)',
            transition: 'opacity 0.22s ease-out, transform 0.22s ease-out',
          }),
        }}
      >
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 }}>
          <div>
            <div style={{ fontSize: 16, fontWeight: 800, color: '#fff', lineHeight: 1.2 }}>
              {t('nudge.title')}
            </div>
            <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)', marginTop: 5, lineHeight: 1.55 }}>
              {t('nudge.subtitle')}
            </div>
          </div>
          <button
            onClick={dismiss}
            aria-label={t('nudge.closeLabel')}
            style={{
              flexShrink: 0,
              background: 'rgba(255,255,255,0.06)',
              border: '1px solid rgba(255,255,255,0.1)',
              borderRadius: 8, color: 'rgba(255,255,255,0.4)',
              width: 30, height: 30, display: 'flex', alignItems: 'center', justifyContent: 'center',
              cursor: 'pointer', padding: 0, touchAction: 'manipulation',
            }}
          >
            <svg width="12" height="12" viewBox="0 0 16 16" fill="none" aria-hidden="true"
              stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
              <line x1="3" y1="3" x2="13" y2="13" />
              <line x1="13" y1="3" x2="3" y2="13" />
            </svg>
          </button>
        </div>

        {/* QR + CTA row */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          {/* QR code — tappable on Tesla browser (can't scan) */}
          <div
            role={donationLink ? 'button' : undefined}
            tabIndex={donationLink ? 0 : undefined}
            onClick={donationLink ? () => window.open(donationLink, '_blank', 'noopener,noreferrer') : undefined}
            style={{
              flexShrink: 0,
              width: 90, height: 90,
              borderRadius: 10,
              background: '#fff',
              padding: 4,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              boxShadow: '0 2px 10px rgba(0,0,0,0.4)',
              cursor: donationLink ? 'pointer' : 'default',
            }}
          >
            <img
              src={qrImageUrl}
              alt={t('nudge.qrAlt')}
              width={82}
              height={82}
              style={{ width: 82, height: 82, display: 'block', borderRadius: 6 }}
            />
          </div>

          {/* Text side */}
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.45)', lineHeight: 1.5 }}>
              {t('nudge.scanHint')}
            </div>
            <button
              onClick={() => {
                dismiss()
                openSupportModal()
              }}
              style={{
                padding: '9px 0',
                borderRadius: 10,
                background: 'linear-gradient(135deg, #e31937, #c0152c)',
                border: 'none',
                color: '#fff',
                fontSize: 13,
                fontWeight: 700,
                cursor: 'pointer',
                touchAction: 'manipulation',
                boxShadow: '0 3px 12px rgba(227,25,55,0.35)',
              }}
            >
              {t('nudge.support')}
            </button>
            <button
              onClick={dismiss}
              style={{
                padding: '7px 0',
                borderRadius: 10,
                background: 'transparent',
                border: '1px solid rgba(255,255,255,0.1)',
                color: 'rgba(255,255,255,0.35)',
                fontSize: 12,
                cursor: 'pointer',
                touchAction: 'manipulation',
              }}
            >
              {t('nudge.later')}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
