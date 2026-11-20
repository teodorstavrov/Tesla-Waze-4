// ─── GTA VI Mode — HUD overlay ────────────────────────────────────────────
//
// Renders two things:
//   1. The GTA VI Mode toggle button (always visible, bottom-left)
//   2. The Vice City HUD (WantedLevel + City Activity) — only in GTA mode
//
// WantedLevel is computed from existing eventStore + gpsStore.
// No new API calls or polling — purely derived from live data.

import { useSyncExternalStore, useState, useEffect } from 'react'
import { gtaModeStore } from './gtaModeStore'
import { eventStore } from '@/features/events/eventStore'
import { gpsStore } from '@/features/gps/gpsStore'
import { uiStore } from '@/features/settings/uiStore'
import type { RoadEvent } from '@/features/events/types'
import type { GpsPosition } from '@/features/gps/types'
import { isTeslaBrowser } from '@/lib/browser'

// ── gpsStore adapter for useSyncExternalStore ──────────────────────────────
// gpsStore uses onPosition(cb) subscription; wrap into React-compatible form.
let _gpsSubs    = new Set<() => void>()
let _lastGpsPos = gpsStore.getPosition()
gpsStore.onPosition((pos) => {
  _lastGpsPos = pos
  _gpsSubs.forEach((fn) => fn())
})
function _subGps(fn: () => void) { _gpsSubs.add(fn); return () => _gpsSubs.delete(fn) }
function _getGps() { return _lastGpsPos }

// ── Wanted Level calculation ───────────────────────────────────────────────
// 5-level indicator derived entirely from existing police events + GPS position.
// Levels:
//   0 = no police events within 10 km
//   1 = police reports within 5–10 km (distant)
//   2 = within 2–5 km, or several within 5 km
//   3 = within 2 km, or several in 500 m vicinity
//   4 = multiple within 2 km, or one very close (<500 m)
//   5 = immediate vicinity (<200 m) — maximum alert

function _computeWantedLevel(events: RoadEvent[], pos: GpsPosition | null): number {
  if (!pos) return 0

  const police = events.filter((e) => e.type === 'police')
  if (police.length === 0) return 0

  const cosLat = Math.cos(pos.lat * (Math.PI / 180))

  const dists = police.map((e) => {
    const dLat = (e.lat - pos.lat) * 111_320
    const dLng = (e.lng - pos.lng) * 111_320 * cosLat
    return Math.sqrt(dLat * dLat + dLng * dLng)
  }).sort((a, b) => a - b)

  const nearest     = dists[0]
  const within200m  = dists.filter((d) => d <= 200).length
  const within500m  = dists.filter((d) => d <= 500).length
  const within2km   = dists.filter((d) => d <= 2000).length
  const within5km   = dists.filter((d) => d <= 5000).length

  if (within200m >= 1)                               return 5
  if (within500m >= 3 || (nearest <= 500 && within2km >= 2)) return 4
  if (within2km  >= 3 || nearest <= 500)             return 3
  if (within2km  >= 1 || within5km >= 3)             return 2
  if (within5km  >= 1)                               return 1
  return 0
}

// ── Component ──────────────────────────────────────────────────────────────

