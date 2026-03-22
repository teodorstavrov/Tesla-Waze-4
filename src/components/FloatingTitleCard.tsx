// ─── Top-left branding card ────────────────────────────────────────────
import { APP_NAME } from '@/lib/constants'

export function FloatingTitleCard() {
  return (
    <div
      className="glass"
      style={{
        position: 'absolute',
        top: 12,
        left: 12,
        zIndex: 400,
        padding: '9px 16px',
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        userSelect: 'none',
        WebkitUserSelect: 'none',
      }}
    >
      {/* Tesla-red lightning bolt */}
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path d="M13 2L4.5 13.5H11L10 22L19.5 10.5H13L13 2Z"
          fill="#e31937" stroke="#e31937" strokeWidth="0.5" strokeLinejoin="round" />
      </svg>
      <div>
        <div style={{ fontSize: 14, fontWeight: 700, letterSpacing: '0.04em', color: 'var(--text-primary)', lineHeight: 1.2 }}>
          {APP_NAME}
        </div>
        <div style={{ fontSize: 9, color: 'var(--text-secondary)', letterSpacing: '0.1em', textTransform: 'uppercase', marginTop: 1 }}>
          Bulgaria
        </div>
      </div>
    </div>
  )
}
