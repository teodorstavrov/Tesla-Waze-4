// ─── Support / Donation Modal ─────────────────────────────────────────
//
// Self-contained: renders the trigger ♥ (via openSupportModal()) + the modal.
// Language-aware: uses langStore so all text switches BG↔EN with country.
//
// ANIMATION: fade + scale-up on open, reverse on close.
// TOUCH: all targets ≥ 44px. ESC: keyboard fallback.

import { useState, useEffect, useCallback, useRef } from 'react'
import { useSyncExternalStore } from 'react'
import { createPortal } from 'react-dom'
import { isTeslaBrowser } from '@/lib/browser'
import { t, getLang, langStore } from '@/lib/locale'

// ── Types ──────────────────────────────────────────────────────────────

export interface SupportModalProps {
  qrImageUrl:    string
  /** When set, clicking the QR code opens this URL (e.g. Stripe payment link). */
  donationLink?: string
}

// ── Module-level opener ────────────────────────────────────────────────

let _open: (() => void) | null = null

export function openSupportModal(): void {
  _open?.()
}


// ── Component ──────────────────────────────────────────────────────────

export function SupportModal({ qrImageUrl, donationLink }: SupportModalProps) {
  const [open,  setOpen]  = useState(false)
  const [shown, setShown] = useState(false)
  const [view,  setView]  = useState<'donation' | 'contact'>('donation')

  // Re-render on country/language change
  useSyncExternalStore(langStore.subscribe.bind(langStore), getLang, getLang)

  _open = () => {
    setOpen(true)
    if (isTeslaBrowser) {
      setShown(true)
    } else {
      requestAnimationFrame(() => requestAnimationFrame(() => setShown(true)))
    }
  }

  const close = useCallback(() => {
    setShown(false)
    setTimeout(() => { setOpen(false); setView('donation') }, isTeslaBrowser ? 0 : 220)
  }, [])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, close])

  if (!open) return null

  const title    = t('support.title')
  const subtitle = t('support.subtitle')
  const hasQr    = Boolean(qrImageUrl)

  return createPortal(
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 800,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        opacity:    shown ? 1 : 0,
        transition: 'opacity 0.22s ease',
      }}
    >
      {/* ── Backdrop ── */}
      {/* eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions */}
      <div
        onClick={close}
        style={{
          position: 'absolute',
          inset: 0,
          background: 'rgba(0,0,0,0.82)',
        }}
      />

      {/* ── Card ── */}
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        style={{
          position:  'relative',
          zIndex:    1,
          width:     'min(460px, calc(100vw - 40px))',
          padding:   '28px 24px 24px',
          borderRadius: 20,
          background: 'rgba(18, 18, 26, 0.98)',
          border:    '1px solid rgba(255,255,255,0.12)',
          boxShadow: '0 24px 64px rgba(0,0,0,0.6)',
          display:   'flex',
          flexDirection: 'column',
          gap:       20,
          opacity:    shown ? 1 : 0,
          transform:  shown ? 'scale(1)' : 'scale(0.96)',
          transition: 'opacity 0.22s ease-out, transform 0.22s ease-out',
        }}
      >
        {/* Header row */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
          <div style={{ flex: 1 }}>
            <div style={{
              fontSize: 20, fontWeight: 700,
              color: '#f2f2f2',
              lineHeight: 1.2,
              letterSpacing: '-0.01em',
            }}>
              {view === 'contact' ? t('support.contactTitle') : title}
            </div>
            <div style={{
              fontSize: 13,
              color: 'rgba(255,255,255,0.5)',
              marginTop: 8,
              lineHeight: 1.6,
              whiteSpace: 'pre-line',
            }}>
              {view === 'contact' ? null : subtitle}
            </div>
          </div>

          <CloseButton onClose={close} />
        </div>

        {view === 'donation' ? (
          <>
            {/* QR code block — clickable if donationLink provided */}
            <div
              role={donationLink ? 'button' : undefined}
              tabIndex={donationLink ? 0 : undefined}
              onClick={donationLink ? () => window.open(donationLink, '_blank', 'noopener,noreferrer') : undefined}
              onKeyDown={donationLink ? (e) => { if (e.key === 'Enter') window.open(donationLink, '_blank', 'noopener,noreferrer') } : undefined}
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: 10,
                padding: '20px 16px',
                borderRadius: 14,
                background: donationLink ? 'rgba(255,255,255,0.06)' : 'rgba(255,255,255,0.04)',
                border: donationLink ? '1px solid rgba(255,255,255,0.16)' : '1px solid rgba(255,255,255,0.08)',
                cursor: donationLink ? 'pointer' : 'default',
                transition: 'background 0.15s ease, border-color 0.15s ease',
              }}
              onPointerEnter={donationLink ? (e) => { (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.10)' } : undefined}
              onPointerLeave={donationLink ? (e) => { (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.06)' } : undefined}
            >
              {hasQr ? (
                <img
                  src={qrImageUrl}
                  alt="QR"
                  width={192}
                  height={192}
                  style={{
                    width: 192, height: 192,
                    borderRadius: 10,
                    display: 'block',
                    background: '#fff',
                  }}
                />
              ) : (
                <QrPlaceholder />
              )}
              <div style={{
                fontSize: 11,
                color: donationLink ? 'rgba(255,255,255,0.55)' : 'rgba(255,255,255,0.35)',
                textAlign: 'center',
                letterSpacing: '0.03em',
              }}>
                {t('support.scanQr')}
                {donationLink && <span style={{ marginLeft: 6, opacity: 0.7 }}>↗</span>}
              </div>
            </div>


            {/* Contact CTA */}
            <button
              onClick={() => setView('contact')}
              style={{
                width: '100%',
                padding: '15px 0',
                borderRadius: 14,
                background: 'rgba(255,255,255,0.07)',
                border: '1px solid rgba(255,255,255,0.14)',
                color: '#f2f2f2',
                fontSize: 15,
                fontWeight: 600,
                letterSpacing: '0.02em',
                cursor: 'pointer',
                touchAction: 'manipulation',
                transition: 'background 0.12s ease',
              }}
              onPointerDown={(e) => { (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.13)' }}
              onPointerUp={(e)   => { (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.07)' }}
              onPointerLeave={(e) => { (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.07)' }}
            >
              {t('support.contactBtn')}
            </button>

            {/* Logo */}
            <div style={{ display: 'flex', justifyContent: 'center' }}>
              <img
                src="/new-medium_tran.png"
                alt="TesRadar"
                style={{ height: 70, width: 'auto', display: 'block', borderRadius: 10 }}
              />
            </div>

            {/* Version label */}
            <div style={{ textAlign: 'center', fontSize: 11, color: 'rgba(255,255,255,0.25)', letterSpacing: '0.08em' }}>
              v0.3
            </div>
          </>
        ) : (
          <ContactForm onBack={() => setView('donation')} />
        )}
      </div>
    </div>,
    document.body,
  )
}

// ── Sub-components ─────────────────────────────────────────────────────

function CloseButton({ onClose }: { onClose: () => void }) {
  return (
    <button
      onClick={onClose}
      aria-label={t('common.close')}
      style={{
        flexShrink: 0,
        width: 36, height: 36,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        borderRadius: 10,
        background: 'rgba(255,255,255,0.07)',
        border: '1px solid rgba(255,255,255,0.1)',
        color: 'rgba(255,255,255,0.5)',
        fontSize: 18,
        cursor: 'pointer',
        touchAction: 'manipulation',
        lineHeight: 1,
        transition: 'background 0.12s ease',
      }}
      onPointerEnter={(e) => { (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.13)' }}
      onPointerLeave={(e) => { (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.07)' }}
    >
      <CloseX />
    </button>
  )
}


type ContactState = 'idle' | 'sending' | 'sent' | 'error'

function ContactForm({ onBack }: { onBack: () => void }) {
  const [email,   setEmail]   = useState('')
  const [message, setMessage] = useState('')
  const [state,   setState]   = useState<ContactState>('idle')
  const [errMsg,  setErrMsg]  = useState('')
  const msgRef = useRef<HTMLTextAreaElement>(null)

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setState('sending')
    setErrMsg('')
    try {
      const res = await fetch('/api/contact', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ email: email.trim(), message: message.trim() }),
      })
      const data = await res.json() as { ok?: boolean; error?: string }
      if (!res.ok) { setState('error'); setErrMsg(data.error ?? t('support.errSend')); return }
      setState('sent')
    } catch {
      setState('error')
      setErrMsg(t('support.errNoConn'))
    }
  }

  const inputStyle: React.CSSProperties = {
    width: '100%',
    padding: '12px 14px',
    borderRadius: 10,
    background: 'rgba(255,255,255,0.06)',
    border: '1px solid rgba(255,255,255,0.14)',
    color: '#f2f2f2',
    fontSize: 14,
    outline: 'none',
    boxSizing: 'border-box',
    fontFamily: 'inherit',
  }

  if (state === 'sent') {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16, alignItems: 'center', padding: '12px 0' }}>
        <div style={{ fontSize: 40 }}>✅</div>
        <div style={{ fontSize: 15, color: '#f2f2f2', textAlign: 'center', fontWeight: 600 }}>
          {t('support.sent')}
        </div>
        <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.5)', textAlign: 'center' }}>
          {t('support.sentDesc')} {email}
        </div>
        <button onClick={onBack} style={{
          marginTop: 8, padding: '12px 28px', borderRadius: 12,
          background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.14)',
          color: '#f2f2f2', fontSize: 14, fontWeight: 600, cursor: 'pointer', touchAction: 'manipulation',
        }}>
          {t('support.back')}
        </button>
      </div>
    )
  }

  return (
    <form onSubmit={(e) => { void handleSubmit(e) }} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <input
        type="email"
        placeholder={t('support.emailPlaceholder')}
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        required
        style={inputStyle}
        disabled={state === 'sending'}
      />
      <textarea
        ref={msgRef}
        placeholder={t('support.msgPlaceholder')}
        value={message}
        onChange={(e) => setMessage(e.target.value)}
        required
        rows={5}
        style={{ ...inputStyle, resize: 'vertical', minHeight: 110 }}
        disabled={state === 'sending'}
      />

      {state === 'error' && (
        <div style={{ fontSize: 13, color: '#f87171', padding: '6px 2px' }}>{errMsg}</div>
      )}

      <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
        <button
          type="button"
          onClick={onBack}
          style={{
            flex: '0 0 auto',
            padding: '14px 18px',
            borderRadius: 12,
            background: 'rgba(255,255,255,0.07)',
            border: '1px solid rgba(255,255,255,0.14)',
            color: '#f2f2f2',
            fontSize: 14,
            fontWeight: 600,
            cursor: 'pointer',
            touchAction: 'manipulation',
          }}
        >
          {t('support.back')}
        </button>
        <button
          type="submit"
          disabled={state === 'sending'}
          style={{
            flex: 1,
            padding: '14px 0',
            borderRadius: 12,
            background: state === 'sending' ? 'rgba(227,25,55,0.5)' : '#e31937',
            border: 'none',
            color: '#fff',
            fontSize: 15,
            fontWeight: 700,
            cursor: state === 'sending' ? 'default' : 'pointer',
            touchAction: 'manipulation',
            boxShadow: '0 4px 20px rgba(227,25,55,0.3)',
            transition: 'background 0.15s ease',
          }}
        >
          {state === 'sending' ? t('support.sending') : t('common.send')}
        </button>
      </div>
    </form>
  )
}

function CloseX() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true"
      stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
      <line x1="3" y1="3" x2="13" y2="13" />
      <line x1="13" y1="3" x2="3" y2="13" />
    </svg>
  )
}

