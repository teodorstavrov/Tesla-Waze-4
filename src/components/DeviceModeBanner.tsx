// ─── Desktop / mobile non-Tesla banner ──────────────────────────────────
// Shown once (localStorage-dismissed) to non-Tesla visitors suggesting
// they open the app in their Tesla's browser instead.

import { useState } from 'react'
import { isTeslaBrowser, isPhone } from '@/lib/browser'
import { getLang } from '@/lib/locale'

const LS_KEY = 'tesradar:banner-dismissed'

function isDismissed(): boolean {
  try { return localStorage.getItem(LS_KEY) === '1' } catch { return false }
}
function dismiss(): void {
  try { localStorage.setItem(LS_KEY, '1') } catch { /* quota */ }
}

const MESSAGES: Record<'desktop' | 'phone', Record<string, string>> = {
  desktop: {
    bg: '🚗 TesRadar е оптимизиран за Tesla — отвори tesradar.tech от браузъра на колата си и навигирай комфортно',
    en: '🚗 TesRadar is optimised for Tesla — open tesradar.tech in your car\'s browser for the full experience',
    no: '🚗 TesRadar er optimalisert for Tesla — åpne tesradar.tech i bilens nettleser',
    sv: '🚗 TesRadar är optimerad för Tesla — öppna tesradar.tech i bilens webbläsare',
    fi: '🚗 TesRadar on optimoitu Teslalle — avaa tesradar.tech auton selaimessa',
    nl: '🚗 TesRadar is geoptimaliseerd voor Tesla — open tesradar.tech in de browser van je auto',
  },
  phone: {
    bg: '🚗 Приложението е оптимизирано за Tesla — отвори tesradar.tech от браузъра на колата си',
    en: '🚗 This app is built for Tesla — open tesradar.tech in your car\'s browser',
    no: '🚗 Denne appen er laget for Tesla — åpne tesradar.tech i bilens nettleser',
    sv: '🚗 Appen är byggd för Tesla — öppna tesradar.tech i bilens webbläsare',
    fi: '🚗 Sovellus on tehty Teslalle — avaa tesradar.tech auton selaimessa',
    nl: '🚗 Deze app is gebouwd voor Tesla — open tesradar.tech in de browser van je auto',
  },
}

export function DeviceModeBanner() {
  const [visible, setVisible] = useState(() => !isTeslaBrowser && !isDismissed())
  if (!visible) return null

  const lang    = getLang()
  const context = isPhone ? 'phone' : 'desktop'
  const msg     = MESSAGES[context][lang] ?? MESSAGES[context].en!

  function close() {
    dismiss()
    setVisible(false)
  }

  return (
    <div style={{
      position:   'fixed',
      top:        0,
      left:       0,
      right:      0,
      zIndex:     2000,
      background: 'rgba(10,10,20,0.95)',
      borderBottom: '1px solid rgba(99,102,241,0.35)',
      display:    'flex',
      alignItems: 'center',
      padding:    '0 12px',
      height:     42,
      backdropFilter: 'blur(8px)',
      WebkitBackdropFilter: 'blur(8px)',
    }}>
      <span style={{
        flex: 1,
        fontSize: isPhone ? 12 : 13,
        color: 'rgba(255,255,255,0.85)',
        lineHeight: 1.3,
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        whiteSpace: 'nowrap',
        paddingRight: 8,
      }}>
        {msg}
      </span>
      <button
        onClick={close}
        aria-label="Затвори"
        style={{
          background: 'none',
          border: 'none',
          color: 'rgba(255,255,255,0.5)',
          fontSize: 18,
          cursor: 'pointer',
          padding: '4px 6px',
          flexShrink: 0,
          lineHeight: 1,
          touchAction: 'manipulation',
        }}
      >
        ✕
      </button>
    </div>
  )
}