export function GTAHud() {
  const gtaActive = useSyncExternalStore(
    gtaModeStore.subscribe.bind(gtaModeStore),
    () => gtaModeStore.isActive(),
    () => false,
  )
  const quality = useSyncExternalStore(
    gtaModeStore.subscribe.bind(gtaModeStore),
    () => gtaModeStore.getQuality(),
    () => 'full' as const,
  )

  const events = useSyncExternalStore(
    eventStore.subscribe.bind(eventStore),
    () => eventStore.getState().events,
    () => [] as RoadEvent[],
  )

  const gpsPos = useSyncExternalStore(_subGps, _getGps, _getGps)

  const wantedLevel = _computeWantedLevel(events, gpsPos)

  // City Activity counts — reused from existing eventStore data
  const policeCount   = events.filter((e) => e.type === 'police').length
  const accidentCount = events.filter((e) => e.type === 'accident').length
  const hazardCount   = events.filter((e) => e.type === 'hazard').length

  // Quality toggle — in GTA mode settings row
  const [showSettings, setShowSettings] = useState(false)

  // Reset settings panel when mode turns off
  useEffect(() => {
    if (!gtaActive) setShowSettings(false)
  }, [gtaActive])

  return (
    <>
      {/* ── Vice City sunset vignette — edge glow on the map ── */}
      {gtaActive && (
        <div
          aria-hidden="true"
          style={{
            position:      'fixed',
            inset:         0,
            zIndex:        351,
            pointerEvents: 'none',
            background: [
              'radial-gradient(ellipse at 0% 0%,   rgba(139,66,255,0.42) 0%, transparent 52%)',
              'radial-gradient(ellipse at 100% 0%,  rgba(243,41,167,0.32) 0%, transparent 50%)',
              'radial-gradient(ellipse at 0% 100%,  rgba(255,181,46,0.38) 0%, transparent 50%)',
              'radial-gradient(ellipse at 100% 100%,rgba(139,66,255,0.36) 0%, transparent 52%)',
              'radial-gradient(ellipse at 50% 100%, rgba(255,100,20,0.28) 0%, transparent 42%)',
            ].join(','),
          }}
        />
      )}

      {/* ── Vice City logo — replaces standard logo in top-left ── */}
      {gtaActive && (
        <img
          src="/vice-city-logo.png"
          alt="TesRadar Vice City Edition"
          style={{
            position:     'absolute',
            top:          12,
            left:         12,
            zIndex:       402,
            height:       50,
            width:        'auto',
            borderRadius: 10,
            pointerEvents: 'none',
            userSelect:   'none',
          }}
        />
      )}

      {/* ── Toggle button — always visible, bottom-left ── */}
      <button
        onClick={gtaModeStore.toggle}
        title={gtaActive ? 'Standard Mode' : 'GTA VI Mode — Vice City'}
        aria-label={gtaActive ? 'Switch to Standard Mode' : 'Switch to GTA VI Mode'}
        aria-pressed={gtaActive}
        className={gtaActive ? 'gta-toggle-active' : ''}
        style={{
          position:    'absolute',
          left:        12,
          bottom:      110,
          zIndex:      410,
          width:       gtaActive ? 56 : 44,
          height:      gtaActive ? 56 : 44,
          borderRadius: gtaActive ? 14 : 10,
          background:  gtaActive
            ? 'rgba(243, 41, 167, 0.28)'
            : 'rgba(255, 255, 255, 0.50)',
          border: gtaActive
            ? '1.5px solid #F329A7'
            : '1px solid rgba(255, 255, 255, 0.30)',
          color:    gtaActive ? '#F329A7' : '#111',
          cursor:   'pointer',
          touchAction: 'manipulation',
          userSelect: 'none',
          WebkitUserSelect: 'none',
          display:  'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 1,
          transition: isTeslaBrowser ? undefined : 'width 0.2s, height 0.2s, background 0.2s',
        }}
      >
        <span style={{ fontSize: gtaActive ? 20 : 16, lineHeight: 1 }}>🎮</span>
        {gtaActive && (
          <span style={{
            fontSize: 7, fontWeight: 800, letterSpacing: '0.08em',
            lineHeight: 1, textTransform: 'uppercase', color: '#F329A7',
          }}>
            VICE
          </span>
        )}
      </button>

      {/* ── GTA VI HUD badge + WantedLevel — top-center ── */}
      {gtaActive && (
        <div
          style={{
            position:  'absolute',
            top:       12,
            left:      '50%',
            transform: 'translateX(-50%)',
            zIndex:    405,
            display:   'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap:       6,
            pointerEvents: 'none',
          }}
        >
          {/* GTA VI Mode badge */}
          <div style={{
            background:    'rgba(8, 13, 32, 0.90)',
            border:        '1px solid rgba(139, 66, 255, 0.50)',
            borderRadius:  10,
            padding:       '3px 14px',
            display:       'flex',
            alignItems:    'center',
            gap:           8,
            backdropFilter: isTeslaBrowser ? undefined : 'blur(12px)',
            WebkitBackdropFilter: isTeslaBrowser ? undefined : 'blur(12px)',
          }}>
            <span style={{
              fontSize:      10,
              fontWeight:    900,
              letterSpacing: '0.12em',
              textTransform: 'uppercase',
              color:         '#8B42FF',
            }}>
              GTA VI
            </span>
            <span style={{ width: 1, height: 10, background: 'rgba(139,66,255,0.40)', display: 'inline-block' }} />
            <span style={{
              fontSize:      10,
              fontWeight:    700,
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
              color:         '#F329A7',
            }}>
              Vice City
            </span>
            {quality === 'lite' && (
              <>
                <span style={{ width: 1, height: 10, background: 'rgba(139,66,255,0.40)', display: 'inline-block' }} />
                <span style={{ fontSize: 8, fontWeight: 700, color: '#A8B2D1', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
                  LITE
                </span>
              </>
            )}
          </div>

          {/* Wanted Level */}
          <WantedLevelIndicator level={wantedLevel} />
        </div>
      )}

      {/* ── Gear (settings) button — bottom-right, same row as tilt + Report ── */}
      <button
        className="icon-btn"
        onClick={uiStore.toggleSettings}
        title="Settings"
        aria-label="Settings"
        style={{
          position:    'absolute',
          right:       12,
          bottom:      24,
          zIndex:      410,
          width:       63,
          height:      63,
        }}
      >
        <GtaGearIcon />
      </button>

      {/* ── City Activity + Quality toggle — top-right, below stats card ── */}
      {gtaActive && (
        <div style={{
          position:  'absolute',
          right:     12,
          top:       182,
          zIndex:    405,
          display:   'flex',
          flexDirection: 'column',
          gap:       6,
          alignItems: 'flex-end',
          pointerEvents: 'none',
        }}>
          {/* Quality toggle */}
          <button
            style={{
              pointerEvents: 'auto',
              background:    'rgba(8, 13, 32, 0.90)',
              border:        quality === 'full'
                ? '1px solid rgba(255,181,46,0.50)'
                : '1px solid rgba(139, 66, 255, 0.35)',
              borderRadius:  8,
              color:         quality === 'full' ? '#FFB52E' : '#A8B2D1',
              fontSize:      9,
              fontWeight:    700,
              letterSpacing: '0.07em',
              textTransform: 'uppercase',
              padding:       '4px 10px',
              cursor:        'pointer',
              touchAction:   'manipulation',
            }}
            onClick={() => gtaModeStore.setQuality(quality === 'full' ? 'lite' : 'full')}
            title={quality === 'full' ? 'Switch to Lite mode (better performance)' : 'Switch to Full mode'}
          >
            {quality === 'full' ? '⚡ Full' : '🔋 Lite'}
          </button>

          {/* City Activity mini panel */}
          <CityActivity
            police={policeCount}
            accidents={accidentCount}
            hazards={hazardCount}
          />
        </div>
      )}
    </>
  )
}

// ── Wanted Level indicator ─────────────────────────────────────────────────

function WantedLevelIndicator({ level }: { level: number }) {
  const starColors: Record<number, string> = {
    0: '#1a2040',  // empty star background
    1: '#FFB52E',
    2: '#F97316',
    3: '#EF4444',
    4: '#B91C1C',
    5: '#FF405C',
  }

  const activeColor =
    level === 0 ? '#1E2847'
    : level <= 2 ? '#FFB52E'
    : level <= 3 ? '#EF4444'
    :              '#FF405C'

  const label =
    level === 0 ? 'ALL CLEAR'
    : level === 1 ? 'CAUTION'
    : level === 2 ? 'WATCH OUT'
    : level === 3 ? 'ALERT'
    : level === 4 ? 'HIGH ALERT'
    :               'DANGER'

  return (
    <div style={{
      background:    'rgba(8, 13, 32, 0.92)',
      border:        `1px solid ${level > 0 ? activeColor + '55' : 'rgba(139,66,255,0.30)'}`,
      borderRadius:  10,
      padding:       '5px 14px',
      display:       'flex',
      flexDirection: 'column',
      alignItems:    'center',
      gap:           3,
      backdropFilter: isTeslaBrowser ? undefined : 'blur(12px)',
      WebkitBackdropFilter: isTeslaBrowser ? undefined : 'blur(12px)',
    }}>
      {/* Stars row */}
      <div style={{ display: 'flex', gap: 5 }}>
        {[1, 2, 3, 4, 5].map((star) => (
          <StarIcon
            key={star}
            filled={star <= level}
            color={star <= level ? starColors[level] : '#1E2847'}
          />
        ))}
      </div>
      {/* Label */}
      <span style={{
        fontSize:      8,
        fontWeight:    800,
        letterSpacing: '0.12em',
        textTransform: 'uppercase',
        color:         level > 0 ? activeColor : '#3A4A6E',
        lineHeight:    1,
      }}>
        {label}
      </span>
    </div>
  )
}

function StarIcon({ filled, color }: { filled: boolean; color: string }) {
  return (
    <svg width="16" height="15" viewBox="0 0 24 22" fill="none" aria-hidden="true">
      <polygon
        points="12,2 15.1,8.6 22,9.5 17,14.4 18.2,21.3 12,18 5.8,21.3 7,14.4 2,9.5 8.9,8.6"
        fill={filled ? color : 'none'}
        stroke={color}
        strokeWidth={filled ? 0 : 1.5}
        opacity={filled ? 1 : 0.35}
      />
    </svg>
  )
}

// ── City Activity panel ─────────────────────────────────────────────────────

function CityActivity({
  police, accidents, hazards,
}: {
  police:    number
  accidents: number
  hazards:   number
}) {
  const empty = police === 0 && accidents === 0 && hazards === 0

  return (
    <div style={{
      background:    'rgba(8, 13, 32, 0.90)',
      border:        '1px solid rgba(139, 66, 255, 0.35)',
      borderRadius:  10,
      padding:       '6px 10px',
      display:       'flex',
      flexDirection: 'column',
      gap:           3,
      minWidth:      72,
      backdropFilter: isTeslaBrowser ? undefined : 'blur(12px)',
      WebkitBackdropFilter: isTeslaBrowser ? undefined : 'blur(12px)',
    }}>
      <span style={{
        fontSize:      7,
        fontWeight:    800,
        letterSpacing: '0.10em',
        textTransform: 'uppercase',
        color:         '#8B42FF',
        marginBottom:  1,
      }}>
        City Activity
      </span>
      {empty && (
        <span style={{ fontSize: 9, color: '#3A4A6E', letterSpacing: '0.06em', textTransform: 'uppercase' }}>
          All Quiet
        </span>
      )}
      {police > 0 && (
        <ActivityRow emoji="🚔" count={police} color="#3B82F6" label="Police" />
      )}
      {accidents > 0 && (
        <ActivityRow emoji="🚨" count={accidents} color="#EF4444" label="Accident" />
      )}
      {hazards > 0 && (
        <ActivityRow emoji="⚠️" count={hazards} color="#FFB52E" label="Hazard" />
      )}
    </div>
  )
}

function GtaGearIcon() {
  return (
    <svg width="26" height="26" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  )
}

function ActivityRow({
  emoji, count, color, label,
}: {
  emoji: string; count: number; color: string; label: string
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
      <span style={{ fontSize: 11, lineHeight: 1 }}>{emoji}</span>
      <span style={{ fontSize: 11, fontWeight: 700, color, lineHeight: 1, minWidth: 14 }}>
        {count}
      </span>
      <span style={{ fontSize: 8, color: '#A8B2D1', letterSpacing: '0.05em', lineHeight: 1 }}>
        {label.toUpperCase()}
      </span>
    </div>
  )
}
