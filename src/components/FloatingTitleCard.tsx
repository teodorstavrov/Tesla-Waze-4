// ─── Top-left branding card ─────────────────────────────────────────────
import { useSyncExternalStore } from 'react'
import { routeStore } from '@/features/route/routeStore'
import { gtaModeStore } from '@/features/gta/gtaModeStore'
import { openRatingModal } from '@/components/RatingModal'
import { openSupportModal } from '@/components/SupportModal'
import { openLockSoundModal } from '@/components/LockSoundModal'
import { isTeslaBrowser, isPreviewEnvironment } from '@/lib/browser'
import { t, getLang, langStore } from '@/lib/locale'

export function FloatingTitleCard() {
  useSyncExternalStore(langStore.subscribe.bind(langStore), getLang, getLang)
  const routeActive = useSyncExternalStore(
    routeStore.subscribe.bind(routeStore),
    () => routeStore.getState().status === 'ok',
    () => false,
  )
  const gtaActive = useSyncExternalStore(
    gtaModeStore.subscribe.bind(gtaModeStore),
    () => gtaModeStore.isActive(),
    () => false,
  )

  return (
    <div
      className="floating-title-card"
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
      {/* Standard logo — hidden in GTA mode (Vice City logo shown by GTAHud) */}
      {!gtaActive && (
        <img
          src="/new-medium_tran_blue.png"
          alt="TesRadar"
          style={{ height: 'clamp(36px, 6vh, 54px)', width: 'auto', display: 'block', borderRadius: 12 }}
        />
      )}

      {/* Rating/Support/Lock buttons — in GTA mode these live in GTAHud next to the logo */}
      {!gtaActive && !routeActive && (
        <>
          <button
            onClick={openRatingModal}
            title={t('controls.rateApp')}
            aria-label={t('controls.rateApp')}
            style={{
              width: 'clamp(28px, 4vh, 42px)', height: 'clamp(28px, 4vh, 42px)',
              borderRadius: 10,
              background: isTeslaBrowser ? 'rgba(13,13,19,0.97)' : 'rgba(18,18,26,0.82)',
              border: '1px solid rgba(255,255,255,0.14)',
              backdropFilter: isTeslaBrowser ? undefined : 'blur(10px)',
              WebkitBackdropFilter: isTeslaBrowser ? undefined : 'blur(10px)',
              color: '#fbbf24',
              fontSize: 'clamp(14px, 2.2vh, 20px)',
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
          <button
            onClick={openSupportModal}
            title={t('controls.support')}
            aria-label={t('controls.support')}
            style={{
              width: 'clamp(28px, 4vh, 42px)', height: 'clamp(28px, 4vh, 42px)',
              borderRadius: 10,
              background: isTeslaBrowser ? 'rgba(13,13,19,0.97)' : 'rgba(18,18,26,0.82)',
              border: '1px solid rgba(255,255,255,0.14)',
              backdropFilter: isTeslaBrowser ? undefined : 'blur(10px)',
              WebkitBackdropFilter: isTeslaBrowser ? undefined : 'blur(10px)',
              color: '#f87171',
              fontSize: 'clamp(13px, 2vh, 18px)',
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
            ♥
          </button>
          <button
            onClick={openLockSoundModal}
            title="Tesla Lock Sounds"
            aria-label="Tesla Lock Sounds"
            style={{
              width: 'clamp(28px, 4vh, 42px)', height: 'clamp(28px, 4vh, 42px)',
              borderRadius: 10,
              background: isTeslaBrowser ? 'rgba(13,13,19,0.97)' : 'rgba(18,18,26,0.82)',
              border: '1px solid rgba(255,255,255,0.14)',
              backdropFilter: isTeslaBrowser ? undefined : 'blur(10px)',
              WebkitBackdropFilter: isTeslaBrowser ? undefined : 'blur(10px)',
              color: 'rgba(255,255,255,0.75)',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              touchAction: 'manipulation',
              boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
              opacity: 0.5,
            }}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none"
              stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
              <path d="M13.73 21a2 2 0 0 1-3.46 0" />
            </svg>
          </button>

          {/* GTA VI Edition toggle — preview only */}
          {isPreviewEnvironment && (
            <button
              onClick={gtaModeStore.toggle}
              aria-label="Switch to GTA VI Edition Mode"
              aria-pressed={false}
              style={{
                height: 'clamp(28px, 4vh, 42px)',
                padding: '0 10px',
                borderRadius: 10,
                background: 'linear-gradient(135deg, rgba(139,66,255,0.18) 0%, rgba(243,41,167,0.12) 100%)',
                border: '1px solid rgba(139,66,255,0.50)',
                cursor: 'pointer',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 1,
                touchAction: 'manipulation',
                opacity: 0.75,
              }}
            >
              <span style={{ fontSize: 7, fontWeight: 900, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#8B42FF', lineHeight: 1 }}>GTA VI</span>
              <span style={{ fontSize: 6, fontWeight: 700, letterSpacing: '0.10em', textTransform: 'uppercase', color: '#F329A7', lineHeight: 1 }}>Edition</span>
            </button>
          )}
        </>
      )}
    </div>
  )
}