function QrPlaceholder() {
  return (
    <div style={{
      width: 192, height: 192,
      borderRadius: 10,
      background: 'rgba(255,255,255,0.04)',
      border: '2px dashed rgba(255,255,255,0.15)',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 10,
    }}>
      <svg width="52" height="52" viewBox="0 0 24 24" fill="none" aria-hidden="true"
        stroke="rgba(255,255,255,0.25)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="3" width="7" height="7" rx="1" />
        <rect x="14" y="3" width="7" height="7" rx="1" />
        <rect x="3" y="14" width="7" height="7" rx="1" />
        <rect x="5" y="5" width="3" height="3" fill="rgba(255,255,255,0.25)" stroke="none" />
        <rect x="16" y="5" width="3" height="3" fill="rgba(255,255,255,0.25)" stroke="none" />
        <rect x="5" y="16" width="3" height="3" fill="rgba(255,255,255,0.25)" stroke="none" />
        <path d="M14 14h2v2h-2zM18 14h3M18 18h3M14 18v3M14 21h3" />
      </svg>
      <div style={{
        fontSize: 10,
        color: 'rgba(255,255,255,0.25)',
        letterSpacing: '0.1em',
        textTransform: 'uppercase',
      }}>
        QR
      </div>
    </div>
  )
}
