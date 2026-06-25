// ─── Meetup detail modal ────────────────────────────────────────────────
// Opened by tapping an event marker. Shows contact info + Follow + Edit (owner).

import { useState, useSyncExternalStore } from 'react'
import { meetupStore } from './meetupStore'
import { getMeetupToken, getDeviceId, getRsvp, setRsvp } from './userMeetupOwner'
import { routeStore } from '@/features/route/routeStore'
import { t, langStore, getLang } from '@/lib/locale'
import { formatRecurrence, nextOccurrence } from './recurrence'
import type { Meetup } from './types'

const LANG_LOCALE: Record<string, string> = {
  bg: 'bg-BG', en: 'en-GB', no: 'nb-NO', sv: 'sv-SE', fi: 'fi-FI', nl: 'nl-NL',
}

function fmt(iso: string): string {
  const d = new Date(iso)
  if (isNaN(d.getTime())) return iso
  const locale = LANG_LOCALE[getLang()] ?? 'en-GB'
  return d.toLocaleString(locale, { weekday: 'short', day: '2-digit', month: 'long', hour: '2-digit', minute: '2-digit' })
}
const isUrl = (s: string) => /^https?:\/\//i.test(s)

const SITE = 'https://tesradar.tech'

function copyToClipboard(text: string): Promise<void> {
  if (navigator.clipboard?.writeText) return navigator.clipboard.writeText(text)
  // Fallback for Tesla browser
  return new Promise((resolve) => {
    const el = document.createElement('textarea')
    el.value = text
    el.style.position = 'fixed'
    el.style.opacity = '0'
    document.body.appendChild(el)
    el.focus()
    el.select()
    document.execCommand('copy')
    document.body.removeChild(el)
    resolve()
  })
}

export function MeetupDetail() {
  const state = useSyncExternalStore(
    meetupStore.subscribe.bind(meetupStore),
    () => meetupStore.getState(),
    () => meetupStore.getState(),
  )
  useSyncExternalStore(langStore.subscribe, langStore.getLang)
  const m = state.selected
  if (!m) return null
  return <MeetupDetailInner key={m.id} m={m} />
}

