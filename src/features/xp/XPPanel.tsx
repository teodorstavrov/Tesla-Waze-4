// ─── XP / Driver Points panel (GTA VI mode only) ─────────────────────────
//
// Renders:
//   • XP badge (top-center, always visible in GTA mode)
//   • Leaderboard overlay (opens on badge tap)
//
// City Activity is rendered alongside this in GTAHud.tsx.

import { useSyncExternalStore, useState, useEffect, useCallback } from 'react'
import { xpStore, xpProgress, type LeaderboardEntry } from './xpStore'
import { authStore } from '@/features/auth/authStore'
import { isTeslaBrowser } from '@/lib/browser'

// ── Level badge colours ───────────────────────────────────────────────────
function levelColor(level: number): string {
  if (level < 5)  return '#6B7280'  // grey — newcomer
  if (level < 10) return '#22C55E'  // green
  if (level < 15) return '#3B82F6'  // blue
  if (level < 20) return '#8B42FF'  // purple
  if (level < 25) return '#F329A7'  // pink
  return '#FFB52E'                   // gold — elite
}

function levelLabel(level: number): string {
  if (level < 5)  return 'Rookie'
  if (level < 10) return 'Driver'
  if (level < 15) return 'Expert'
  if (level < 20) return 'Elite'
  if (level < 25) return 'Legend'
  return 'Hall of Fame'
}

// ── XP Badge ─────────────────────────────────────────────────────────────

export function XPBadge({ onOpen }: { onOpen: () => void }) {
  const { xp, level, initialized } = useSyncExternalStore(
    xpStore.subscribe.bind(xpStore),
    xpStore.getState.bind(xpStore),
    xpStore.getState.bind(xpStore),
  )

  if (!initialized) return null

  const color    = levelColor(level)
  const progress = xpProgress(xp)

  return (
    <button
      onClick={onOpen}
      title="Driver XP — tap for leaderboard"
      style={{
        pointerEvents:   'auto',
        background:      'rgba(8,13,32,0.92)',
        border:          `1px solid ${color}55`,
        borderRadius:    12,
        padding:         '5px 14px 5px 10px',
        display:         'flex',
        alignItems:      'center',
        gap:             8,
        cursor:          'pointer',
        touchAction:     'manipulation',
        backdropFilter:  isTeslaBrowser ? undefined : 'blur(12px)',
        WebkitBackdropFilter: isTeslaBrowser ? undefined : 'blur(12px)',
        boxShadow:       isTeslaBrowser ? undefined : `0 0 16px ${color}30`,
        minWidth:        120,
      }}
    >
      {/* Hexagon XP icon */}
      <svg width="30" height="34" viewBox="0 0 30 34" fill="none" aria-hidden="true">
        <polygon
          points="15,1 28,8 28,26 15,33 2,26 2,8"
          fill={`${color}22`}
          stroke={color}
          strokeWidth="1.5"
        />
        <text x="15" y="20" textAnchor="middle" fill={color}
          fontSize="9" fontWeight="800" letterSpacing="0.5" fontFamily="monospace">
          XP
        </text>
      </svg>

      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 1 }}>
        {/* XP number */}
        <span style={{
          fontSize:      14,
          fontWeight:    900,
          color:         '#E8ECF5',
          letterSpacing: '-0.02em',
          lineHeight:    1,
          fontVariantNumeric: 'tabular-nums',
        }}>
          {xp.toLocaleString()}
        </span>

        {/* Level + progress bar */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
          <span style={{
            fontSize:      9,
            fontWeight:    700,
            color,
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
          }}>
            Lv.{level}
          </span>
          {/* Progress bar */}
          <div style={{ width: 36, height: 3, borderRadius: 2, background: 'rgba(255,255,255,0.10)' }}>
            <div style={{
              height:       '100%',
              width:        `${progress * 100}%`,
              borderRadius: 2,
              background:   color,
              transition:   'width 0.4s ease',
            }} />
          </div>
        </div>
      </div>
    </button>
  )
}

// ── Leaderboard overlay ───────────────────────────────────────────────────

