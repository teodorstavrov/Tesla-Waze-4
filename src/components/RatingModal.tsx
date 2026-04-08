// ─── Rating Modal ──────────────────────────────────────────────────────
// Quick 1–5 star rating popup. Opened via openRatingModal().

import { useState, useEffect, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { isTeslaBrowser } from '@/lib/browser'

let _open: (() => void) | null = null
export function openRatingModal(): void { _open?.() }

interface RatingStats { avg: number | null; count: number }

export function RatingModal() {
  const [open,    setOpen]    = useState(false)
  const [shown,   setShown]   = useState(false)
  const [hovered, setHovered] = useState(0)
  const [selected,setSelected]= useState(0)
  const [comment, setComment] = useState('')
  const [name,    setName]    = useState('')
  const [email,   setEmail]   = useState('')
  const [country, setCountry] = useState('')
  const [city,    setCity]    = useState('')
  const [state,   setState]   = useState<'idle' | 'sending' | 'sent' | 'error'>('idle')
  const [errMsg,  setErrMsg]  = useState('')
  const [stats,   setStats]   = useState<RatingStats | null>(null)

  _open = () => {
    setOpen(true)
    setHovered(0); setSelected(0); setComment(''); setName(''); setEmail(''); setCountry(''); setCity(''); setState('idle'); setErrMsg('')
    if (isTeslaBrowser) {
      setShown(true)
    } else {
      requestAnimationFrame(() => requestAnimationFrame(() => setShown(true)))
    }
    // Fetch aggregate in background
    fetch('/api/rating')
      .then((r) => r.json() as Promise<RatingStats>)
      .then(setStats)
      .catch(() => { /* non-fatal */ })
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

  async function handleSubmit() {
    if (!selected || state === 'sending') return
    setState('sending')
    setErrMsg('')
    try {
      const res = await fetch('/api/rating', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          rating:  selected,
          comment: comment.trim(),
          name:    name.trim(),
          email:   email.trim(),
          country: country.trim(),
          city:    city.trim(),
        }),
      })
      const data = await res.json() as { ok?: boolean; error?: string }
      if (!res.ok) { setState('error'); setErrMsg(data.error ?? 'Грешка'); return }
      setState('sent')
    } catch {
      setState('error'); setErrMsg('Няма връзка. Опитайте отново.')
    }
  }

  const display = hovered || selected

  return createPortal(
    <div style={{
      position: 'fixed', inset: 0, zIndex: 900,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      opacity: shown ? 1 : 0, transition: 'opacity 0.22s ease',
    }}>
      {/* Backdrop */}
      {/* eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions */}
      <div onClick={close} style={{
        position: 'absolute', inset: 0,
        background: 'rgba(0,0,0,0.82)',
      }} />

      {/* Card */}
      <div style={{
        position: 'relative', zIndex: 1,
        width: 'min(380px, calc(100vw - 40px))',
        padding: '28px 24px 24px',
        borderRadius: 20,
        background: 'rgba(18,18,26,0.96)',
        border: '1px solid rgba(255,255,255,0.12)',
        boxShadow: '0 24px 64px rgba(0,0,0,0.6)',
        display: 'flex', flexDirection: 'column', gap: 20,
        opacity: shown ? 1 : 0,
        transform: shown ? 'scale(1)' : 'scale(0.96)',
        transition: 'opacity 0.22s ease-out, transform 0.22s ease-out',
      }}>
        {/* Close */}
        <button onClick={close} aria-label="Затвори" style={{
          position: 'absolute', top: 14, right: 14,
          width: 34, height: 34, borderRadius: 10,
          background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.1)',
          color: 'rgba(255,255,255,0.5)', cursor: 'pointer', fontSize: 18,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>×</button>

        {state === 'sent' ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14, padding: '12px 0' }}>
            <div style={{ fontSize: 48 }}>🙏</div>
            <div style={{ fontSize: 17, fontWeight: 700, color: '#f2f2f2', textAlign: 'center' }}>
              Благодарим за оценката!
            </div>
            <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.45)', textAlign: 'center' }}>
              {'⭐'.repeat(selected)} {selected}/5
            </div>
          </div>
        ) : (
          <>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 18, fontWeight: 700, color: '#f2f2f2', marginBottom: 4 }}>
                Оцени Tesla RADAR
              </div>
              <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)' }}>
                Твоята оценка ни помага да подобряваме приложението
              </div>

              {/* Aggregate stats */}
              {stats && stats.count > 0 && (
                <div style={{
                  display: 'inline-flex', alignItems: 'center', gap: 6,
                  marginTop: 10, padding: '5px 14px', borderRadius: 20,
                  background: 'rgba(251,191,36,0.1)',
                  border: '1px solid rgba(251,191,36,0.25)',
                }}>
                  <span style={{ fontSize: 15, color: '#fbbf24', letterSpacing: 1 }}>
                    {'★'.repeat(Math.round(stats.avg ?? 0))}{'☆'.repeat(5 - Math.round(stats.avg ?? 0))}
                  </span>
                  <span style={{ fontSize: 13, fontWeight: 700, color: '#fbbf24' }}>
                    {stats.avg?.toFixed(1)}
                  </span>
                  <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.35)' }}>
                    ({stats.count} {stats.count === 1 ? 'глас' : stats.count < 5 ? 'гласа' : 'гласа'})
                  </span>
                </div>
              )}
            </div>

            {/* Stars */}
            <div style={{ display: 'flex', justifyContent: 'center', gap: 10 }}>
              {[1,2,3,4,5].map((s) => (
                <button
                  key={s}
                  onClick={() => setSelected(s)}
                  onPointerEnter={() => setHovered(s)}
                  onPointerLeave={() => setHovered(0)}
                  aria-label={`${s} звезди`}
                  style={{
                    background: 'none', border: 'none', cursor: 'pointer',
                    fontSize: 44, lineHeight: 1, padding: '4px 2px',
                    filter: s <= display
                      ? 'drop-shadow(0 0 8px rgba(251,191,36,0.7))'
                      : 'none',
                    transform: s <= display ? 'scale(1.15)' : 'scale(1)',
                    transition: 'transform 0.12s ease, filter 0.12s ease',
                    color: s <= display ? '#fbbf24' : 'rgba(255,255,255,0.15)',
                  }}
                >
                  ★
                </button>
              ))}
            </div>

            {/* Optional fields — shown after star selection */}
            {selected > 0 && (() => {
              const inputStyle: React.CSSProperties = {
                width: '100%', padding: '10px 12px', borderRadius: 10, boxSizing: 'border-box',
                background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.14)',
                color: '#f2f2f2', fontSize: 13, outline: 'none', fontFamily: 'inherit',
              }
              return (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <div style={{ display: 'flex', gap: 10 }}>
                    <input
                      placeholder="Име (незадължително)"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      style={{ ...inputStyle, flex: 1 }}
                    />
                    <input
                      placeholder="Имейл (незадължително)"
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      style={{ ...inputStyle, flex: 1 }}
                    />
                  </div>
                  <div style={{ display: 'flex', gap: 10 }}>
                    <input
                      placeholder="Държава"
                      value={country}
                      onChange={(e) => setCountry(e.target.value)}
                      style={{ ...inputStyle, flex: 1 }}
                    />
                    <input
                      placeholder="Град"
                      value={city}
                      onChange={(e) => setCity(e.target.value)}
                      style={{ ...inputStyle, flex: 1 }}
                    />
                  </div>
                  <textarea
                    placeholder="Коментар (незадължително)..."
                    value={comment}
                    onChange={(e) => setComment(e.target.value)}
                    rows={3}
                    style={{ ...inputStyle, resize: 'none' }}
                  />
                </div>
              )
            })()}

            {state === 'error' && (
              <div style={{ fontSize: 13, color: '#f87171', textAlign: 'center' }}>{errMsg}</div>
            )}

            <button
              onClick={() => { void handleSubmit() }}
              disabled={!selected || state === 'sending'}
              style={{
                width: '100%', padding: '15px 0', borderRadius: 14, border: 'none',
                background: selected ? '#e31937' : 'rgba(255,255,255,0.1)',
                color: selected ? '#fff' : 'rgba(255,255,255,0.3)',
                fontSize: 16, fontWeight: 700, cursor: selected ? 'pointer' : 'default',
                touchAction: 'manipulation', transition: 'background 0.15s ease',
                opacity: state === 'sending' ? 0.6 : 1,
              }}
            >
              {state === 'sending' ? 'Изпращане...' : selected ? `Изпрати оценката — ${'⭐'.repeat(selected)}` : 'Избери оценка'}
            </button>
          </>
        )}
      </div>
    </div>,
    document.body,
  )
}
