// ─── Onboarding overlay ─────────────────────────────────────────────────
// Shown only on first visit (localStorage flag). One tap dismisses it.
// Designed for Tesla touchscreen — large text, single action.

const STORAGE_KEY = 'teslaradar-onboarded'

export function Onboarding() {
  // Render nothing if already dismissed
  if (typeof localStorage !== 'undefined' && localStorage.getItem(STORAGE_KEY)) {
    return null
  }

  function dismiss() {
    localStorage.setItem(STORAGE_KEY, '1')
    // Force re-render by removing the element directly
    const el = document.getElementById('onboarding-root')
    if (el) el.style.display = 'none'
  }

  return (
    <div
      id="onboarding-root"
      // eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions
      onClick={dismiss}
      style={{
        position:   'fixed',
        inset:       0,
        zIndex:      900,
        background: 'rgba(0,0,0,0.82)',
        backdropFilter: 'blur(8px)',
        WebkitBackdropFilter: 'blur(8px)',
        display:    'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding:    32,
        gap:        28,
        textAlign:  'center',
        touchAction: 'manipulation',
      }}
    >
      <div style={{ fontSize: 52 }}>⚡</div>

      <div style={{ fontSize: 24, fontWeight: 800, color: '#fff', letterSpacing: '-0.3px' }}>
        Добре дошли в Tesla Radar
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 14, maxWidth: 360 }}>
        <Tip icon="🗺️" text="Виждате EV зарядни станции в България — докоснете маркер за детайли" />
        <Tip icon="⚠️" text="Докоснете Report за да споделите пътен инцидент, полиция или задръстване" />
        <Tip icon="🔊" text="Докоснете екрана за да активирате гласовите предупреждения" />
        <Tip icon="🔍" text="Потърсете адрес или зарядна станция с лентата за търсене" />
      </div>

      <div style={{
        marginTop:   8,
        padding:    '14px 40px',
        borderRadius: 12,
        background:  '#e31937',
        color:       '#fff',
        fontSize:    17,
        fontWeight:  700,
        letterSpacing: '0.01em',
      }}>
        Разбрах
      </div>

      <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.3)' }}>
        Докоснете навсякъде за продължение
      </div>
    </div>
  )
}

function Tip({ icon, text }: { icon: string; text: string }) {
  return (
    <div style={{
      display:    'flex',
      alignItems: 'flex-start',
      gap:         12,
      textAlign:  'left',
    }}>
      <span style={{ fontSize: 22, flexShrink: 0, lineHeight: 1.4 }}>{icon}</span>
      <span style={{ fontSize: 14, color: 'rgba(255,255,255,0.75)', lineHeight: 1.6 }}>{text}</span>
    </div>
  )
}
