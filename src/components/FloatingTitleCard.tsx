// ─── Top-left branding card ────────────────────────────────────────────
import { useSyncExternalStore } from 'react'
import { routeStore } from '@/features/route/routeStore'
import { openRatingModal } from '@/components/RatingModal'
import { speedLimitStore } from '@/features/speedlimit/speedLimitStore'
import { gpsStore } from '@/features/gps/gpsStore'
import { isTeslaBrowser } from '@/lib/browser'
import { t, getLang, langStore } from '@/lib/locale'

export function FloatingTitleCard() {
  useSyncExternalStore(langStore.subscribe.bind(langStore), getLang, getLang)
  const routeActive = useSyncExternalStore(
    routeStore.subscribe.bind(routeStore),
    () => routeStore.getState().status === 'ok',
    () => false,
  )
  const limit = useSyncExternalStore(
    speedLimitStore.subscribe.bind(speedLimitStore),
    () => speedLimitStore.getLimit(),
    () => null,
  )
  // Only show sign when GPS is active (avoids phantom sign on first load)
  const hasGps = useSyncExternalStore(
    gpsStore.onPosition.bind(gpsStore),
    () => gpsStore.getPosition() !== null,
    () => false,
  )

  // Hide when navigating — TurnInstruction occupies this slot
  if (routeActive) return null

  return (
    <div
      style={{
        position: 'absolute',
        top: 12,
        left: 12,
        zIndex: 400,
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        userSelect: 'none',
        WebkitUserSelect: 'none',
      }}
    >
      <img
        src="/new-medium_tran_blue.png"
        alt="Tesla RADAR"
        style={{ height: 54, width: 'auto', display: 'block', borderRadius: 12 }}
      />
      <button
        onClick={openRatingModal}
        title={t('controls.rateApp')}
        aria-label={t('controls.rateApp')}
        style={{
          width: 42, height: 42,
          borderRadius: 10,
          background: isTeslaBrowser ? 'rgba(13,13,19,0.97)' : 'rgba(18,18,26,0.82)',
          border: '1px solid rgba(255,255,255,0.14)',
          backdropFilter: isTeslaBrowser ? undefined : 'blur(10px)',
          WebkitBackdropFilter: isTeslaBrowser ? undefined : 'blur(10px)',
          color: '#fbbf24',
          fontSize: 20,
          lineHeight: 1,
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          touchAction: 'manipulation',
          boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
          opacity: 0.5,
        }}
      >
        ★
      </button>

      {/* ── Speed limit sign ─────────────────────────────────────────── */}
      {hasGps && (
        <div
          aria-label={limit != null ? `Speed limit ${limit} km/h` : 'Speed limit unknown'}
          style={{
            width:          52,
            height:         52,
            borderRadius:   '50%',
            background:     '#fff',
            border:         '4px solid #e00',
            boxShadow:      '0 2px 10px rgba(0,0,0,0.45)',
            display:        'flex',
            flexDirection:  'column',
            alignItems:     'center',
            justifyContent: 'center',
            transition:     'opacity 0.3s',
            opacity:        limit != null ? 1 : 0.25,
            flexShrink:     0,
          }}
        >
          {limit != null ? (
            <span style={{
              fontSize:           limit >= 100 ? 16 : 19,
              fontWeight:         900,
              color:              '#111',
              letterSpacing:      '-0.5px',
              fontVariantNumeric: 'tabular-nums',
              lineHeight:         1,
              fontFamily:         'system-ui, sans-serif',
            }}>
              {limit}
            </span>
          ) : (
            <span style={{ fontSize: 11, color: '#bbb', lineHeight: 1 }}>—</span>
          )}
        </div>
      )}
    </div>
  )
}