export function LeaderboardPanel({ onClose }: { onClose: () => void }) {
  const [entries, setEntries] = useState<LeaderboardEntry[]>([])
  const [loading, setLoading] = useState(true)

  const myEmail = authStore.getState().email ?? ''

  const load = useCallback(async () => {
    setLoading(true)
    const data = await xpStore.fetchLeaderboard()
    setEntries(data)
    setLoading(false)
  }, [])

  useEffect(() => { void load() }, [load])

  const myXP = useSyncExternalStore(
    xpStore.subscribe.bind(xpStore),
    () => xpStore.getState().xp,
    () => 0,
  )
  const myLevel = useSyncExternalStore(
    xpStore.subscribe.bind(xpStore),
    () => xpStore.getState().level,
    () => 1,
  )
  const myRank = useSyncExternalStore(
    xpStore.subscribe.bind(xpStore),
    () => xpStore.getState().rank,
    () => null,
  )
  const myName = authStore.getState().name ?? ''

  return (
    <div
      style={{
        position:   'fixed',
        inset:      0,
        zIndex:     800,
        display:    'flex',
        alignItems: 'flex-start',
        justifyContent: 'center',
        paddingTop: 70,
        background: 'rgba(4,7,20,0.80)',
        backdropFilter: isTeslaBrowser ? undefined : 'blur(8px)',
        WebkitBackdropFilter: isTeslaBrowser ? undefined : 'blur(8px)',
      }}
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background:   'rgba(8,13,32,0.98)',
          border:       '1px solid rgba(139,66,255,0.40)',
          borderRadius: 16,
          width:        'min(400px, calc(100vw - 24px))',
          maxHeight:    'calc(100vh - 100px)',
          display:      'flex',
          flexDirection: 'column',
          overflow:     'hidden',
          boxShadow:    '0 0 40px rgba(139,66,255,0.25)',
        }}
      >
        {/* Header */}
        <div style={{
          padding:       '12px 16px',
          borderBottom:  '1px solid rgba(139,66,255,0.20)',
          display:       'flex',
          alignItems:    'center',
          justifyContent: 'space-between',
          flexShrink:    0,
        }}>
          <div>
            <span style={{
              fontSize: 11, fontWeight: 800, letterSpacing: '0.12em',
              textTransform: 'uppercase', color: '#8B42FF',
            }}>
              🏆 Driver Leaderboard
            </span>
            <div style={{ fontSize: 9, color: '#5A6A8E', marginTop: 2, letterSpacing: '0.06em' }}>
              TOP 50 — REFRESHED EVERY 5 MIN
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'rgba(255,255,255,0.08)', border: 'none',
              borderRadius: 8, color: '#A8B2D1', fontSize: 16,
              width: 32, height: 32, cursor: 'pointer', display: 'flex',
              alignItems: 'center', justifyContent: 'center',
            }}
          >
            ✕
          </button>
        </div>

        {/* My rank row (sticky) */}
        {myEmail && (
          <div style={{
            padding:      '8px 16px',
            background:   'rgba(139,66,255,0.10)',
            borderBottom: '1px solid rgba(139,66,255,0.15)',
            flexShrink:   0,
          }}>
            <LeaderboardRow
              rank={myRank ?? '—'}
              name={myName ? `${myName.split(' ')[0]} (ти)` : '(ти)'}
              xp={myXP}
              level={myLevel}
              isMe
            />
          </div>
        )}

        {/* Entries */}
        <div style={{ overflowY: 'auto', flex: 1 }}>
          {loading ? (
            <div style={{
              padding: 32, textAlign: 'center',
              color: '#5A6A8E', fontSize: 11, letterSpacing: '0.08em',
            }}>
              ЗАРЕЖДА…
            </div>
          ) : entries.length === 0 ? (
            <div style={{
              padding: 32, textAlign: 'center',
              color: '#5A6A8E', fontSize: 11,
            }}>
              Все още няма данни. Изпрати репорт за да влезеш в класацията!
            </div>
          ) : (
            entries.map((e) => (
              <div
                key={e.rank}
                style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}
              >
                <LeaderboardRow
                  rank={e.rank}
                  name={e.name}
                  xp={e.xp}
                  level={e.level}
                  isMe={false}
                />
              </div>
            ))
          )}
        </div>

        {/* Footer */}
        <div style={{
          padding:     '8px 16px',
          borderTop:   '1px solid rgba(139,66,255,0.15)',
          flexShrink:  0,
          textAlign:   'center',
        }}>
          <span style={{ fontSize: 8, color: '#3A4A6E', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
            XP за: репорт +50 · потвърждение +10 · дневен бонус +20
          </span>
        </div>
      </div>
    </div>
  )
}

function LeaderboardRow({
  rank, name, xp, level, isMe,
}: {
  rank: number | string; name: string; xp: number; level: number; isMe: boolean
}) {
  const color = levelColor(level)
  const medal = rank === 1 ? '🥇' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : null

  return (
    <div style={{
      padding:    '8px 16px',
      display:    'flex',
      alignItems: 'center',
      gap:        10,
      background: isMe ? 'rgba(139,66,255,0.08)' : undefined,
    }}>
      {/* Rank */}
      <span style={{
        fontSize:      10,
        fontWeight:    700,
        color:         medal ? undefined : '#5A6A8E',
        minWidth:      28,
        textAlign:     'center',
        letterSpacing: '0.04em',
      }}>
        {medal ?? `#${rank}`}
      </span>

      {/* Level badge */}
      <span style={{
        fontSize:      8,
        fontWeight:    800,
        color,
        background:    `${color}18`,
        border:        `1px solid ${color}40`,
        borderRadius:  4,
        padding:       '1px 5px',
        letterSpacing: '0.08em',
        flexShrink:    0,
      }}>
        Lv.{level}
      </span>

      {/* Name */}
      <span style={{
        flex:          1,
        fontSize:      11,
        fontWeight:    isMe ? 700 : 500,
        color:         isMe ? '#E8ECF5' : '#A8B2D1',
        overflow:      'hidden',
        textOverflow:  'ellipsis',
        whiteSpace:    'nowrap',
      }}>
        {name}
      </span>

      {/* Title */}
      <span style={{
        fontSize:      8,
        color:         color,
        letterSpacing: '0.07em',
        textTransform: 'uppercase',
        flexShrink:    0,
      }}>
        {levelLabel(level)}
      </span>

      {/* XP */}
      <span style={{
        fontSize:           11,
        fontWeight:         700,
        color:              '#E8ECF5',
        fontVariantNumeric: 'tabular-nums',
        flexShrink:         0,
        minWidth:           52,
        textAlign:          'right',
      }}>
        {xp.toLocaleString()}
      </span>
    </div>
  )
}
