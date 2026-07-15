// ─── Lock Sound Modal ───────────────────────────────────────────────────
//
// Lets users preview 10 Tesla lock-chime melodies, then request a
// one-time download link (sent by email) after making a donation.
//
// Flow:  browse → checkout → success

import { useState, useRef, useCallback, useEffect } from 'react'
import { useSyncExternalStore } from 'react'
import { createPortal } from 'react-dom'
import { isTeslaBrowser } from '@/lib/browser'
import { t, langStore } from '@/lib/locale'

// ── Melody catalog (matches filenames in public/sounds/) ───────────────
const SOUNDS = [
  { id: '90s_modem-connecting',              label: '90s Modem Connecting',          emoji: '📠' },
  { id: 'among-us_role-reveal-sound',        label: 'Among Us Role Reveal',          emoji: '🎮' },
  { id: 'brainrot_rizzbot-laugh',            label: 'Rizzbot Laugh',                 emoji: '😂' },
  { id: 'general_owl-hoot',                  label: 'Owl Hoot',                      emoji: '🦉' },
  { id: 'general_turkey-gobble',             label: 'Turkey Gobble',                 emoji: '🦃' },
  { id: 'metal-gear-solid_alert',            label: 'Metal Gear Solid Alert',        emoji: '🚨' },
  { id: 'nintendo_mario-die',                label: 'Mario Game Over',               emoji: '🍄' },
  { id: 'police_dispatch-siren',             label: 'Police Siren',                  emoji: '🚔' },
  { id: 'road-runner_meep-meep',             label: 'Road Runner Meep Meep',         emoji: '🐦' },
  { id: 'who-wants-to-be-a-millionaire_theme', label: 'Who Wants to Be a Millionaire', emoji: '💰' },
] as const

type SoundId = typeof SOUNDS[number]['id']
type View = 'browse' | 'checkout' | 'success'

// ── Module-level opener ────────────────────────────────────────────────
let _openFn: (() => void) | null = null
export function openLockSoundModal(): void { _openFn?.() }