function MeetupDetailInner({ m }: { m: Meetup }) {
  const isOwner = getMeetupToken(m.id) != null
  const deviceId = getDeviceId()
  const savedRsvp = getRsvp(m.id)
  const [following,     setFollowing]    = useState(false)
  const [copied,        setCopied]       = useState(false)
  const [attending,     setAttending]    = useState(savedRsvp.attend)
  const [interested,    setInterested]   = useState(savedRsvp.interest)
  const [attendCount,   setAttendCount]  = useState((m.attendees  ?? []).length)
  const [interestCount, setInterestCount] = useState((m.interested ?? []).length)

  async function rsvpToggle(type: 'attend' | 'interest') {
    const isOn    = type === 'attend' ? attending : interested
    const action  = isOn ? 'remove' : 'add'
    const newVal  = !isOn
    if (type === 'attend')   { setAttending(newVal);  setAttendCount(c  => c + (newVal ? 1 : -1)) }
    else                     { setInterested(newVal); setInterestCount(c => c + (newVal ? 1 : -1)) }
    setRsvp(m.id, type, newVal)
    try {
      const res = await fetch('/api/meetups/rsvp', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: m.id, deviceId, type, action }),
      })
      if (res.ok) {
        const data = await res.json()
        if (data.meetup) {
          meetupStore.upsertLocal(data.meetup as Meetup)
          if (type === 'attend')   setAttendCount((data.meetup.attendees  ?? []).length)
          else                     setInterestCount((data.meetup.interested ?? []).length)
        }
      }
    } catch { /* revert optimistic update */ }
  }

  function shareLink() {
    void copyToClipboard(`${SITE}/?meetup=${m.id}`).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2500)
    })
  }

  async function follow() {
    if (!m) return
    const email = window.prompt(t('meetup.followPrompt'))
    if (!email) return
    try {
      const res = await fetch('/api/meetups/interest', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: m.id, email }),
      })
      if (res.ok) setFollowing(true)
      else { const d = await res.json(); alert(d.error ?? t('meetup.errorSave')) }
    } catch { /* ignore */ }
  }

  return (
    <div style={overlay} onClick={() => meetupStore.closeDetail()}>
      <div style={card} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', padding: '16px 18px 8px' }}>
          <div style={{ fontSize: 18, fontWeight: 800, paddingRight: 8 }}>📅 {m.title}</div>
          <button onClick={() => meetupStore.closeDetail()} style={closeBtn}>✕</button>
        </div>
        <div style={{ padding: '0 18px 16px', display: 'flex', flexDirection: 'column', gap: 8 }}>
          {/* Date: show next occurrence for recurring events */}
          {m.recurrence && m.recurrence !== 'none'
            ? <Row icon="🕒" text={fmt(nextOccurrence(new Date(m.date), m.recurrence).toISOString())} />
            : <Row icon="🕒" text={fmt(m.date)} />
          }
          {/* Recurrence pattern + description */}
          {m.recurrence && m.recurrence !== 'none' && (
            <Row icon="🔁" text={
              <span style={{ color: '#a5b4fc' }}>
                {t('meetup.recPattern')} {formatRecurrence(new Date(m.date), m.recurrence, getLang())}
              </span>
            } />
          )}
          {m.description && (
            <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.7)', lineHeight: 1.5, background: 'rgba(255,255,255,0.04)', borderRadius: 8, padding: '8px 10px', marginTop: 2 }}>
              {m.description}
            </div>
          )}
          {m.organizer && <Row icon="👤" text={m.organizer} />}
          {m.organizerPhone && <Row icon="📞" text={<a href={`tel:${m.organizerPhone}`} style={link}>{m.organizerPhone}</a>} />}
          {m.organizerEmail && <Row icon="✉️" text={<a href={`mailto:${m.organizerEmail}`} style={link}>{m.organizerEmail}</a>} />}
          {m.facebook && <Row icon="f" text={isUrl(m.facebook) ? <a href={m.facebook} target="_blank" rel="noopener noreferrer" style={link}>{t('meetup.facebookGroup')}</a> : m.facebook} />}

          {/* RSVP buttons */}
          <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
            <button
              onClick={() => void rsvpToggle('attend')}
              style={{
                ...btn, flex: 1,
                background:  attending ? 'rgba(34,197,94,0.18)' : 'rgba(255,255,255,0.05)',
                color:       attending ? '#4ade80' : 'rgba(255,255,255,0.8)',
                border:      `1px solid ${attending ? 'rgba(34,197,94,0.5)' : 'rgba(255,255,255,0.15)'}`,
                fontWeight:  attending ? 800 : 600,
              }}
            >
              {attending ? '✅' : '○'} {t('meetup.attendBtn')} {attendCount > 0 && <span style={{ opacity: 0.7, marginLeft: 4 }}>{attendCount}</span>}
            </button>
            <button
              onClick={() => void rsvpToggle('interest')}
              style={{
                ...btn, flex: 1,
                background:  interested ? 'rgba(251,191,36,0.15)' : 'rgba(255,255,255,0.05)',
                color:       interested ? '#fbbf24' : 'rgba(255,255,255,0.8)',
                border:      `1px solid ${interested ? 'rgba(251,191,36,0.45)' : 'rgba(255,255,255,0.15)'}`,
                fontWeight:  interested ? 800 : 600,
              }}
            >
              {interested ? '⭐' : '☆'} {t('meetup.interestBtn')} {interestCount > 0 && <span style={{ opacity: 0.7, marginLeft: 4 }}>{interestCount}</span>}
            </button>
          </div>

          {/* Navigate — available to everyone */}
          <button
            onClick={() => { void routeStore.navigateTo({ lat: m.lat, lng: m.lng, name: m.title }); meetupStore.closeDetail() }}
            style={{ ...btn, marginTop: 8, width: '100%', background: '#e31937', border: 'none', fontWeight: 800, fontSize: 15 }}
          >
            {t('meetup.navigate')}
          </button>

          <div style={{ display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
            {/* Follow — for non-owners */}
            {!isOwner && (
              <button onClick={follow} disabled={following} style={{ ...btn, flex: 1, background: following ? 'rgba(34,197,94,0.15)' : '#6366f1', color: following ? '#22c55e' : '#fff', border: 'none' }}>
                {following ? t('meetup.following') : t('meetup.follow')}
              </button>
            )}
            {/* Edit — always visible; server validates ownership */}
            <button
              onClick={() => meetupStore.openEdit(m)}
              style={{ ...btn, flex: 1, background: isOwner ? 'rgba(99,102,241,0.2)' : 'rgba(255,255,255,0.07)', color: isOwner ? '#a5b4fc' : 'rgba(255,255,255,0.7)', border: `1px solid ${isOwner ? 'rgba(99,102,241,0.45)' : 'rgba(255,255,255,0.15)'}` }}
            >
              {t('meetup.edit')}
            </button>
            {/* Share link — available to everyone */}
            <button
              onClick={shareLink}
              style={{ ...btn, flex: 1, background: copied ? 'rgba(34,197,94,0.15)' : 'rgba(99,102,241,0.12)', color: copied ? '#4ade80' : '#a5b4fc', border: `1px solid ${copied ? 'rgba(34,197,94,0.4)' : 'rgba(99,102,241,0.35)'}` }}
            >
              {copied ? t('meetup.copied') : t('meetup.share')}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

function Row({ icon, text }: { icon: string; text: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', gap: 10, alignItems: 'center', fontSize: 14, color: 'rgba(255,255,255,0.85)' }}>
      <span style={{ width: 20, textAlign: 'center', color: 'rgba(255,255,255,0.6)' }}>{icon}</span>
      <span>{text}</span>
    </div>
  )
}

const overlay: React.CSSProperties = {
  position: 'fixed', inset: 0, zIndex: 1240, background: 'rgba(0,0,0,0.72)',
  display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 12,
}
const card: React.CSSProperties = {
  background: '#161622', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 16,
  width: '100%', maxWidth: 420, color: '#fff', display: 'flex', flexDirection: 'column',
}
const closeBtn: React.CSSProperties = { background: 'transparent', color: 'rgba(255,255,255,0.6)', border: 'none', fontSize: 18, cursor: 'pointer', padding: '2px 6px' }
const link: React.CSSProperties = { color: '#a5b4fc', textDecoration: 'none' }
const btn: React.CSSProperties = {
  borderRadius: 10, padding: '11px 16px', fontSize: 14, fontWeight: 700, cursor: 'pointer',
  color: '#fff', border: '1px solid rgba(255,255,255,0.15)', touchAction: 'manipulation',
}
