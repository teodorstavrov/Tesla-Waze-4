// ─── Top-left branding card ────────────────────────────────────────────
import { useSyncExternalStore } from 'react'
import { routeStore } from '@/features/route/routeStore'
import { openRatingModal } from '@/components/RatingModal'
import { isTeslaBrowser } from '@/lib/browser'

export function FloatingTitleCard() {
  const routeActive = useSyncExternalStore(
    routeStore.subscribe.bind(routeStore),
    () => routeStore.getState().status === 'ok',
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
        src="/new-medium.jpg"
        alt="Tesla RADAR"
        style={{ height: 54, width: 'auto', display: 'block', borderRadius: 12 }}
      />
      <button
        onClick={openRatingModal}
        title="Оцени приложението"
        aria-label="Оцени приложението"
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
        }}
      >
        ★
      </button>
    </div>
  )
}