// ── Component ──────────────────────────────────────────────────────────
export function LockSoundModal() {
  // Re-render when language changes so all t() calls pick up the new lang
  useSyncExternalStore(langStore.subscribe, langStore.getLang, langStore.getLang)

  const [open,     setOpen]     = useState(false)
  const [shown,    setShown]    = useState(false)
  const [view,     setView]     = useState<View>('browse')
  const [selected, setSelected] = useState<SoundId | null>(null)
  const [playing,  setPlaying]  = useState<SoundId | null>(null)
  const [email,    setEmail]    = useState('')
  const [sending,  setSending]  = useState(false)
  const [error,    setError]    = useState('')

  const audioRef = useRef<HTMLAudioElement | null>(null)

  _openFn = () => {
    setView('browse')
    setSelected(null)
    setPlaying(null)
    setEmail('')
    setError('')
    setOpen(true)
    if (isTeslaBrowser) {
      setShown(true)
    } else {
      requestAnimationFrame(() => requestAnimationFrame(() => setShown(true)))
    }
  }

  const close = useCallback(() => {
    audioRef.current?.pause()
    setPlaying(null)
    setShown(false)
    setTimeout(() => setOpen(false), isTeslaBrowser ? 0 : 220)
  }, [])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, close])

  // Stop audio when modal closes
  useEffect(() => {
    if (!open) { audioRef.current?.pause(); setPlaying(null) }
  }, [open])

  if (!open) return null

  function handlePlay(id: SoundId) {
    if (playing === id) {
      audioRef.current?.pause()
      setPlaying(null)
      return
    }
    audioRef.current?.pause()
    const audio = new Audio(`/sounds/${id}.wav`)
    audio.onended = () => setPlaying(null)
    audio.play().catch(() => {})
    audioRef.current = audio
    setPlaying(id)
  }

  function handleSelect(id: SoundId) {
    setSelected(id)
    audioRef.current?.pause()
    setPlaying(null)
    setView('checkout')
  }

  async function handleSendLink(e: React.FormEvent) {
    e.preventDefault()
    if (!selected) return
    setSending(true)
    setError('')
    try {
      const res = await fetch('/api/sounds/request-link', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ melodyId: selected, email: email.trim() }),
      })
      const data = await res.json() as { ok?: boolean; error?: string }
      if (!res.ok) { setError(data.error ?? t('lockSound.errRetry')); return }
      setView('success')
    } catch {
      setError(t('lockSound.errNoConn'))
    } finally {
      setSending(false)
    }
  }

  const selectedSound = SOUNDS.find((s) => s.id === selected)

  return createPortal(
    <div style={{
      position:  'fixed',
      inset:     0,
      zIndex:    800,
      display:   'flex',
      alignItems: 'center',
      justifyContent: 'center',
      opacity:   shown ? 1 : 0,
      transition: isTeslaBrowser ? undefined : 'opacity 0.22s ease',
    }}>
      {/* Backdrop */}
      {/* eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions */}
      <div onClick={close} style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.88)' }} />

      {/* Card */}
      <div role="dialog" aria-modal="true" style={{
        position:      'relative',
        zIndex:        1,
        width:         'min(480px, calc(100vw - 32px))',
        maxHeight:     'calc(100vh - 48px)',
        overflowY:     'auto',
        padding:       '24px 20px 20px',
        borderRadius:  20,
        background:    'rgba(14, 14, 22, 0.99)',
        border:        '1px solid rgba(255,255,255,0.12)',
        boxShadow:     '0 24px 64px rgba(0,0,0,0.7)',
        display:       'flex',
        flexDirection: 'column',
        gap:           18,
        opacity:       shown ? 1 : 0,
        transform:     shown ? 'scale(1)' : 'scale(0.96)',
        transition:    isTeslaBrowser ? undefined : 'opacity 0.22s ease-out, transform 0.22s ease-out',
      }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 }}>
          <div>
            <div style={{ fontSize: 19, fontWeight: 800, color: '#f2f2f2', lineHeight: 1.2 }}>
              {view === 'browse'   ? '🔔 Tesla Lock Sounds'                              : null}
              {view === 'checkout' ? `${selectedSound?.emoji ?? '🔔'} ${selectedSound?.label}` : null}
              {view === 'success'  ? t('lockSound.successHeader')                        : null}
            </div>
            {view === 'browse' && (
              <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.45)', marginTop: 6, lineHeight: 1.5 }}>
                {t('lockSound.subtitle')}
              </div>
            )}
          </div>
          <button
            onClick={close}
            aria-label={t('lockSound.close')}
            style={{
              flexShrink: 0, width: 34, height: 34,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              borderRadius: 9, background: 'rgba(255,255,255,0.07)',
              border: '1px solid rgba(255,255,255,0.1)',
              color: 'rgba(255,255,255,0.5)', fontSize: 16, cursor: 'pointer', touchAction: 'manipulation',
            }}
          >✕</button>
        </div>

        {/* ── Browse view ─────────────────────────────────────────────── */}
        {view === 'browse' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {SOUNDS.map((s) => (
              <div key={s.id} style={{
                display:       'flex',
                alignItems:    'center',
                gap:           12,
                padding:       '12px 14px',
                borderRadius:  12,
                background:    'rgba(255,255,255,0.05)',
                border:        '1px solid rgba(255,255,255,0.10)',
              }}>
                <span style={{ fontSize: 24, flexShrink: 0, width: 32, textAlign: 'center' }}>{s.emoji}</span>
                <div style={{ flex: 1, fontSize: 14, fontWeight: 600, color: '#f2f2f2', lineHeight: 1.3 }}>
                  {s.label}
                </div>
                {/* Play/pause */}
                <button
                  onClick={() => handlePlay(s.id)}
                  title={playing === s.id ? t('lockSound.pause') : t('lockSound.play')}
                  style={{
                    flexShrink: 0, width: 38, height: 38,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    borderRadius: 10,
                    background: playing === s.id ? 'rgba(227,25,55,0.2)' : 'rgba(255,255,255,0.08)',
                    border: `1px solid ${playing === s.id ? 'rgba(227,25,55,0.4)' : 'rgba(255,255,255,0.12)'}`,
                    color: playing === s.id ? '#e31937' : 'rgba(255,255,255,0.7)',
                    cursor: 'pointer', touchAction: 'manipulation', fontSize: 16,
                  }}
                >
                  {playing === s.id ? '⏸' : '▶'}
                </button>
                {/* Select */}
                <button
                  onClick={() => handleSelect(s.id)}
                  style={{
                    flexShrink: 0,
                    padding: '8px 14px',
                    borderRadius: 10,
                    background: '#e31937',
                    border: 'none',
                    color: '#fff',
                    fontSize: 13,
                    fontWeight: 700,
                    cursor: 'pointer',
                    touchAction: 'manipulation',
                  }}
                >
                  {t('lockSound.select')}
                </button>
              </div>
            ))}
          </div>
        )}

        {/* ── Checkout view ────────────────────────────────────────────── */}
        {view === 'checkout' && selectedSound && (
          <>
            {/* Back */}
            <button
              onClick={() => setView('browse')}
              style={{
                alignSelf: 'flex-start', padding: '6px 14px', borderRadius: 8,
                background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.12)',
                color: 'rgba(255,255,255,0.6)', fontSize: 13, cursor: 'pointer', touchAction: 'manipulation',
              }}
            >
              {t('lockSound.back')}
            </button>

            {/* Donation box */}
            <div style={{
              padding: '18px', borderRadius: 14,
              background: 'rgba(227,25,55,0.08)',
              border: '1px solid rgba(227,25,55,0.25)',
            }}>
              <div style={{ fontSize: 15, fontWeight: 700, color: '#f2f2f2', marginBottom: 8 }}>
                {t('lockSound.step1Title')}
              </div>
              <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.55)', marginBottom: 14, lineHeight: 1.6 }}>
                {t('lockSound.step1Desc')}
              </div>
              <a
                href="https://buy.stripe.com/14AaEXfak7HT744daj8g001"
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  display: 'inline-block', padding: '11px 22px',
                  borderRadius: 10, background: '#e31937',
                  color: '#fff', textDecoration: 'none',
                  fontSize: 14, fontWeight: 700,
                }}
              >
                {t('lockSound.donateBtn')}
              </a>
            </div>

            {/* Email form */}
            <form onSubmit={(e) => { void handleSendLink(e) }} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: '#f2f2f2' }}>
                {t('lockSound.step2Title')}
              </div>
              <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.45)', lineHeight: 1.5 }}>
                {t('lockSound.step2DescPre')} <strong style={{ color: '#f2f2f2' }}>{selectedSound.label}</strong>{t('lockSound.step2DescPost')}
              </div>
              <input
                type="email"
                placeholder={t('lockSound.emailPlaceholder')}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                disabled={sending}
                style={{
                  width: '100%', padding: '12px 14px', borderRadius: 10, boxSizing: 'border-box',
                  background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.16)',
                  color: '#f2f2f2', fontSize: 14, outline: 'none', fontFamily: 'inherit',
                }}
              />
              {error && (
                <div style={{ fontSize: 13, color: '#f87171', padding: '4px 2px' }}>{error}</div>
              )}
              <button
                type="submit"
                disabled={sending}
                style={{
                  padding: '14px 0', borderRadius: 12, border: 'none',
                  background: sending ? 'rgba(227,25,55,0.5)' : '#e31937',
                  color: '#fff', fontSize: 15, fontWeight: 700,
                  cursor: sending ? 'default' : 'pointer', touchAction: 'manipulation',
                  boxShadow: '0 4px 20px rgba(227,25,55,0.3)',
                }}
              >
                {sending ? t('lockSound.sending') : t('lockSound.sendBtn')}
              </button>
            </form>
          </>
        )}

        {/* ── Success view ─────────────────────────────────────────────── */}
        {view === 'success' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16, padding: '4px 0' }}>
            <div style={{ textAlign: 'center', fontSize: 48 }}>📬</div>
            <div style={{ fontSize: 15, fontWeight: 700, color: '#f2f2f2', textAlign: 'center' }}>
              {t('lockSound.successSent')} {email}
            </div>

            {/* Instructions */}
            <div style={{
              padding: '16px', borderRadius: 14,
              background: 'rgba(255,255,255,0.05)',
              border: '1px solid rgba(255,255,255,0.10)',
            }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#f2f2f2', marginBottom: 12 }}>
                {t('lockSound.installTitle')}
              </div>
              <ol style={{ margin: 0, paddingLeft: 18, color: 'rgba(255,255,255,0.7)', fontSize: 13, lineHeight: 2.1 }}>
                <li>{t('lockSound.install1')}</li>
                <li>{t('lockSound.install2')} — <strong style={{ color: '#f2f2f2' }}>LockChime.wav</strong></li>
                <li>{t('lockSound.install3')}</li>
                <li>{t('lockSound.install4')}</li>
                <li>{t('lockSound.install5')}</li>
              </ol>
            </div>

            <button
              onClick={close}
              style={{
                padding: '13px 0', borderRadius: 12,
                background: 'rgba(255,255,255,0.09)', border: '1px solid rgba(255,255,255,0.15)',
                color: '#f2f2f2', fontSize: 15, fontWeight: 600, cursor: 'pointer', touchAction: 'manipulation',
              }}
            >
              {t('lockSound.close')}
            </button>
          </div>
        )}
      </div>
    </div>,
    document.body,
  )
}
